// ── Constants ─────────────────────────────────────────────────────────────────
const COLS  = 20;
const ROWS  = 20;
const CELL  = 28;
const TOTAL = COLS * ROWS;

// ── DOM ───────────────────────────────────────────────────────────────────────
const canvas       = document.getElementById('canvas');
const overlay      = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMsg   = document.getElementById('overlay-msg');
const startBtn     = document.getElementById('start-btn');
const scoreEl      = document.getElementById('score');
const bestEl       = document.getElementById('best');
const cellsEl      = document.getElementById('cells');
const gpStatus     = document.getElementById('gamepad-status');

canvas.width  = COLS * CELL;
canvas.height = ROWS * CELL;

// ── Local ranking (localStorage) ─────────────────────────────────────────────
const LS_KEY = 'snake_top5';

function loadRanking() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) ?? []; }
  catch { return []; }
}

function saveToRanking(score, length) {
  if (score === 0) return loadRanking();
  const entries = loadRanking();
  entries.push({ score, length, date: new Date().toLocaleDateString('pt-BR') });
  entries.sort((a, b) => b.score - a.score);
  const top5 = entries.slice(0, 5);
  localStorage.setItem(LS_KEY, JSON.stringify(top5));
  return top5;
}

function renderRanking(entries, highlightScore = null) {
  const el = document.getElementById('ranking');
  if (!entries.length) { el.innerHTML = ''; return; }
  const medals = ['🥇', '🥈', '🥉'];
  let marked = false;
  const items = entries.map((e, i) => {
    const isNew = !marked && highlightScore !== null && e.score === highlightScore;
    if (isNew) marked = true;
    const pos = medals[i] ?? `${i + 1}.`;
    return `<li${isNew ? ' class="new"' : ''}>
      <span><span class="pos">${pos}</span><span class="pts">${e.score}</span></span>
      <span class="meta">${e.length} cells · ${e.date}</span>
    </li>`;
  }).join('');
  el.innerHTML = `<h3>TOP 5</h3><ol>${items}</ol>`;
}

// ── Worker ────────────────────────────────────────────────────────────────────
const worker = new Worker('./worker.js');

const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);

// Restore best score and ranking from previous sessions
const savedRanking = loadRanking();
if (savedRanking.length) {
  bestEl.textContent = savedRanking[0].score;
  renderRanking(savedRanking);
}

// ── Worker → main thread messages ────────────────────────────────────────────
worker.onmessage = ({ data }) => {
  if (data.type === 'hud') {
    scoreEl.textContent = data.score;
    bestEl.textContent  = data.best;
    cellsEl.textContent = `${data.length} / ${TOTAL}`;
    const comboEl = document.getElementById('combo');
    comboEl.textContent = `x${data.combo}`;
    comboEl.classList.toggle('hot', data.combo > 1);
    if (data.combo > 1) { clearTimeout(comboEl._t); comboEl._t = setTimeout(() => comboEl.classList.remove('hot'), 300); }
  } else if (data.type === 'end') {
    if (data.won) {
      overlayTitle.textContent = 'YOU WIN!';
      overlayTitle.style.color = '#facc15';
      overlayMsg.textContent   = `Perfect score! You filled all ${TOTAL} cells.`;
    } else {
      overlayTitle.textContent = 'GAME OVER';
      overlayTitle.style.color = '#f87171';
      overlayMsg.textContent   = `Score: ${data.score}  —  Snake length: ${data.length}`;
    }
    const top5 = saveToRanking(data.score, data.length);
    renderRanking(top5, data.score);
    bestEl.textContent    = top5[0]?.score ?? 0;
    startBtn.textContent  = 'PLAY AGAIN';
    overlay.style.display = 'flex';
    rafActive = false;
  }
};

// ── Keyboard input ────────────────────────────────────────────────────────────
const KEY_DIR = {
  ArrowUp:    { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
  ArrowDown:  { x: 0, y:  1 }, s: { x: 0, y:  1 }, S: { x: 0, y:  1 },
  ArrowLeft:  { x:-1, y:  0 }, a: { x:-1, y:  0 }, A: { x:-1, y:  0 },
  ArrowRight: { x: 1, y:  0 }, d: { x: 1, y:  0 }, D: { x: 1, y:  0 },
};

let pendingDir = null;

document.addEventListener('keydown', e => {
  const d = KEY_DIR[e.key];
  if (!d) return;
  pendingDir = d;
  e.preventDefault();
});

// ── Gamepad API ───────────────────────────────────────────────────────────────
window.addEventListener('gamepadconnected',    () => { gpStatus.textContent = 'GAMEPAD'; gpStatus.classList.add('on'); });
window.addEventListener('gamepaddisconnected', () => { gpStatus.textContent = 'NO GAMEPAD'; gpStatus.classList.remove('on'); });

function readGamepad() {
  const gp = [...(navigator.getGamepads?.() ?? [])].find(g => g?.connected);
  if (!gp) return null;
  if (gp.buttons[12]?.pressed || gp.axes[1] < -0.5) return { x:  0, y: -1 };
  if (gp.buttons[13]?.pressed || gp.axes[1] >  0.5) return { x:  0, y:  1 };
  if (gp.buttons[14]?.pressed || gp.axes[0] < -0.5) return { x: -1, y:  0 };
  if (gp.buttons[15]?.pressed || gp.axes[0] >  0.5) return { x:  1, y:  0 };
  return null;
}

// ── requestAnimationFrame loop ────────────────────────────────────────────────
let rafActive = false;

function rafLoop(ts) {
  if (!rafActive) return;
  const dir = pendingDir ?? readGamepad();
  pendingDir = null;

  worker.postMessage({ type: 'frame', ts, dir });
  requestAnimationFrame(rafLoop);
}

// ── Speed selector ────────────────────────────────────────────────────────────
function levelToTickMs(level) {
  return Math.round(250 - (level - 1) * 200 / 9);
}

let selectedLevel = 5;

document.getElementById('speed-btns').addEventListener('click', e => {
  const btn = e.target.closest('[data-level]');
  if (!btn) return;
  selectedLevel = Number(btn.dataset.level);
  document.querySelectorAll('#speed-btns button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
});

// ── Touch / swipe input ───────────────────────────────────────────────────────
let touchStartX = 0, touchStartY = 0;

canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    pendingDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  } else {
    pendingDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }
  e.preventDefault();
}, { passive: false });

// ── D-pad input ───────────────────────────────────────────────────────────────
const DPAD_DIRS = {
  'dpad-up':    { x: 0, y: -1 },
  'dpad-down':  { x: 0, y:  1 },
  'dpad-left':  { x: -1, y: 0 },
  'dpad-right': { x:  1, y: 0 },
};

document.getElementById('dpad').addEventListener('pointerdown', e => {
  const btn = e.target.closest('[id^="dpad-"]');
  if (!btn) return;
  pendingDir = DPAD_DIRS[btn.id] ?? null;
  e.preventDefault();
});

// ── Start / restart ───────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  rafActive = true;
  requestAnimationFrame(ts => {
    worker.postMessage({ type: 'start', ts, tickMs: levelToTickMs(selectedLevel) });
    requestAnimationFrame(rafLoop);
  });
});
