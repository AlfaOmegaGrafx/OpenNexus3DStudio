# E2E Testing with DGX Spark and Chrome DevTools / Playwright

This guide covers running end-to-end tests against the **DGX Spark** API and using **Chrome DevTools MCP** together with **Playwright** to debug API and UI behavior.

## Prerequisites

- **DGX Spark** on premises and reachable (e.g. `http://dgx-spark.local:7842`).
- `.env` (or `VITE_API_ENDPOINT`) set to your DGX Spark URL:
  - Example: `VITE_API_ENDPOINT=http://dgx-spark.local:7842`
  - Use `.\update-dgx-spark-env.ps1 -DgxSparkIP dgx-spark.local` to set it, or edit `.env` manually.
- Verify: `.\test-dgx-spark-connection.ps1 -DgxSparkIP dgx-spark.local` (optional).

## Running E2E Tests (Playwright)

1. **Start the dev server** (in one terminal):
   ```bash
   npm run dev
   ```
   The app will be at `http://localhost:3000` (or the port shown). Playwright e2e can start its own server on port 3099 via `webServer` in `playwright.config.js`.

2. **Run E2E tests** (in another terminal):
   ```bash
   npm run test:e2e
   ```
   Or run only the DGX AI task test:
   ```bash
   npx playwright test tests/e2e/ai-task-dgx.spec.js
   ```

3. **Run in headed mode** (see the browser):
   ```bash
   npx playwright test tests/e2e/ai-task-dgx.spec.js --headed
   ```

4. **Use Playwright UI** for step-through debugging:
   ```bash
   npx playwright test tests/e2e/ai-task-dgx.spec.js --ui
   ```

## Using Chrome DevTools MCP with the App

To inspect **network requests** (e.g. to the DGX Spark API) and **console messages** while the app runs:

1. **Open the app in Chrome** (with Chrome DevTools MCP connected to that browser):
   - Start dev server: `npm run dev` (app at `http://localhost:3000` unless `PORT` is set).
   - In Cursor, use **Chrome DevTools MCP** → `navigate_page` to your app URL, e.g. `http://localhost:3000`.
   - If you see `net::ERR_EMPTY_RESPONSE`, ensure the dev server is running and reachable (no HTTPS/cert issues).

2. **List network requests** (after triggering an AI task):
   - Use the `list_network_requests` tool (optionally with `resourceTypes: ["fetch", "xhr"]`) to see calls to your DGX Spark endpoint.

3. **List console messages**:
   - Use `list_console_messages` to see errors or logs from the app (e.g. API connection, task progress).

4. **Get a specific request**:
   - Use `get_network_request` with the request ID from the list to inspect headers, URL, and response.

This helps verify that:
- Requests go to `http://dgx-spark.local:7842/api/v1/mesh-generation/text-to-textured-mesh` (or your configured endpoint).
- Responses are 2xx or you see 4xx/5xx and CORS/network errors.

## Using Playwright and Chrome DevTools Together

- **Playwright**: automates the browser (navigate, click, fill, wait for requests). Use it to drive the flow (e.g. open Tasks, submit Text-to-3D).
- **Chrome DevTools MCP**: attaches to a **separate** Chrome instance you open manually. Use it to monitor that same app session (network, console) while you or Playwright interact with the app.

**Suggested workflow:**

1. Start dev server: `npm run dev`.
2. Use Chrome DevTools MCP to **navigate** to `http://localhost:3000`.
3. Use Chrome DevTools MCP to **list_network_requests** and **list_console_messages** (optional: clear or note state before next step).
4. Either:
   - **Manual**: In the same Chrome window, open the Tasks panel, enter a prompt, click Start, then use DevTools MCP again to list network requests and console messages; or
   - **Playwright**: Run the e2e test in **headed** mode so you see the browser; in parallel, use Chrome DevTools MCP on a **different** Chrome tab/window that you opened to `http://localhost:3000` and perform the same flow manually there, then inspect with MCP.  
   For a single-browser flow, prefer: open app in Chrome → use DevTools MCP to navigate and inspect; run Playwright in headed mode only when you want to automate and watch the same machine.

## Relevant E2E Files

- `tests/e2e/app-load.spec.js` – App load and basic UI.
- `tests/e2e/ai-task-dgx.spec.js` – Opens Tasks, submits a Text-to-3D task, and checks that a request to the mesh-generation API was sent or a task row appears.

## API Endpoints (DGX Spark)

The app uses the real DGX Spark API (no mock). Main endpoints:

- `GET /health` – Connection check.
- `POST /api/v1/mesh-generation/text-to-textured-mesh` – Text-to-3D (prompt, options).
- `POST /api/v1/mesh-generation/image-to-textured-mesh` – Image-to-3D (image + options).
- `GET /api/v1/system/models` – Available models (optional).

**Job status polling:** The 3DAIGC-API exposes job status at `GET /api/v1/system/jobs/{job_id}`. Set in `.env`: `VITE_JOB_STATUS_PATH=api/v1/system/jobs` (no trailing slash; the app appends `/{jobId}`). Related endpoints: `GET .../jobs/{job_id}/download`, `.../thumbnail`, `.../info`. If no status endpoint is available, the app tries several default paths; after a few 404s it stops polling and leaves the task as “Job submitted; status endpoint not available” so the console is not spammed with 404s.

Ensure the DGX Spark server is running and that `VITE_API_ENDPOINT` points to it so the app and E2E tests hit the correct host.
