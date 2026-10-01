/**
 * First-run smoke test: drives the real Electron app like a brand-new user.
 *
 *   onboarding -> install llama.cpp binary -> download a starter model
 *   -> create a Launch profile -> start llama-server -> ask it for a reply.
 *
 * Needs a built app (`npm run build`) and a display (use xvfb-run on CI).
 * All state goes to a throwaway HOME, so it never touches ~/.llama-studio.
 *
 *   node scripts/smoke/first-run.mjs
 *   SMOKE_MODEL="Qwen 2.5 1.5B" SMOKE_PORT=8080 SMOKE_KEEP=1 node scripts/smoke/first-run.mjs
 */
import { _electron as electron } from 'playwright-core'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const run = promisify(execFile)
const repo = resolve(import.meta.dirname, '../..')
const home = mkdtempSync(join(tmpdir(), 'llama-smoke-'))
const outDir = resolve(process.env.SMOKE_ARTIFACTS ?? join(repo, 'smoke-artifacts'))
const MODEL = process.env.SMOKE_MODEL ?? 'Qwen 2.5 1.5B'
const PORT = Number(process.env.SMOKE_PORT ?? 8080)
const MIN = 60_000
mkdirSync(outDir, { recursive: true })

const t0 = Date.now()
const log = m => console.log(`[smoke +${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`)

function findFiles(dir, pred, acc = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return acc }
  for (const e of entries) {
    const p = join(dir, e)
    let st
    try { st = statSync(p) } catch { continue }
    if (st.isDirectory()) findFiles(p, pred, acc)
    else if (pred(p)) acc.push(p)
  }
  return acc
}

let app, win, step = 'launch'
async function shot(name) {
  try { await win.screenshot({ path: join(outDir, `${name}.png`) }) } catch {}
}
/** The intro tour (Driver.js) auto-starts on some pages and dims the UI; close it like a user would (Esc). */
async function dismissTour() {
  const popover = win.locator('.driver-popover')
  if (await popover.first().isVisible().catch(() => false)) {
    log('closing intro tour popover')
    await win.keyboard.press('Escape')
    await popover.first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }
}
async function stage(name, fn) {
  step = name
  log(`> ${name}`)
  await fn()
  await shot(name.replace(/\W+/g, '-'))
}

async function main() {
  app = await electron.launch({
    args: [repo, '--no-sandbox', ...(process.env.CI ? ['--disable-gpu'] : [])],
    cwd: repo,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), USERPROFILE: home }
  })
  app.process().stdout?.on('data', d => process.stdout.write(`[app] ${d}`))
  app.process().stderr?.on('data', d => process.stderr.write(`[app] ${d}`))
  win = await app.firstWindow()
  win.setDefaultTimeout(30_000)

  await stage('1 welcome', async () => {
    // A fresh profile must be redirected to the onboarding wizard.
    await win.waitForURL(/#\/onboarding/, { timeout: MIN })
    await win.getByText('Guided setup', { exact: true }).click()
  })

  await stage('2 system check', async () => {
    await win.getByText('Hardware detected').waitFor({ timeout: 2 * MIN })
    await win.getByRole('button', { name: 'Continue' }).click()
  })

  await stage('3 find installs', async () => {
    await win.getByRole('button', { name: 'Install a binary' }).click()
  })

  await stage('4 install binary', async () => {
    // Regression: the offered build must match this machine's CPU architecture.
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
    await win.getByText(arch, { exact: true }).waitFor({ timeout: MIN })
    await win.getByRole('button', { name: /^Install .+ build$/ }).click()
    // Fail fast if the UI reports an install error instead of waiting out the timeout.
    const outcome = await Promise.race([
      win.getByText(/already installed/).waitFor({ timeout: 8 * MIN }).then(() => 'ok'),
      win.getByText(/Install failed/).waitFor({ timeout: 8 * MIN }).then(() => 'failed')
    ])
    if (outcome === 'failed') {
      throw new Error(`Binary install failed: ${await win.getByText(/Install failed/).innerText()}`)
    }
    const servers = findFiles(join(home, '.llama-studio', 'binaries'), p => /(^|[\\/])llama-server(\.exe)?$/.test(p))
    if (servers.length !== 1) throw new Error(`expected 1 llama-server on disk, found ${servers.length}`)
    const { stdout, stderr } = await run(servers[0], ['--version'], { timeout: 60_000 })
    log(`llama-server: ${(stdout + stderr).split('\n').find(l => /version/i.test(l))?.trim()}`)
    await win.getByRole('button', { name: 'Continue' }).click()
  })

  await stage('5 download model', async () => {
    await win.getByRole('button', { name: new RegExp(MODEL) }).click()
    await win.getByRole('button', { name: 'Download', exact: true }).click()
    await win.getByText(/Model downloaded and ready/).waitFor({ timeout: 15 * MIN })
    await win.getByRole('button', { name: 'Continue' }).click()
  })

  await stage('6 finish onboarding', async () => {
    await win.getByRole('button', { name: /Open Launch Pad/ }).click()
  })

  const ggufs = findFiles(join(home, '.llama-studio', 'models'), p => p.endsWith('.gguf'))
  if (ggufs.length !== 1) throw new Error(`expected 1 .gguf on disk, found ${ggufs.length}`)

  await stage('7 create profile', async () => {
    await win.waitForTimeout(1500) // give the welcome tour a moment to appear
    await dismissTour()
    await win.getByRole('button', { name: 'New profile' }).last().click()
    await win.locator('input').first().fill('smoke')
    await win.keyboard.press('Enter')
    await win.getByRole('button', { name: 'Configure' }).click()
    await win.locator('input').first().fill(ggufs[0])
    await win.locator('input').first().blur()
    await win.getByRole('button', { name: 'Save changes' }).click()
    await win.getByRole('button', { name: 'Run' }).click()
  })

  await stage('8 start server', async () => {
    await dismissTour()
    await win.getByRole('button', { name: 'Start' }).click()
    await win.getByText(/Running/).first().waitFor({ timeout: 3 * MIN })
  })

  await stage('9 inference', async () => {
    const base = `http://127.0.0.1:${PORT}`
    const deadline = Date.now() + 3 * MIN
    for (;;) {
      try { if ((await fetch(`${base}/health`)).ok) break } catch {}
      if (Date.now() > deadline) throw new Error('llama-server never became healthy')
      await new Promise(r => setTimeout(r, 2000))
    }
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Say hello world in one short sentence.' }],
        max_tokens: 32,
        temperature: 0
      })
    })
    if (!res.ok) throw new Error(`chat completion HTTP ${res.status}`)
    const reply = (await res.json()).choices?.[0]?.message?.content?.trim()
    log(`model replied: ${JSON.stringify(reply)}`)
    if (!reply) throw new Error('empty reply from model')
    if (!/hello/i.test(reply)) throw new Error(`reply does not look like a greeting: ${reply}`)
  })

  await stage('10 stop server', async () => {
    await dismissTour()
    await win.getByRole('button', { name: 'Stop' }).click()
    await win.getByRole('button', { name: 'Start' }).waitFor({ timeout: MIN })
  })
}

let failed = false
try {
  await main()
  log('PASS')
} catch (err) {
  failed = true
  console.error(`\n[smoke] FAILED at step "${step}": ${err?.stack ?? err}`)
  await shot('FAILED')
  try { writeFileSync(join(outDir, 'FAILED.txt'), await win.evaluate(() => document.body.innerText)) } catch {}
} finally {
  try { await app?.close() } catch {}
  if (!process.env.SMOKE_KEEP) rmSync(home, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
