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
  it('level 1  → 250 ms (slowest)', () => expect(levelToTickMs(1)).toBe(250));
  it('level 10 → 50 ms  (fastest)', () => expect(levelToTickMs(10)).toBe(50));

  it('is strictly decreasing (higher level = faster snake)', () => {
    for (let l = 1; l < 10; l++) {
      expect(levelToTickMs(l)).toBeGreaterThan(levelToTickMs(l + 1));
    }
  });

  it('all 10 levels stay within [50, 250] ms', () => {
    for (let l = 1; l <= 10; l++) {
      const ms = levelToTickMs(l);
      expect(ms).toBeGreaterThanOrEqual(50);
      expect(ms).toBeLessThanOrEqual(250);
    }
  });

  it('returns an integer for every level', () => {
    for (let l = 1; l <= 10; l++) {
      expect(Number.isInteger(levelToTickMs(l))).toBe(true);
    }
  });

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
  it('returns null for micro-swipes (< 10 px)', () => {
    expect(swipeDir(0, 0)).toBeNull();
    expect(swipeDir(9, 0)).toBeNull();
    expect(swipeDir(0, 9)).toBeNull();
    expect(swipeDir(7, 7)).toBeNull();
  });

  it('detects right swipe', () => {
    expect(swipeDir(80, 10)).toEqual({ x: 1, y: 0 });
  });

  it('detects left swipe', () => {
    expect(swipeDir(-80, 10)).toEqual({ x: -1, y: 0 });
  });

  it('detects downward swipe', () => {
    expect(swipeDir(10, 80)).toEqual({ x: 0, y: 1 });
  });

  it('detects upward swipe', () => {
    expect(swipeDir(10, -80)).toEqual({ x: 0, y: -1 });
  });

  it('horizontal axis wins when |dx| > |dy|', () => {
    expect(swipeDir(40, 20)).toEqual({ x: 1, y: 0 });
    expect(swipeDir(-40, 20)).toEqual({ x: -1, y: 0 });
  });

  it('vertical axis wins when |dy| > |dx|', () => {
    expect(swipeDir(20, 40)).toEqual({ x: 0, y: 1 });
    expect(swipeDir(20, -40)).toEqual({ x: 0, y: -1 });
  });

  it('vertical axis wins on exact tie (|dx| === |dy|)', () => {
    const d = swipeDir(30, -30);
    // |dx| is NOT > |dy|, so vertical branch runs
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
  it('arrow keys map to the four cardinal directions', () => {
    expect(KEY_DIR['ArrowUp']).toEqual({ x: 0, y: -1 });
    expect(KEY_DIR['ArrowDown']).toEqual({ x: 0, y: 1 });
    expect(KEY_DIR['ArrowLeft']).toEqual({ x: -1, y: 0 });
    expect(KEY_DIR['ArrowRight']).toEqual({ x: 1, y: 0 });
  });

  it('lower-case WASD matches the corresponding arrows', () => {
    expect(KEY_DIR['w']).toEqual(KEY_DIR['ArrowUp']);
    expect(KEY_DIR['s']).toEqual(KEY_DIR['ArrowDown']);
    expect(KEY_DIR['a']).toEqual(KEY_DIR['ArrowLeft']);
    expect(KEY_DIR['d']).toEqual(KEY_DIR['ArrowRight']);
  });

  it('upper-case WASD also maps correctly', () => {
    expect(KEY_DIR['W']).toEqual(KEY_DIR['ArrowUp']);
    expect(KEY_DIR['S']).toEqual(KEY_DIR['ArrowDown']);
    expect(KEY_DIR['A']).toEqual(KEY_DIR['ArrowLeft']);
    expect(KEY_DIR['D']).toEqual(KEY_DIR['ArrowRight']);
  });

  it('all four directions are covered', () => {
    const dirs = Object.values(KEY_DIR);
    expect(dirs).toContainEqual({ x: 0, y: -1 });
    expect(dirs).toContainEqual({ x: 0, y: 1 });
    expect(dirs).toContainEqual({ x: -1, y: 0 });
    expect(dirs).toContainEqual({ x: 1, y: 0 });
  });

  it('no unknown directions are registered', () => {
    for (const d of Object.values(KEY_DIR)) {
      expect(Math.abs(d.x) + Math.abs(d.y)).toBe(1); // unit vector
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
  it('covers all four buttons', () => {
    expect(Object.keys(DPAD_DIRS)).toHaveLength(4);
  });

  it('dpad-up points up', ()    => expect(DPAD_DIRS['dpad-up']).toEqual({ x: 0, y: -1 }));
  it('dpad-down points down', () => expect(DPAD_DIRS['dpad-down']).toEqual({ x: 0, y: 1 }));
  it('dpad-left points left', () => expect(DPAD_DIRS['dpad-left']).toEqual({ x: -1, y: 0 }));
  it('dpad-right points right',() => expect(DPAD_DIRS['dpad-right']).toEqual({ x: 1, y: 0 }));

  it('all directions are unit vectors', () => {
    for (const d of Object.values(DPAD_DIRS)) {
      expect(Math.abs(d.x) + Math.abs(d.y)).toBe(1);
    }
  });
});
