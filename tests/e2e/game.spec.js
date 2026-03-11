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
test.describe('game over', () => {
  // When the snake hits a wall, the overlay must reappear with the game-over title
  test('overlay reappears with GAME OVER after the snake dies', async ({ page }) => {
    await page.goto('/');

    // Speed level 10 (50ms ticks) so the snake dies quickly
    await page.locator('#speed-btns button[data-level="10"]').click();
    await startGame(page);

    // Steer the snake into the left wall immediately
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('ArrowLeft');

    // Wait for the game-over overlay (death animation takes ~700ms)
    await expect(page.locator('#overlay')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#overlay-title')).toHaveText('GAME OVER');
  });

  // After game over, keyboard focus must move to the start button so the player can restart without a mouse
  test('play-again button is focused after game over', async ({ page }) => {
    await page.goto('/');
    await page.locator('#speed-btns button[data-level="10"]').click();
    await startGame(page);

    await page.keyboard.press('ArrowLeft'); // walk into left wall eventually
    await expect(page.locator('#overlay')).toBeVisible({ timeout: 10_000 });

    // The start button should receive focus for keyboard accessibility
    await expect(page.locator('#start-btn')).toBeFocused({ timeout: 2_000 });
  });

  // After game over the button label must change from "START" to "PLAY AGAIN"
  test('start button text changes to PLAY AGAIN after game over', async ({ page }) => {
    await page.goto('/');
    await page.locator('#speed-btns button[data-level="10"]').click();
    await startGame(page);
    await page.keyboard.press('ArrowLeft');
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
