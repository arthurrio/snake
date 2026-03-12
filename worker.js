'use strict';
const COLS = 20, ROWS = 20, CELL = 28, TOTAL = COLS * ROWS;
let tickMs = 120;      // set dynamically from 'start' message

let canvas, ctx;
let snake, prevSnake, dir, apple, score = 0, best = 0;
let running = false, lastTick = 0;
let dirQueue = [];

// ── Effects state ────────────────────────────────────────────────────────────
let particles     = [];  // apple explosion particles
let floatingTexts = [];  // score popup texts
let currentTs     = 0;   // latest frame timestamp (for effects delta-time)
let prevTs        = 0;   // previous frame timestamp

// Combo: eating apples within COMBO_WINDOW_MS of each other chains the combo
const COMBO_WINDOW_MS = 3000;
let combo     = 0;
let lastEatTs = 0;

// Death flash: snake flashes red for DEATH_MS before showing overlay
const DEATH_MS   = 700;
let dying        = false;
let dyingStartTs = 0;

// ── Message router ───────────────────────────────────────────────────────────
self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'init':
      canvas = data.canvas;
      ctx    = canvas.getContext('2d');
      buildGridCache();
      drawEmpty();
      break;
    case 'start':
      tickMs   = data.tickMs;
      initGame();
      running  = true;
      lastTick = data.ts;
      draw(0);
      break;
    case 'frame': {
      const dt = prevTs ? data.ts - prevTs : 0;
      prevTs    = data.ts;
      currentTs = data.ts;

      // Death flash animation — runs independently of game logic
      if (dying) {
        updateParticles(dt);
        updateFloatingTexts(dt);
        drawDying(data.ts);
        if (data.ts - dyingStartTs >= DEATH_MS) {
          dying = false;
          self.postMessage({ type: 'end', won: false, score, length: snake.length });
        }
        break;
      }

      if (!running) break;
      if (data.dir) enqueue(data.dir);

      if (data.ts - lastTick > tickMs * 8) lastTick = data.ts - tickMs;
      while (running && data.ts - lastTick >= tickMs) {
        prevSnake = snake.map(s => ({ x: s.x, y: s.y }));
        lastTick += tickMs;
        tick();
        postHud(); // keep head/apple positions current for every game step
      }

      updateParticles(dt);
      updateFloatingTexts(dt);

      if (running) {
        const t = (data.ts - lastTick) / tickMs;
        draw(t);
      }
      break;
    }
  }
};

// ── Direction queue ──────────────────────────────────────────────────────────
function enqueue(d) {
  const ref = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
  if (d.x === -ref.x && d.y === -ref.y) return; // block 180° reversal
  if (d.x ===  ref.x && d.y ===  ref.y) return; // ignore duplicate
  if (dirQueue.length < 3) dirQueue.push(d);
}

// ── Init ─────────────────────────────────────────────────────────────────────
function initGame() {
  dir           = { x: 1, y: 0 };
  snake         = [{ x: COLS >> 1, y: ROWS >> 1 }];
  prevSnake     = [{ x: COLS >> 1, y: ROWS >> 1 }];
  score         = 0;
  combo         = 1;
  lastEatTs     = 0;
  dirQueue      = [];
  particles     = [];
  floatingTexts = [];
  dying         = false;
  spawnApple();
  postHud();
}

// ── Apple ────────────────────────────────────────────────────────────────────
function spawnApple() {
  if (snake.length >= TOTAL) { apple = null; return; }
  const occ = new Set(snake.map(s => s.y * COLS + s.x));
  let idx;
  do { idx = (Math.random() * TOTAL) | 0; } while (occ.has(idx));
  apple = { x: idx % COLS, y: (idx / COLS) | 0 };
}

// ── Tick (one game step) ─────────────────────────────────────────────────────
function tick() {
  if (dirQueue.length) dir = dirQueue.shift();

  // Wrap around: crossing a wall teleports the snake to the opposite side
  const head = {
    x: ((snake[0].x + dir.x) + COLS) % COLS,
    y: ((snake[0].y + dir.y) + ROWS) % ROWS,
  };

  if (snake.some(s => s.x === head.x && s.y === head.y)) {
    endGame(false); return;
  }

  snake.unshift(head);

  if (apple && head.x === apple.x && head.y === apple.y) {
    const timeSinceLast = currentTs - lastEatTs;
    combo = (lastEatTs > 0 && timeSinceLast < COMBO_WINDOW_MS) ? combo + 1 : 1;
    lastEatTs = currentTs;

    const points = combo;
    score += points;
    if (score > best) best = score;

    const ax = apple.x * CELL + CELL / 2;
    const ay = apple.y * CELL + CELL / 2;
    spawnParticles(ax, ay);

    const label = combo > 1 ? `+${points} x${combo}` : `+${points}`;
    floatingTexts.push({ x: ax, y: ay, text: label, life: 1.0, vy: -1.2, combo });

    postHud();
    spawnApple();
  } else {
    snake.pop();
  }

  if (snake.length === TOTAL) { draw(1); endGame(true); }
}

// ── End ───────────────────────────────────────────────────────────────────────
function endGame(won) {
  running = false;
  if (won) {
    self.postMessage({ type: 'end', won: true, score, length: snake.length });
  } else {
    dying        = true;
    dyingStartTs = currentTs;
  }
}

// ── Particles ─────────────────────────────────────────────────────────────────
const PARTICLE_COLORS = ['#f87171','#fb923c','#fbbf24','#f43f5e','#fff'];

function spawnParticles(cx, cy) {
  for (let i = 0; i < 14; i++) {
    const angle = (Math.PI * 2 * i / 14) + Math.random() * 0.4;
    const speed = 1.5 + Math.random() * 2.5;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      decay: 0.018 + Math.random() * 0.018,
      r: 2 + Math.random() * 3,
      color: PARTICLE_COLORS[(Math.random() * PARTICLE_COLORS.length) | 0],
    });
  }
}

function updateParticles(dt) {
  const step = dt / 16;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x    += p.vx * step;
    p.y    += p.vy * step;
    p.vy   += 0.08 * step;
    p.life -= p.decay * step;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ── Floating texts ────────────────────────────────────────────────────────────
function updateFloatingTexts(dt) {
  const step = dt / 16;
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const f = floatingTexts[i];
    f.y    += f.vy * step;
    f.life -= 0.018 * step;
    if (f.life <= 0) floatingTexts.splice(i, 1);
  }
}

function drawFloatingTexts() {
  floatingTexts.forEach(f => {
    ctx.globalAlpha = f.life;
    ctx.font        = f.combo > 1
      ? `bold ${13 + f.combo * 1.5}px "Courier New"`
      : 'bold 13px "Courier New"';
    ctx.textAlign  = 'center';
    ctx.fillStyle  = f.combo > 1 ? '#facc15' : '#fff';
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign   = 'left';
}

// ── Death flash ───────────────────────────────────────────────────────────────
function drawDying(ts) {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawApple();
  drawParticles();

  const elapsed = ts - dyingStartTs;
  const phase   = Math.sin(elapsed / 55 * Math.PI);
  const pad = 2, w = CELL - pad * 2, h = CELL - pad * 2;
  snake.forEach(seg => {
    const x = seg.x * CELL + pad;
    const y = seg.y * CELL + pad;
    ctx.fillStyle   = phase > 0 ? '#ef4444' : '#7f1d1d';
    ctx.globalAlpha = 0.6 + Math.abs(phase) * 0.4;
    roundRect(x, y, w, h, 4); ctx.fill();
  });
  ctx.globalAlpha = 1;
  drawFloatingTexts();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw(t = 1) {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawApple();
  drawSnakeInterp(t);
  drawParticles();
  drawFloatingTexts();
}

function drawEmpty() {
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
}

let gridCache = null;

function buildGridCache() {
  gridCache = new OffscreenCanvas(COLS * CELL, ROWS * CELL);
  const gCtx = gridCache.getContext('2d');
  gCtx.strokeStyle = '#1a1a1a';
  gCtx.lineWidth   = 0.5;
  for (let x = 0; x <= COLS; x++) {
    gCtx.beginPath(); gCtx.moveTo(x * CELL, 0); gCtx.lineTo(x * CELL, ROWS * CELL); gCtx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    gCtx.beginPath(); gCtx.moveTo(0, y * CELL); gCtx.lineTo(COLS * CELL, y * CELL); gCtx.stroke();
  }
}

function drawGrid() {
  ctx.drawImage(gridCache, 0, 0);
}

function drawApple() {
  if (!apple) return;
  const ax = apple.x * CELL + CELL / 2;
  const ay = apple.y * CELL + CELL / 2;
  const r  = CELL / 2 - 3;
  ctx.beginPath(); ctx.arc(ax, ay, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f87171'; ctx.fill();
  ctx.beginPath(); ctx.arc(ax - r * 0.25, ay - r * 0.25, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
}

function drawSnakeInterp(t) {
  // Smoothstep easing: 3t² - 2t³
  const s = t * t * (3 - 2 * t);

  const len = snake.length;
  const pad = 2;
  const w   = CELL - pad * 2;
  const h   = CELL - pad * 2;

  snake.forEach((seg, i) => {
    const prev = prevSnake[i] ?? seg;
    const rx = (prev.x + (seg.x - prev.x) * s) * CELL + pad;
    const ry = (prev.y + (seg.y - prev.y) * s) * CELL + pad;

    const brightness = 1 - i / len;
    const g = (174 + brightness * 60) | 0;
    ctx.fillStyle = i === 0 ? '#a3e635' : `rgb(30,${g},60)`;
    roundRect(rx, ry, w, h, 4); ctx.fill();
    if (i === 0) drawEyes(rx, ry, w, h);
  });

  if (prevSnake.length === snake.length && snake.length > 1) {
    const tail = prevSnake[prevSnake.length - 1];
    const ref  = prevSnake[prevSnake.length - 2];
    const rx = (tail.x + (ref.x - tail.x) * s) * CELL + pad;
    const ry = (tail.y + (ref.y - tail.y) * s) * CELL + pad;
    ctx.globalAlpha = 1 - s;
    ctx.fillStyle = 'rgb(30,174,60)';
    roundRect(rx, ry, w, h, 4); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawEyes(x, y, w, h) {
  ctx.fillStyle = '#0f0f0f';
  const ex = CELL * 0.22, ey = CELL * 0.22, er = 2.5;
  let e1x, e1y, e2x, e2y;
  if      (dir.x ===  1) { e1x = x+w-ex; e1y = y+ey;   e2x = x+w-ex; e2y = y+h-ey; }
  else if (dir.x === -1) { e1x = x+ex;   e1y = y+ey;   e2x = x+ex;   e2y = y+h-ey; }
  else if (dir.y === -1) { e1x = x+ex;   e1y = y+ey;   e2x = x+w-ex; e2y = y+ey;   }
  else                   { e1x = x+ex;   e1y = y+h-ey; e2x = x+w-ex; e2y = y+h-ey; }
  ctx.beginPath(); ctx.arc(e1x, e1y, er, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(e2x, e2y, er, 0, Math.PI * 2); ctx.fill();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y,   x+w, y+r);
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h,  x, y+h-r);
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y,    x+r, y);
  ctx.closePath();
}

function postHud() {
  self.postMessage({
    type: 'hud', score, best, length: snake.length, combo,
    // Head and apple positions exposed so E2E tests can navigate toward the apple
    headX: snake[0].x, headY: snake[0].y,
    appleX: apple?.x ?? -1, appleY: apple?.y ?? -1,
  });
}
