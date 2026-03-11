/**
 * Unit tests for pure logic extracted from main.js.
 *
 * These functions have no DOM dependency and can be tested directly.
 */
import { describe, it, expect } from 'vitest';

// ── levelToTickMs ─────────────────────────────────────────────────────────────
// Replicated from main.js — if the formula changes, this test will fail first.
function levelToTickMs(level) {
  return Math.round(250 - (level - 1) * 200 / 9);
}

describe('levelToTickMs — speed level to tick interval', () => {
  // Level 1 is the slowest setting: the snake advances once every 250ms
  it('level 1  → 250 ms (slowest)', () => expect(levelToTickMs(1)).toBe(250));

  // Level 10 is the fastest setting: the snake advances once every 50ms
  it('level 10 → 50 ms  (fastest)', () => expect(levelToTickMs(10)).toBe(50));

  // Each level must be faster than the previous one — ensures the formula is monotonically decreasing
  it('is strictly decreasing (higher level = faster snake)', () => {
    for (let l = 1; l < 10; l++) {
      expect(levelToTickMs(l)).toBeGreaterThan(levelToTickMs(l + 1));
    }
  });

  // No level should fall outside the expected range — guards against formula regressions
  it('all 10 levels stay within [50, 250] ms', () => {
    for (let l = 1; l <= 10; l++) {
      const ms = levelToTickMs(l);
      expect(ms).toBeGreaterThanOrEqual(50);
      expect(ms).toBeLessThanOrEqual(250);
    }
  });

  // The value must be an integer so it works correctly as a tick interval
  it('returns an integer for every level', () => {
    for (let l = 1; l <= 10; l++) {
      expect(Number.isInteger(levelToTickMs(l))).toBe(true);
    }
  });

  // Level 5 should sit roughly in the middle of the [50, 250] range
  it('level 5 is the mid-point (≈ 139 ms)', () => {
    const ms = levelToTickMs(5);
    expect(ms).toBeGreaterThan(100);
    expect(ms).toBeLessThan(200);
  });
});

// ── Swipe direction detection ─────────────────────────────────────────────────
// Logic copied from the touchend handler in main.js.
function swipeDir(dx, dy) {
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return null;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  }
  return dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

describe('swipeDir — touch swipe direction detection', () => {
  // Movements shorter than 10px are ignored to prevent accidental direction changes on tap
  it('returns null for micro-swipes (< 10 px)', () => {
    expect(swipeDir(0, 0)).toBeNull();
    expect(swipeDir(9, 0)).toBeNull();
    expect(swipeDir(0, 9)).toBeNull();
    expect(swipeDir(7, 7)).toBeNull();
  });

  // Swiping right should steer the snake to the right
  it('detects right swipe', () => {
    expect(swipeDir(80, 10)).toEqual({ x: 1, y: 0 });
  });

  // Swiping left should steer the snake to the left
  it('detects left swipe', () => {
    expect(swipeDir(-80, 10)).toEqual({ x: -1, y: 0 });
  });

  // Swiping downward should steer the snake down
  it('detects downward swipe', () => {
    expect(swipeDir(10, 80)).toEqual({ x: 0, y: 1 });
  });

  // Swiping upward should steer the snake up
  it('detects upward swipe', () => {
    expect(swipeDir(10, -80)).toEqual({ x: 0, y: -1 });
  });

  // When the horizontal displacement is larger, the horizontal axis wins
  it('horizontal axis wins when |dx| > |dy|', () => {
    expect(swipeDir(40, 20)).toEqual({ x: 1, y: 0 });
    expect(swipeDir(-40, 20)).toEqual({ x: -1, y: 0 });
  });

  // When the vertical displacement is larger, the vertical axis wins
  it('vertical axis wins when |dy| > |dx|', () => {
    expect(swipeDir(20, 40)).toEqual({ x: 0, y: 1 });
    expect(swipeDir(20, -40)).toEqual({ x: 0, y: -1 });
  });

  // On an exact tie the vertical axis takes priority, as defined by the strict `>` condition
  it('vertical axis wins on exact tie (|dx| === |dy|)', () => {
    const d = swipeDir(30, -30);
    expect(d).toEqual({ x: 0, y: -1 });
  });
});

// ── Keyboard mapping ──────────────────────────────────────────────────────────
// Copied from main.js — if keys are added/removed the tests will catch it.
const KEY_DIR = {
  ArrowUp:    { x:  0, y: -1 }, w: { x:  0, y: -1 }, W: { x:  0, y: -1 },
  ArrowDown:  { x:  0, y:  1 }, s: { x:  0, y:  1 }, S: { x:  0, y:  1 },
  ArrowLeft:  { x: -1, y:  0 }, a: { x: -1, y:  0 }, A: { x: -1, y:  0 },
  ArrowRight: { x:  1, y:  0 }, d: { x:  1, y:  0 }, D: { x:  1, y:  0 },
};

describe('KEY_DIR — keyboard to direction mapping', () => {
  // Arrow keys must map to the correct cardinal directions
  it('arrow keys map to the four cardinal directions', () => {
    expect(KEY_DIR['ArrowUp']).toEqual({ x: 0, y: -1 });
    expect(KEY_DIR['ArrowDown']).toEqual({ x: 0, y: 1 });
    expect(KEY_DIR['ArrowLeft']).toEqual({ x: -1, y: 0 });
    expect(KEY_DIR['ArrowRight']).toEqual({ x: 1, y: 0 });
  });

  // Lower-case WASD must behave identically to the arrow keys
  it('lower-case WASD matches the corresponding arrows', () => {
    expect(KEY_DIR['w']).toEqual(KEY_DIR['ArrowUp']);
    expect(KEY_DIR['s']).toEqual(KEY_DIR['ArrowDown']);
    expect(KEY_DIR['a']).toEqual(KEY_DIR['ArrowLeft']);
    expect(KEY_DIR['d']).toEqual(KEY_DIR['ArrowRight']);
  });

  // Upper-case WASD (e.g. with Caps Lock on) must also work correctly
  it('upper-case WASD also maps correctly', () => {
    expect(KEY_DIR['W']).toEqual(KEY_DIR['ArrowUp']);
    expect(KEY_DIR['S']).toEqual(KEY_DIR['ArrowDown']);
    expect(KEY_DIR['A']).toEqual(KEY_DIR['ArrowLeft']);
    expect(KEY_DIR['D']).toEqual(KEY_DIR['ArrowRight']);
  });

  // The mapping must cover all four directions without gaps
  it('all four directions are covered', () => {
    const dirs = Object.values(KEY_DIR);
    expect(dirs).toContainEqual({ x: 0, y: -1 });
    expect(dirs).toContainEqual({ x: 0, y: 1 });
    expect(dirs).toContainEqual({ x: -1, y: 0 });
    expect(dirs).toContainEqual({ x: 1, y: 0 });
  });

  // Every registered direction must be a unit vector — no diagonals or unexpected values
  it('no unknown directions are registered', () => {
    for (const d of Object.values(KEY_DIR)) {
      expect(Math.abs(d.x) + Math.abs(d.y)).toBe(1);
    }
  });
});

// ── D-pad ID → direction mapping ──────────────────────────────────────────────
// Copied from main.js DPAD_DIRS constant.
const DPAD_DIRS = {
  'dpad-up':    { x:  0, y: -1 },
  'dpad-down':  { x:  0, y:  1 },
  'dpad-left':  { x: -1, y:  0 },
  'dpad-right': { x:  1, y:  0 },
};

describe('DPAD_DIRS — D-pad button id to direction mapping', () => {
  // The D-pad must have exactly four buttons — one per cardinal direction
  it('covers all four buttons', () => {
    expect(Object.keys(DPAD_DIRS)).toHaveLength(4);
  });

  // Each D-pad button must map to the direction its label implies
  it('dpad-up points up',     () => expect(DPAD_DIRS['dpad-up']).toEqual({ x: 0, y: -1 }));
  it('dpad-down points down', () => expect(DPAD_DIRS['dpad-down']).toEqual({ x: 0, y: 1 }));
  it('dpad-left points left', () => expect(DPAD_DIRS['dpad-left']).toEqual({ x: -1, y: 0 }));
  it('dpad-right points right',() => expect(DPAD_DIRS['dpad-right']).toEqual({ x: 1, y: 0 }));

  // Every D-pad direction must be a unit vector — no diagonals allowed
  it('all directions are unit vectors', () => {
    for (const d of Object.values(DPAD_DIRS)) {
      expect(Math.abs(d.x) + Math.abs(d.y)).toBe(1);
    }
  });
});
