// E2E: Trigger Text-to-3D and Image-to-3D AI tasks against DGX Spark API.
// Prerequisites: Dev server (npm run dev), VITE_API_ENDPOINT pointing to DGX Spark (e.g. http://dgx-spark.local:7842).
// For debugging: run with headed mode and use Chrome DevTools MCP (see docs/E2E_DGX_DEVTOOLS.md).

const { test, expect } = require('@playwright/test');
const path = require('path');

const PROMPT = 'a small red cube';
const IMAGE_TO_3D_PROMPT = 'Convert image to 3D';
const TASK_WAIT_MS = 60000; // Allow time for DGX Spark to respond
// Test image for image-to-3D (project-relative path)
const TEST_IMAGE_PATH = path.join(__dirname, '..', '..', 'public', 'textures', 'pixel9.png');

test.describe('AI task (DGX Spark)', () => {
  test('page loads and Tasks panel is visible', async ({ page }) => {
    await page.goto('/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });
    await expect(page.getByText(/Tasks|API|CharacterStudio/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('open new task form and submit Text-to-3D', async ({ page }) => {
    await page.goto('/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });

    // Wait for API status to appear (Connected or Not Connected)
    await expect(page.getByText(/API|Connected|Disconnected|Tasks/i).first()).toBeVisible({ timeout: 15000 });

    // Optional: skip if API not connected (e.g. DGX unreachable)
    const apiNotConnected = await page.getByText('API Not Connected').isVisible().catch(() => false);
    if (apiNotConnected) {
      test.skip(true, 'DGX Spark API not connected; set VITE_API_ENDPOINT and ensure server is reachable.');
      return;
    }

    // Listen for request to DGX mesh-generation endpoint
    const requestPromise = page.waitForRequest(
      (req) => {
        const u = req.url();
        return (u.includes('/api/v1/mesh-generation/') || u.includes('text-to-textured-mesh')) && req.method() === 'POST';
      },
      { timeout: TASK_WAIT_MS }
    ).catch(() => null);

    // Open "+ New" task form
    const newBtn = page.getByTestId('task-manager-new-btn');
    await expect(newBtn).toBeVisible({ timeout: 5000 });
    await newBtn.click();

    // Fill prompt and submit
    const promptInput = page.getByTestId('task-prompt-input');
    await expect(promptInput).toBeVisible({ timeout: 3000 });
    await promptInput.fill(PROMPT);

    const startBtn = page.getByTestId('task-start-btn');
    await expect(startBtn).toBeVisible({ timeout: 3000 });
    await startBtn.click();

    // Either API request was sent or a task row appears (running/completed/failed)
    const apiRequest = await requestPromise;
    const taskRow = page.locator('.task-item').first();
    await taskRow.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    if (apiRequest) {
      expect(apiRequest.url()).toMatch(/mesh-generation|text-to-textured-mesh/);
    }

    // Task list should show at least one task after submitting
    const taskCount = await page.locator('.task-item').count();
    expect(apiRequest !== null || taskCount >= 1).toBeTruthy();
  });

  test('open new task form and submit Image-to-3D with file', async ({ page }) => {
    await page.goto('/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { state: 'visible', timeout: 15000 });
    await expect(page.getByText(/API|Connected|Disconnected|Tasks/i).first()).toBeVisible({ timeout: 15000 });

    const apiNotConnected = await page.getByText('API Not Connected').isVisible().catch(() => false);
    if (apiNotConnected) {
      test.skip(true, 'DGX Spark API not connected; set VITE_API_ENDPOINT and ensure server is reachable.');
      return;
    }

    // Listen for POST to image-to-textured-mesh or image-to-raw-mesh
    const requestPromise = page.waitForRequest(
      (req) => {
        const u = req.url();
        return (
          (u.includes('/api/v1/mesh-generation/') && u.includes('image')) &&
          req.method() === 'POST'
        );
      },
      { timeout: TASK_WAIT_MS }
    ).catch(() => null);

    const newBtn = page.getByTestId('task-manager-new-btn');
    await expect(newBtn).toBeVisible({ timeout: 5000 });
    await newBtn.click();

    // Select "Image to 3D" (first select in task form is task type)
    await page.locator('.task-manager select').first().selectOption('image-to-3d');

    // Wait for file input and prompt to be visible
    const fileInput = page.getByTestId('task-image-file-input');
    await expect(fileInput).toBeAttached({ timeout: 3000 });
    await page.getByTestId('task-prompt-input').fill(IMAGE_TO_3D_PROMPT);

    await fileInput.setInputFiles(TEST_IMAGE_PATH);

    const startBtn = page.getByTestId('task-start-btn');
    await expect(startBtn).toBeVisible({ timeout: 3000 });
    await startBtn.click();

    const apiRequest = await requestPromise;
    await page.locator('.task-item').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});

    if (apiRequest) {
      expect(apiRequest.url()).toMatch(/mesh-generation/);
      expect(apiRequest.url()).toMatch(/image/);
    }

    const taskCount = await page.locator('.task-item').count();
    expect(apiRequest !== null || taskCount >= 1).toBeTruthy();
  });
});
