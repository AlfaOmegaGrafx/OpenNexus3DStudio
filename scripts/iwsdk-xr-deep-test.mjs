#!/usr/bin/env node
/**
 * Deep IWSDK /xr agent test: scene inspect, distance grab, hand-only, exit panel.
 * Prereq: npm run dev:runtime (port 3010 or default 3000)
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const outDir = path.join(root, 'logs', 'iwsdk-deep-test')
const sessionPath = path.join(root, '.iwsdk', 'runtime', 'session.json')

const results = []

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const iwsdkCli = path.join(root, 'node_modules', '@iwsdk', 'cli', 'dist', 'cli.js')

function run(args) {
  try {
    const out = execFileSync(process.execPath, [iwsdkCli, ...args], {
      encoding: 'utf8',
      cwd: root,
      env: process.env,
      windowsHide: true,
    })
    return JSON.parse(out)
  } catch (err) {
    const text = err.stderr || err.stdout || ''
    try {
      return JSON.parse(text)
    } catch {
      return { ok: false, error: { message: err.message, raw: text } }
    }
  }
}

function step(name, args, { allowFail = false } = {}) {
  process.stdout.write(`\n▶ ${name}\n`)
  const res = run(args)
  const entry = { name, ok: res.ok, args }
  if (!res.ok) {
    entry.error = res.error
    results.push(entry)
    if (!allowFail) {
      console.error(JSON.stringify(res, null, 2))
      process.exit(1)
    }
    process.stdout.write(`  ⚠ allowed failure: ${res.error?.message}\n`)
    return null
  }
  results.push(entry)
  return res.data
}

function saveScreenshot(label, data) {
  if (!data?.screenshotPath || !existsSync(data.screenshotPath)) return null
  mkdirSync(outDir, { recursive: true })
  const dest = path.join(outDir, `${label}.png`)
  copyFileSync(data.screenshotPath, dest)
  process.stdout.write(`  📷 ${dest}\n`)
  return dest
}

async function main() {
  if (!existsSync(sessionPath)) {
    console.error('No IWSDK runtime. Run: npm run dev:runtime')
    process.exit(1)
  }

  mkdirSync(outDir, { recursive: true })

  step('status', ['status'])
  step('reload /xr', ['browser', 'reload'])
  await sleep(12000)
  for (let i = 0; i < 20; i++) {
    const st = run(['status'])
    if (st.data?.state?.browserCommandReady) break
    await sleep(500)
  }

  const xr0 = step('xr status (after reload)', ['xr', 'status'])
  const sessionActive = xr0?.result?.sessionActive
  process.stdout.write(`  sessionActive=${sessionActive}\n`)

  const hierarchy = step('scene hierarchy', [
    'scene',
    'hierarchy',
    '--input-json',
    JSON.stringify({ maxDepth: 6 }),
  ])
  const hierarchyStr = JSON.stringify(hierarchy?.result ?? hierarchy, null, 2)
  const hasCube = /IwsdkDemoCube/i.test(hierarchyStr)
  const hasExit = /ExitXRPanel/i.test(hierarchyStr)
  process.stdout.write(`  cube in scene: ${hasCube}, exit panel: ${hasExit}\n`)

  step('ecs find cube', [
    'ecs',
    'find',
    '--input-json',
    JSON.stringify({ namePattern: 'IwsdkDemoCube' }),
  ], { allowFail: true })

  step('ecs find exit panel', [
    'ecs',
    'find',
    '--input-json',
    JSON.stringify({ namePattern: 'ExitXRPanel' }),
  ], { allowFail: true })

  saveScreenshot('01-baseline', step('screenshot baseline', ['browser', 'screenshot']))

  // --- Controller mode: aim at cube (~0, 0.25, -0.85 in front of player) ---
  step('set input mode controller', [
    'xr',
    'set-input-mode',
    '--input-json',
    JSON.stringify({ mode: 'controller' }),
  ])
  step('connect controllers', [
    'xr',
    'set-connected',
    '--input-json',
    JSON.stringify({ device: 'controller-left', connected: true }),
  ])
  step('connect controller-right', [
    'xr',
    'set-connected',
    '--input-json',
    JSON.stringify({ device: 'controller-right', connected: true }),
  ])

  step('aim right controller at cube', [
    'xr',
    'look-at',
    '--input-json',
    JSON.stringify({
      device: 'controller-right',
      target: { x: 0, y: 0.25, z: -0.85 },
      moveToDistance: 0.35,
    }),
  ])
  await sleep(500)

  step('ecs snapshot pre-grab', ['ecs', 'snapshot'], { allowFail: true })
  step('trigger down (distance grab)', [
    'xr',
    'set-select-value',
    '--input-json',
    JSON.stringify({ device: 'controller-right', value: 1 }),
  ])
  await sleep(800)
  saveScreenshot('02-grab-hold', step('screenshot grab hold', ['browser', 'screenshot']))
  step('trigger up', [
    'xr',
    'set-select-value',
    '--input-json',
    JSON.stringify({ device: 'controller-right', value: 0 }),
  ])
  await sleep(400)
  const diffGrab = step('ecs diff after grab', ['ecs', 'diff'], { allowFail: true })
  if (diffGrab) {
    const changed = JSON.stringify(diffGrab.result ?? diffGrab).length > 50
    process.stdout.write(`  ecs diff has content: ${changed}\n`)
  }
  saveScreenshot('03-after-grab-release', step('screenshot after grab', ['browser', 'screenshot']))

  // --- Proximity grab: move grip close, squeeze ---
  step('move controller near cube (proximity)', [
    'xr',
    'set-transform',
    '--input-json',
    JSON.stringify({
      device: 'controller-right',
      position: { x: 0.15, y: 0.3, z: -0.7 },
    }),
  ])
  await sleep(400)
  step('squeeze down', [
    'xr',
    'set-gamepad-state',
    '--input-json',
    JSON.stringify({
      device: 'controller-right',
      buttons: [{ index: 1, value: 1 }],
    }),
  ])
  await sleep(600)
  saveScreenshot('04-proximity-squeeze', step('screenshot proximity', ['browser', 'screenshot']))
  step('squeeze up', [
    'xr',
    'set-gamepad-state',
    '--input-json',
    JSON.stringify({
      device: 'controller-right',
      buttons: [{ index: 1, value: 0 }],
    }),
  ])

  // --- Hand-only mode ---
  step('disconnect controllers', [
    'xr',
    'set-connected',
    '--input-json',
    JSON.stringify({ device: 'controller-left', connected: false }),
  ])
  step('disconnect controller-right', [
    'xr',
    'set-connected',
    '--input-json',
    JSON.stringify({ device: 'controller-right', connected: false }),
  ])
  step('connect hands', [
    'xr',
    'set-connected',
    '--input-json',
    JSON.stringify({ device: 'hand-left', connected: true }),
  ])
  step('connect hand-right', [
    'xr',
    'set-connected',
    '--input-json',
    JSON.stringify({ device: 'hand-right', connected: true }),
  ])
  step('set input mode hand', [
    'xr',
    'set-input-mode',
    '--input-json',
    JSON.stringify({ mode: 'hand' }),
  ])
  await sleep(1500)

  const devState = step('xr device state hand-only', ['xr', 'get-device-state'])
  const devStr = JSON.stringify(devState?.result ?? devState)
  process.stdout.write(`  hand-only state snippet: ${devStr.slice(0, 200)}…\n`)

  saveScreenshot('05-hand-only', step('screenshot hand-only', ['browser', 'screenshot']))

  step('hand pinch at cube', [
    'xr',
    'look-at',
    '--input-json',
    JSON.stringify({
      device: 'hand-right',
      target: { x: 0, y: 0.25, z: -0.85 },
      moveToDistance: 0.4,
    }),
  ])
  step('hand select (pinch)', [
    'xr',
    'select',
    '--input-json',
    JSON.stringify({ device: 'hand-right', duration: 0.2 }),
  ])
  await sleep(500)
  saveScreenshot('06-hand-pinch', step('screenshot hand pinch', ['browser', 'screenshot']))

  // --- Exit panel: look at panel (head-forward ~ -0.42z from head) ---
  step('reconnect controller for exit test', [
    'xr',
    'set-connected',
    '--input-json',
    JSON.stringify({ device: 'controller-right', connected: true }),
  ])
  step('set input mode controller', [
    'xr',
    'set-input-mode',
    '--input-json',
    JSON.stringify({ mode: 'controller' }),
  ])
  step('aim at exit panel area', [
    'xr',
    'look-at',
    '--input-json',
    JSON.stringify({
      device: 'controller-right',
      target: { x: 0, y: 1.45, z: -0.5 },
      moveToDistance: 0.5,
    }),
  ])
  await sleep(400)
  saveScreenshot('07-exit-panel-aim', step('screenshot exit aim', ['browser', 'screenshot']))

  const xrBeforeExit = step('xr status before exit', ['xr', 'status'])
  step('xr exit session', ['xr', 'exit'], { allowFail: true })
  await sleep(800)
  const xrAfterExit = step('xr status after exit', ['xr', 'status'])
  const ended = xrBeforeExit?.result?.sessionActive && !xrAfterExit?.result?.sessionActive
  process.stdout.write(`  session ended via xr exit: ${ended}\n`)

  saveScreenshot('08-after-exit', step('screenshot after exit', ['browser', 'screenshot']))

  step('ecs list systems', ['ecs', 'systems'], { allowFail: true })
  const logs = step('browser logs (errors)', [
    'browser',
    'logs',
    '--input-json',
    JSON.stringify({ level: 'error', limit: 20 }),
  ], { allowFail: true })
  if (logs?.result?.logs?.length) {
    process.stdout.write(`  console errors: ${logs.result.logs.length}\n`)
  }

  const { writeFileSync } = await import('node:fs')
  const reportPath = path.join(outDir, 'report.json')
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        sessionActive,
        hasCube,
        hasExit,
        sessionEnded: ended,
        results,
      },
      null,
      2,
    ),
  )

  console.log(`\n✅ Deep test complete. Report: ${reportPath}`)
  console.log(`   Screenshots: ${outDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
