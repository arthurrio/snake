/**
 * End-to-end tests (Playwright) covering desktop and mobile viewports.
 *
 * Run with:
 *   npx playwright test
 *
 * The webServer config in playwright.config.js starts `npx serve .` on port 3000.
 */
import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Click the start/play-again button and wait for the overlay to hide. */
async function startGame(page) {
  await page.click('#start-btn');
  await expect(page.locator('#overlay')).toBeHidden();
}

/** Wait up to `ms` for the score element to show a value > 0. */
async function waitForScore(page, ms = 8000) {
  await expect(page.locator('#score')).not.toHaveText('0', { timeout: ms });
}

// ─────────────────────────────────────────────────────────────────────────────
// Page load
// ─────────────────────────────────────────────────────────────────────────────
test.describe('page load', () => {
  // The browser tab title must match the game name
  test('title is Snake', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Snake');
  });

  // The intro overlay must be the first thing the player sees, with the game title
  test('overlay is visible with "SNAKE" heading on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#overlay')).toBeVisible();
    await expect(page.locator('#overlay-title')).toHaveText('SNAKE');
  });

  // The start button must exist and show the expected label before the game begins
  test('start button is present and labelled', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#start-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('START');
  });

  // The canvas must be visible and have an ARIA label for screen reader users
  test('canvas element is present with accessible label', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('#canvas');
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute('aria-label', /snake/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Game start
// ─────────────────────────────────────────────────────────────────────────────
test.describe('game start', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // Clicking the start button must dismiss the overlay so the game board is visible
  test('clicking start hides the overlay', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#overlay')).toBeHidden();
  });

  // The HUD must show the correct initial values right after starting a new game
  test('HUD shows score 0 and cells "1 / 400" immediately after start', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#cells')).toHaveText('1 / 400');
  });

  // The combo multiplier must start at ×1 (no chain active) when the game begins
  test('HUD shows combo ×1 at game start', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#combo')).toHaveText('x1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Speed buttons
// ─────────────────────────────────────────────────────────────────────────────
test.describe('speed buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // All 10 speed levels must be rendered as clickable buttons
  test('all 10 speed buttons are present', async ({ page }) => {
    for (let l = 1; l <= 10; l++) {
      await expect(
        page.locator(`#speed-btns button[data-level="${l}"]`)
      ).toBeVisible();
    }
  });

  // Selecting a speed must mark that button as active via aria-pressed for assistive technology
  test('clicking a speed button marks it as aria-pressed=true', async ({ page }) => {
    const btn = page.locator('#speed-btns button[data-level="3"]');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  // Changing the speed must deselect all other buttons — only one can be active at once
  test('only one speed button is aria-pressed=true at a time', async ({ page }) => {
    await page.locator('#speed-btns button[data-level="7"]').click();
    const pressed = page.locator('#speed-btns button[aria-pressed="true"]');
    await expect(pressed).toHaveCount(1);
    await expect(pressed).toHaveAttribute('data-level', '7');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard controls (desktop)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('keyboard controls', { tag: '@desktop' }, () => {
  // Arrow key presses must be forwarded to the game worker without causing a JS error
  test('pressing ArrowUp during game does not crash the page', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowLeft');
    // Game should still be running (overlay hidden)
    await expect(page.locator('#overlay')).toBeHidden();
  });

  // WASD keys (alternative control scheme) must also be handled without errors
  test('WASD keys are accepted without crashing', async ({ page }) => {
    await page.goto('/');
    await startGame(page);
    await page.keyboard.press('w');
    await page.keyboard.press('a');
    await expect(page.locator('#overlay')).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Game over
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read head and apple grid coordinates from the canvas data attributes
 * that the game updates on every HUD tick.
 */
async function gamePositions(page) {
  return page.evaluate(() => ({
    hx: parseInt(document.getElementById('canvas').dataset.headX  ?? '-1'),
    hy: parseInt(document.getElementById('canvas').dataset.headY  ?? '-1'),
    ax: parseInt(document.getElementById('canvas').dataset.appleX ?? '-1'),
    ay: parseInt(document.getElementById('canvas').dataset.appleY ?? '-1'),
  }));
}

/**
 * Steer the snake one step toward the apple, avoiding 180° reversals.
 * Returns the key that was pressed (or null if already on the apple).
 *
 * Wrap-around is accounted for by choosing the shorter of the two paths
 * along each axis (direct vs. through the opposite wall).
 */
async function stepTowardApple(page, currentDir) {
  const COLS = 20, ROWS = 20;
  const { hx, hy, ax, ay } = await gamePositions(page);
  if (hx < 0 || ax < 0) return null;

  // Shortest signed delta on each axis, considering wrap-around
  let dx = ax - hx;
  if (Math.abs(dx) > COLS / 2) dx = dx > 0 ? dx - COLS : dx + COLS;
  let dy = ay - hy;
  if (Math.abs(dy) > ROWS / 2) dy = dy > 0 ? dy - ROWS : dy + ROWS;

  // Candidate direction: prefer the larger delta axis to converge faster
  const candidates =
    Math.abs(dx) >= Math.abs(dy)
      ? [dx > 0 ? 'ArrowRight' : 'ArrowLeft',  dy > 0 ? 'ArrowDown' : 'ArrowUp']
      : [dy > 0 ? 'ArrowDown'  : 'ArrowUp',    dx > 0 ? 'ArrowRight' : 'ArrowLeft'];

  const opposite = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight',
                     ArrowUp: 'ArrowDown',    ArrowDown: 'ArrowUp' };

  // Pick first candidate that is not a 180° reversal of the current direction
  const key = candidates.find(k => k !== opposite[currentDir]) ?? candidates[0];
  await page.keyboard.press(key);
  return key;
}

/**
 * Wait until the snake's head has moved away from (px, py).
 * Uses polling every 10 ms so we react within one game tick (50 ms at max speed).
 */
async function waitForHeadMove(page, px, py) {
  // Timeout is generous (10 s) because under full-suite load the rAF loop can
  // slow well below the nominal 50 ms/tick and we must not flake on CI.
  await page.waitForFunction(
    ([ex, ey]) => {
      const canvas = document.getElementById('canvas');
      const hx = parseInt(canvas.dataset.headX ?? '-1');
      const hy = parseInt(canvas.dataset.headY ?? '-1');
      return hx !== ex || hy !== ey;
    },
    [px, py],
    { polling: 10, timeout: 10_000 }
  );
}

/**
 * Navigate toward and eat `count` apples, then trigger a U-turn self-collision.
 *
 * The snake's head and apple positions are read from data attributes that the
 * game exposes on #canvas after every HUD update.  This avoids relying on the
 * apple landing in the snake's straight-line path by chance.
 */
async function forceSelfCollision(page) {
  const TICK = 55; // slightly above 50 ms/tick so we don't skip ticks
  let dir = 'ArrowRight'; // snake starts going right

  // Eat 4 apples so the snake reaches length 5
  let currentScore = 0;
  for (let i = 0; i < 4; i++) {
    // Navigate toward the apple until the score increases (apple eaten).
    // After each key press we wait for the head to actually move (one tick),
    // avoiding fixed-timeout races that cause the snake to skip cells.
    while (parseInt(await page.locator('#score').textContent()) <= currentScore) {
      const { hx, hy } = await gamePositions(page);
      const pressed = await stepTowardApple(page, dir);
      if (pressed) dir = pressed;
      await waitForHeadMove(page, hx, hy);
    }
    currentScore = parseInt(await page.locator('#score').textContent());
  }

  // Align the snake to go right and straighten the body:
  // - ArrowDown is safe from any direction (from UP: reversal is blocked but harmless)
  // - ArrowRight turns from down/up/right to right
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(TICK);
  await page.keyboard.press('ArrowRight');

  // Go right for 5 ticks — with length 5 this makes the entire body horizontal
  for (let i = 0; i < 5; i++) await page.waitForTimeout(TICK);

  // 4-step clockwise loop → guaranteed self-collision for a horizontal right-going snake of length ≥ 4:
  //   body before: [(hx,hy),(hx-1,hy),(hx-2,hy),(hx-3,hy),(hx-4,hy)]
  //   Right: head→(hx+1,hy)   Down: head→(hx+1,hy+1)
  //   Left:  head→(hx,hy+1)   Up:   head→(hx,hy) ← in body → collision
  //
  // We use waitForHeadMove instead of waitForTimeout so that exactly one tick
  // fires between each key press — preventing the snake from skipping a cell.
  let pos = await gamePositions(page);
  await page.keyboard.press('ArrowRight');
  await waitForHeadMove(page, pos.hx, pos.hy);

  pos = await gamePositions(page);
  await page.keyboard.press('ArrowDown');
  await waitForHeadMove(page, pos.hx, pos.hy);

  pos = await gamePositions(page);
  await page.keyboard.press('ArrowLeft');
  await waitForHeadMove(page, pos.hx, pos.hy);

  // The Up key sends the snake into its own body on the very next tick
  await page.keyboard.press('ArrowUp');
}

test.describe('game over', () => {
  // Walls now wrap around, so the only way to die is self-collision.
  // We navigate toward apples to grow the snake, then steer it into its own body.
  // Navigating 4 apples + death animation needs more time than the global 20 s timeout.
  test.setTimeout(60_000);
  test('overlay reappears with GAME OVER after the snake dies', async ({ page }) => {
    await page.goto('/');
    await page.locator('#speed-btns button[data-level="10"]').click();
    await startGame(page);

    await forceSelfCollision(page);

    // Wait for the game-over overlay (death animation takes ~700ms)
    await expect(page.locator('#overlay')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#overlay-title')).toHaveText('GAME OVER');
  });

  // After game over, keyboard focus must move to the start button so the player can restart without a mouse
  test('play-again button is focused after game over', async ({ page }) => {
    await page.goto('/');
    await page.locator('#speed-btns button[data-level="10"]').click();
    await startGame(page);

    await forceSelfCollision(page);
    await expect(page.locator('#overlay')).toBeVisible({ timeout: 10_000 });

    // The start button should receive focus for keyboard accessibility
    await expect(page.locator('#start-btn')).toBeFocused({ timeout: 2_000 });
  });

  // After game over the button label must change from "START" to "PLAY AGAIN"
  test('start button text changes to PLAY AGAIN after game over', async ({ page }) => {
    await page.goto('/');
    await page.locator('#speed-btns button[data-level="10"]').click();
    await startGame(page);

    await forceSelfCollision(page);
    await expect(page.locator('#overlay')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#start-btn')).toHaveText('PLAY AGAIN');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mobile layout — D-pad visibility
// ─────────────────────────────────────────────────────────────────────────────
test.describe('mobile layout', () => {
  const MOBILE_VIEWPORTS = [
    { name: 'iPhone SE (375×667)',   width: 375,  height: 667  },
    { name: 'iPhone 13 (390×844)',   width: 390,  height: 844  },
    { name: 'Pixel 5 (393×851)',     width: 393,  height: 851  },
    { name: 'Galaxy S21 (360×800)',  width: 360,  height: 800  },
  ];

  for (const vp of MOBILE_VIEWPORTS) {
    // All four D-pad buttons must fit within the viewport without being clipped or hidden
    test(`D-pad is fully visible on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      for (const id of ['dpad-up', 'dpad-down', 'dpad-left', 'dpad-right']) {
        const btn = page.locator(`#${id}`);
        await expect(btn).toBeVisible();

        // Confirm the button is actually within the viewport (not clipped)
        const box = await btn.boundingBox();
        expect(box).not.toBeNull();
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
      }
    });

    // All 10 speed buttons must be reachable without scrolling on real mobile screen sizes
    test(`all 10 speed buttons visible on ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      for (let l = 1; l <= 10; l++) {
        const btn = page.locator(`#speed-btns button[data-level="${l}"]`);
        await expect(btn).toBeVisible();
        const box = await btn.boundingBox();
        expect(box).not.toBeNull();
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Mobile interaction — tap & swipe
// ─────────────────────────────────────────────────────────────────────────────
test.describe('mobile touch interaction', () => {
  // Enable touch events so `.tap()` works in a desktop browser context
  test.use({ hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
  });

  // A finger tap on the start button must work the same as a mouse click on mobile
  test('start button is tappable on mobile (tap triggers game start)', async ({ page }) => {
    const btn = page.locator('#start-btn');
    await btn.tap();
    await expect(page.locator('#overlay')).toBeHidden({ timeout: 3_000 });
  });

  // Tapping the D-pad up button must send an up-direction command without crashing
  test('D-pad up button is tappable during game', async ({ page }) => {
    await page.locator('#start-btn').tap();
    await expect(page.locator('#overlay')).toBeHidden();

    const dpadUp = page.locator('#dpad-up');
    await expect(dpadUp).toBeVisible();
    // Tap should not throw or crash
    await dpadUp.tap();
    await expect(page.locator('#overlay')).toBeHidden();
  });

  // Tapping the D-pad down button must send a down-direction command without crashing
  test('D-pad down button is tappable during game', async ({ page }) => {
    await page.locator('#start-btn').tap();
    await expect(page.locator('#overlay')).toBeHidden();
    const dpadDown = page.locator('#dpad-down');
    await expect(dpadDown).toBeVisible();
    await dpadDown.tap();
    await expect(page.locator('#overlay')).toBeHidden();
  });

  // A touch swipe across the canvas must be processed as a steering input without errors
  test('swipe gesture on canvas steers the snake (no crash)', async ({ page }) => {
    await page.locator('#start-btn').tap();
    await expect(page.locator('#overlay')).toBeHidden();

    const canvas = page.locator('#canvas');
    const box    = await canvas.boundingBox();

    // Simulate a swipe left across the canvas
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.touchscreen.tap(cx, cy);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 100, cy, { steps: 5 });
    await page.mouse.up();

    // Game should still be running
    await expect(page.locator('#overlay')).toBeHidden();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility
// ─────────────────────────────────────────────────────────────────────────────
test.describe('accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // The overlay must be announced as a dialog to screen readers so they enter modal mode
  test('overlay has role="dialog" and aria-modal="true"', async ({ page }) => {
    await expect(page.locator('#overlay')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#overlay')).toHaveAttribute('aria-modal', 'true');
  });

  // The D-pad container must have a descriptive label so screen readers can identify it
  test('D-pad group has an aria-label', async ({ page }) => {
    await expect(page.locator('#dpad')).toHaveAttribute('aria-label', /.+/);
  });

  // Every D-pad button must have its own aria-label so blind users know which direction they are pressing
  test('each D-pad button has an aria-label', async ({ page }) => {
    for (const id of ['dpad-up', 'dpad-down', 'dpad-left', 'dpad-right']) {
      await expect(page.locator(`#${id}`)).toHaveAttribute('aria-label', /.+/);
    }
  });

  // The score element must be an aria-live region so screen readers announce score changes automatically
  test('score span has aria-live attribute', async ({ page }) => {
    await expect(page.locator('#score')).toHaveAttribute('aria-live', /.+/);
  });

  // Speed buttons must expose their selected state via aria-pressed for assistive technology
  test('speed buttons have aria-pressed attribute', async ({ page }) => {
    const firstBtn = page.locator('#speed-btns button').first();
    await expect(firstBtn).toHaveAttribute('aria-pressed', /(true|false)/);
  });
});
