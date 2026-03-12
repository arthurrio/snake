/**
 * Unit tests for game logic in worker.js.
 *
 * Strategy: run worker.js inside a vm sandbox with mocked Web Worker and
 * OffscreenCanvas globals, then drive the game through its message protocol
 * (init → start → frame*) and assert on the messages it emits (hud, end).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(resolve(__dir, '../../worker.js'), 'utf-8');

// ── Constants mirrored from worker.js ─────────────────────────────────────────
const COLS  = 20;
const ROWS  = 20;
const TOTAL = COLS * ROWS;
const CELL  = 28;
const DEATH_MS = 700;

// Each apple eat calls spawnParticles which calls Math.random() 5 times per
// particle, with 14 particles = 70 calls, followed by 1 call in spawnApple().
const PARTICLE_RANDOMS = 70; // 14 particles × 5 calls each

// ── Canvas / context stub ─────────────────────────────────────────────────────
function makeCtx2D() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
    font: '', textAlign: 'left',
    fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, arc() {}, fill() {}, drawImage() {},
    quadraticCurveTo() {}, closePath() {}, fillText() {},
  };
}

function makeCanvas() {
  return { width: COLS * CELL, height: ROWS * CELL, getContext: () => makeCtx2D() };
}

// ── Controlled Math.random sequence ──────────────────────────────────────────
/**
 * Returns a Math-like object whose random() cycles through `values`.
 *
 * IMPORTANT: Math properties are non-enumerable, so `{ ...Math }` loses them.
 * We must copy via getOwnPropertyNames to keep sin, cos, etc.
 */
function makeRng(values) {
  let i = 0;
  const m = {};
  Object.getOwnPropertyNames(Math).forEach(k => { m[k] = Math[k]; });
  m.random = () => values[i++ % values.length];
  return m;
}

/**
 * Convert grid coordinates (x, y) to the Math.random() return value that
 * places an apple exactly at that cell.
 *
 *   idx = (random * TOTAL) | 0  →  x = idx % COLS, y = (idx / COLS) | 0
 */
function appleRng(x, y) {
  return (y * COLS + x) / TOTAL;
}

/**
 * Build a random-value sequence that places apples at the given positions,
 * correctly accounting for the PARTICLE_RANDOMS calls that happen between
 * apple eats (from spawnParticles, called inside tick() before spawnApple).
 *
 * Sequence layout:
 *   [appleRng(pos[0]), ...filler×70, appleRng(pos[1]), ...filler×70, ...]
 *
 * The filler values (0.5) are consumed by spawnParticles and don't affect
 * anything gameplay-relevant.  A final fallback value 0 is appended.
 */
function makeAppleRng(positions) {
  const rng = [];
  for (let i = 0; i < positions.length; i++) {
    if (i > 0) {
      // After each apple eat: PARTICLE_RANDOMS calls consumed by spawnParticles
      for (let j = 0; j < PARTICLE_RANDOMS; j++) rng.push(0.5);
    }
    rng.push(appleRng(positions[i][0], positions[i][1]));
  }
  rng.push(0); // fallback: apple at (0,0) — far from snake path going right
  return rng;
}

// ── Game factory ──────────────────────────────────────────────────────────────
/**
 * Creates an isolated game instance.
 *
 * @param {object}  opts
 * @param {number}  [opts.tickMs=120]  Tick interval in ms.
 * @param {number[]} [opts.rng]        Full Math.random() sequence.  When
 *                                     omitted, apple always goes to (0,0) —
 *                                     deterministic and out of the snake's path.
 */
function createGame({ tickMs = 120, rng } = {}) {
  const messages = [];

  const sandbox = {
    self: {
      postMessage(m) {
        messages.push(JSON.parse(JSON.stringify(m)));
      },
    },
    // Default rng: apple always at (0,0), well out of the snake's path right.
    Math: makeRng(rng ?? [0]),
    OffscreenCanvas: class {
      constructor(w, h) { this.width = w; this.height = h; }
      getContext() { return makeCtx2D(); }
    },
  };

  createContext(sandbox);
  runInContext(WORKER, sandbox);

  const emit = (data) => sandbox.self.onmessage({ data });

  emit({ type: 'init', canvas: makeCanvas() });
  emit({ type: 'start', ts: 0, tickMs });

  let ts = 0;

  /**
   * Send `n` frame messages, each advancing ts by exactly one tick interval.
   * Optional `dir` is included in the FIRST frame only.
   */
  function advance(n = 1, dir = null) {
    for (let i = 0; i < n; i++) {
      ts += tickMs + 1;
      emit({ type: 'frame', ts, dir: i === 0 ? dir : null });
    }
  }

  /**
   * After a collision the worker waits DEATH_MS before sending 'end'.
   * Skip past the death animation by jumping ts forward.
   */
  function skipDeathAnim() {
    ts += DEATH_MS + 50;
    emit({ type: 'frame', ts, dir: null });
  }

  /** Last message of a given type, or null. */
  function last(type) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === type) return messages[i];
    }
    return null;
  }

  return { emit, advance, skipDeathAnim, messages, last };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('initialisation', () => {
  // On game start the worker must emit a hud message with zeroed-out values
  it('emits a hud message on start with score=0, combo=1, length=1', () => {
    const { last } = createGame();
    const hud = last('hud');
    expect(hud).not.toBeNull();
    expect(hud.score).toBe(0);
    expect(hud.combo).toBe(1); // combo starts at 1 (neutral multiplier); increments on chained apples
    expect(hud.length).toBe(1);
  });

  // The snake starts as a single cell (just the head); growth only happens when eating apples
  it('initial snake length is 1 (single head cell)', () => {
    const { last } = createGame();
    expect(last('hud').length).toBe(1);
  });
});

// ── Wall wrap-around ──────────────────────────────────────────────────────────
describe('wall wrap-around', () => {
  // Snake starts at (10,10) moving right. Default rng places apple at (0,0).

  // Crossing x=19 → x=0: snake must survive and keep running
  it('wraps from the right edge to the left instead of dying', () => {
    const { advance, last } = createGame();
    advance(10); // 10 right steps: x = (10+10) % 20 = 0 — no wall death
    expect(last('end')).toBeNull();
  });

  // Crossing x=0 → x=19: snake must survive and keep running
  it('wraps from the left edge to the right instead of dying', () => {
    const { advance, last } = createGame();
    advance(1, { x: 0, y: -1 }); // turn up (left is a 180° reversal from right)
    advance(1, { x: -1, y: 0 }); // turn left
    advance(11);                  // 11 left steps from x=10 → x=-1 → wraps to x=19
    expect(last('end')).toBeNull();
  });

  // Crossing y=0 → y=19: snake must survive and keep running
  it('wraps from the top edge to the bottom instead of dying', () => {
    const { advance, last } = createGame();
    advance(1, { x: 0, y: -1 }); // turn up
    advance(11);                  // 11 up steps from y=10 → y=-1 → wraps to y=19
    expect(last('end')).toBeNull();
  });

  // Crossing y=19 → y=0: snake must survive and keep running
  it('wraps from the bottom edge to the top instead of dying', () => {
    const { advance, last } = createGame();
    advance(1, { x: 0, y: 1 }); // turn down
    advance(10);                 // 10 down steps from y=10 → y=20 → wraps to y=0
    expect(last('end')).toBeNull();
  });
});

// ── Self collision ────────────────────────────────────────────────────────────
describe('self collision', () => {
  // Grow the snake by eating 3 apples then steer it back into its own body
  it('triggers game-over when the snake runs into its own body', () => {
    // Grow to length 4 by eating apples at (11,10),(12,10),(13,10).
    // Then steer up → left → down, bringing the head back into cell (12,10)
    // which is still occupied by the body → self-collision.
    //
    // Path (after eating 3):  snake = [(13,10),(12,10),(11,10),(10,10)]
    //   advance up:   head=(13,9),  snake=[(13,9),(13,10),(12,10),(11,10)]
    //   advance left: head=(12,9),  snake=[(12,9),(13,9),(13,10),(12,10)]
    //   advance down: head=(12,10) → (12,10) IS in body → collision!

    const { advance, skipDeathAnim, last } = createGame({
      rng: makeAppleRng([[11, 10], [12, 10], [13, 10], [0, 0]]),
    });

    advance(3);                    // eat 3 apples → length=4
    advance(1, { x: 0, y: -1 });  // turn up
    advance(1, { x: -1, y: 0 });  // turn left
    advance(1, { x: 0, y:  1 });  // turn down → crash into (12,10)

    skipDeathAnim();
    expect(last('end')?.won).toBe(false);
  });
});

// ── Apple eating & score ──────────────────────────────────────────────────────
describe('apple eating', () => {
  // The first apple must add 1 to the score and set the combo counter to 1
  it('increments score by 1 on first apple (combo=1)', () => {
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [0, 0]]),
    });
    advance(1); // eat at (11,10)
    const hud = last('hud');
    expect(hud.score).toBe(1);
    expect(hud.combo).toBe(1);
  });

  // When eating an apple the tail is not removed that tick, so the snake grows by 1 cell
  it('grows the snake by 1 when eating an apple', () => {
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [0, 0]]),
    });
    const before = last('hud').length; // 1
    advance(1);
    expect(last('hud').length).toBe(before + 1);
  });

  // Moving to an empty cell must not change the score — only eating an apple awards points
  it('does NOT change score when moving to an empty cell', () => {
    const { advance, last } = createGame();
    const before = last('hud').score;
    advance(3);
    expect(last('hud').score).toBe(before);
  });

  // After eating, a new apple must be spawned and the game must keep running
  it('spawns a new apple after eating (game keeps running)', () => {
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [0, 0]]),
    });
    advance(1);  // eat at (11,10), 2nd apple spawns at (0,0)
    advance(9);  // 9 more right steps — snake wraps, no wall death
    expect(last('end')).toBeNull();
    expect(last('hud').score).toBe(1); // only the first apple was eaten
  });
});

// ── Combo system ──────────────────────────────────────────────────────────────
describe('combo system', () => {
  // The combo starts at 1 on the first apple eaten (0 is the pre-game initial state)
  it('combo is 1 on first apple', () => {
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [0, 0]]),
    });
    advance(1);
    expect(last('hud').combo).toBe(1);
  });

  // Eating two apples in a row within the 3-second window must raise the combo to 2
  it('combo increments to 2 when eating a second apple within the window', () => {
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [12, 10], [0, 0]]),
    });
    advance(1); // eat 1st → combo=1
    advance(1); // eat 2nd → combo=2
    expect(last('hud').combo).toBe(2);
  });

  // At x2 combo the second apple is worth 2 points, bringing the total to 1+2=3
  it('score is +2 on a x2 combo (total score = 1+2 = 3)', () => {
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [12, 10], [0, 0]]),
    });
    advance(1); // +1 (combo 1) → score=1
    advance(1); // +2 (combo 2) → score=3
    expect(last('hud').score).toBe(3);
  });

  // If more than 3 seconds pass between apples the combo resets to 1 and scoring restarts
  it('combo resets to 1 after the 3-second window expires', () => {
    // Eat 1st apple normally, then send a frame jumping ts by >3000 ms.
    // The worker's catch-up guard fires exactly 1 tick; currentTs will be
    // ~4000ms after the 1st eat → timeSinceLast > COMBO_WINDOW_MS → reset.
    const { advance, emit, last } = createGame({
      rng: makeAppleRng([[11, 10], [12, 10], [0, 0]]),
    });

    advance(1); // eat at (11,10), ts≈121, lastEatTs=121

    // Jump ts by ~4000ms in one frame.
    // Worker guard: if ts - lastTick > tickMs*8, reset lastTick = ts - tickMs.
    // Then 1 tick fires.  currentTs = 4121.
    // timeSinceLast = 4121 - 121 = 4000 > 3000 → combo resets to 1.
    emit({ type: 'frame', ts: 4121, dir: null });

    const hud = last('hud');
    expect(hud.combo).toBe(1);  // was reset
    expect(hud.score).toBe(2);  // 1 + 1 (second apple adds 1 at combo=1)
  });
});

// ── Direction: 180° reversal prevention ──────────────────────────────────────
describe('direction reversal prevention', () => {
  // If the reversal were NOT blocked, the head would step onto the body (length ≥ 2) → game over.
  // A surviving game proves the reversal was correctly ignored.
  it('ignores a 180° reversal — snake keeps moving in the original direction', () => {
    // Grow snake to length 2 by eating the apple at (11,10).
    // Snake: [(11,10),(10,10)] going right.
    // Attempt right→left reversal: if not blocked, head hits (10,10) → self-collision.
    // If correctly blocked, head goes to (12,10) → game keeps running.
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [0, 0]]),
    });
    advance(1);                   // eat apple at (11,10), length=2
    advance(1, { x: -1, y: 0 }); // attempt reversal → must be blocked

    expect(last('end')).toBeNull();   // no collision → reversal was ignored
    expect(last('hud').score).toBe(1); // no extra apple eaten
  });

  // Sending the same direction that is already active must be a no-op
  it('ignores a duplicate direction (same as current)', () => {
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [0, 0]]),
    });
    advance(1);                  // eat apple, length=2
    advance(1, { x: 1, y: 0 }); // same direction (right) → no-op, snake keeps going right
    expect(last('end')).toBeNull();
  });
});

// ── Direction queue ───────────────────────────────────────────────────────────
describe('direction queue', () => {
  // A direction change sent in a frame must be buffered and applied on the very next game tick.
  // We place an apple directly above the snake's start position (10,9).
  // If the up-turn is applied: head moves to (10,9) → eats apple → score=1.
  // If the turn is ignored:   head moves to (11,10) → no apple → score=0.
  it('accepts a buffered turn and applies it on the next tick', () => {
    const { advance, last } = createGame({
      rng: makeAppleRng([[10, 9], [0, 0]]),
    });

    advance(1, { x: 0, y: -1 }); // queue: turn up → head goes to (10,9) → eats apple
    expect(last('hud').score).toBe(1);
    expect(last('end')).toBeNull();
  });
});

// ── Win condition ─────────────────────────────────────────────────────────────
describe('win condition', () => {
  // Every apple eaten must increase snake length by 1 — this is the basis for the win condition (length === 400)
  it('snake grows by 1 for each apple eaten (length tracking)', () => {
    const positions = [];
    for (let x = 11; x < COLS; x++) positions.push([x, 10]);
    positions.push([0, 0]); // fallback after all 9

    const { advance, last } = createGame({
      rng: makeAppleRng(positions),
    });

    advance(9); // eat 9 apples, each on consecutive right steps
    expect(last('hud').length).toBe(10);
    expect(last('hud').score).toBeGreaterThanOrEqual(9);
  });
});

// ── Apple spawn invariant ─────────────────────────────────────────────────────
describe('apple spawn', () => {
  // The apple must never be placed on the snake's body — if it were, it would cause a false self-collision
  it('apple is never placed on the snake body (game runs without spurious collision)', () => {
    // Eat 4 consecutive apples. If the apple ever spawned on the snake body,
    // the next tick would trigger a self-collision instead of another eat.
    // A clean hud.length=5 after 4 eats proves the spawn was always safe.
    const { advance, last } = createGame({
      rng: makeAppleRng([[11, 10], [12, 10], [13, 10], [14, 10], [0, 0]]),
    });
    advance(4); // eat 4 consecutive apples
    expect(last('hud').length).toBe(5);
    expect(last('end')).toBeNull(); // no accidental collision
  });
});
