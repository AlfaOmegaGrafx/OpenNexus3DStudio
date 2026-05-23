// E2E: Webcam Avatar Control - Cam button is present in bottom bar.
// Run: npm run test:e2e (starts dev server and runs tests).

const { test, expect } = require('@playwright/test');

test.describe('Webcam Avatar Control', () => {
  test('Cam button is visible in bottom control bar after app loads', async ({ page }) => {
    await page.goto('/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });

    const mainViewport = page.locator('.main-viewport');
    await expect(mainViewport).toBeVisible({ timeout: 10000 });

    // Wait for scene to initialize (canvas appears) so bottom bar can mount
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20000 });

    // Cam button (label "Cam" or "Cam on") must be present
    const camLabel = page.getByText(/^Cam( on)?$/).first();
    await expect(camLabel).toBeVisible({ timeout: 10000 });
  });
});
