// E2E: App page loads and renders when API is connected or not.
// Run: npm run dev (in one terminal), then npm run test:e2e (in another).

const { test, expect } = require('@playwright/test');

test.describe('App page load', () => {
  test('page loads and app root has content', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        consoleErrors.push(text);
      }
    });

    await page.goto('/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });

    // App root should have content (React has rendered)
    const root = page.locator('#root');
    await expect(root).toBeVisible();
    await expect(root).not.toBeEmpty();

    await expect(page).toHaveTitle(/OpenNexus3DStudio|SPACE-TIME/i);

    // Real UI is visible (not just root div)
    await expect(page.getByText(/API|CharacterStudio|Connected|Disconnected/i).first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/app-loaded.png' });

    // No critical console errors
    const criticalErrors = consoleErrors.filter(
      (t) =>
        !t.includes('Download the React DevTools') &&
        !t.includes('Warning:') &&
        !t.includes('API connection failed') &&
        !t.includes('non-blocking')
    );
    expect(
      criticalErrors,
      'Console should not have critical errors: ' + criticalErrors.join('; ')
    ).toHaveLength(0);
  });
});
