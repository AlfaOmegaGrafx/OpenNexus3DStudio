#!/usr/bin/env node
/**
 * Autonomous smoke test for /xr via IWSDK CLI (requires dev server + Playwright).
 * Usage: npm run dev:runtime  (in another terminal), then npm run iwsdk:xr-smoke
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const sessionPath = path.join(root, '.iwsdk', 'runtime', 'session.json')

function awaitSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function run(args) {
  const iwsdkCli = path.join(root, 'node_modules', '@iwsdk', 'cli', 'dist', 'cli.js')
  const out = execFileSync(process.execPath, [iwsdkCli, ...args], {
    encoding: 'utf8',
    cwd: root,
    env: process.env,
    windowsHide: true,
  })
  return JSON.parse(out)
}

function step(label, args) {
  process.stdout.write(`\n▶ ${label}\n`)
  const result = run(args)
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2))
    process.exit(1)
  }
  return result.data
}

if (!existsSync(sessionPath)) {
  console.error(
    'No IWSDK runtime session. Start the dev server first:\n  npm run dev:runtime\n  (or: npm run dev)',
  )
  process.exit(1)
}

step('status', ['status'])
step('reload (agent should redirect to /xr)', ['browser', 'reload'])
await awaitSleep(8000)
const xrStatus = step('xr status', ['xr', 'status'])
if (xrStatus.result?.sessionOffered) {
  step('enter immersive VR', ['xr', 'enter'])
  await awaitSleep(3000)
} else {
  process.stdout.write('  (skip xr enter — IwsdkImmersive auto-launches XR for agent tab)\n')
  await awaitSleep(5000)
}
const shot = step('screenshot', ['browser', 'screenshot'])
console.log(`\n✅ IWSDK XR smoke test finished. Screenshot: ${shot.screenshotPath}`)
