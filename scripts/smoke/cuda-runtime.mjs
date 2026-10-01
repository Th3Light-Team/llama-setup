/**
 * CUDA install smoke test (Linux, no GPU needed): installs the newest CUDA engine
 * build from the latest llama.cpp release THROUGH THE APP and checks that its
 * cudart/cuBLAS runtime bundle was downloaded and merged next to the binary.
 *
 * Guards against upstream naming drift (new CUDA versions, renamed cudart
 * bundles) and against regressions in the engine + runtime install flow.
 * Downloads ~0.7 GB, so CI runs it weekly / on demand only.
 *
 *   node scripts/smoke/cuda-runtime.mjs        (needs `npm run build`, and xvfb-run on CI)
 */
import { _electron as electron } from 'playwright-core'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const run = promisify(execFile)
const repo = resolve(import.meta.dirname, '../..')
const home = mkdtempSync(join(tmpdir(), 'cuda-smoke-'))
const t0 = Date.now()
const log = m => console.log(`[cuda-smoke +${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`)
const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

let app
let failed = false
try {
  app = await electron.launch({
    args: [repo, '--no-sandbox', ...(process.env.CI ? ['--disable-gpu'] : [])],
    cwd: repo,
    env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config') }
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')

  const { tag, asset, runtime } = await win.evaluate(async () => {
    const [rel] = await window.electron.binaries.listReleases(true)
    const cuda = rel.assets
      .filter(a => a.os === 'linux' && a.arch === 'x64' && a.backend.startsWith('cuda'))
      .sort((a, b) => b.backend.localeCompare(a.backend, undefined, { numeric: true }))
    const asset = cuda[0]
    const runtime = asset && rel.runtimes.find(r => r.os === asset.os && r.arch === asset.arch && r.backend === asset.backend)
    return { tag: rel.tag, asset, runtime }
  })
  assert(asset, 'latest release has no linux/x64 CUDA engine asset (parseAsset or upstream naming changed?)')
  assert(/^cuda-cu\d+(\.\d+)?$/.test(asset.backend), `CUDA asset not parsed to a versioned backend: ${asset.backend}`)
  assert(runtime, `no cudart runtime bundle matched ${asset.filename} (parseRuntimeAsset or upstream naming changed?)`)
  log(`installing ${asset.filename} (${asset.backend}) + ${runtime.filename}`)

  await win.evaluate(([t, a]) => window.electron.binaries.install(t, a), [tag, asset])

  const deadline = Date.now() + 15 * 60_000
  let installId
  for (;;) {
    const st = await win.evaluate(async () => ({
      jobs: (await window.electron.downloads.list()).map(j => ({ id: j.id, state: j.state, error: j.errorMessage })),
      installed: (await window.electron.binaries.getInstalled()).map(i => i.id)
    }))
    const bad = st.jobs.find(j => j.state === 'failed' || j.state === 'cancelled')
    assert(!bad, `download ${bad?.id} ${bad?.state}: ${bad?.error}`)
    if (st.installed.length) { installId = st.installed[0]; break }
    assert(Date.now() < deadline, `timed out; jobs: ${JSON.stringify(st.jobs)}`)
    await new Promise(r => setTimeout(r, 2000))
  }

  const bdir = join(home, '.llama-studio', 'binaries')
  assert(readdirSync(bdir).join() === installId, `unexpected leftovers in binaries/: ${readdirSync(bdir)}`)
  const files = readdirSync(join(bdir, installId))
  for (const lib of [/^libcudart\.so\.\d+$/, /^libcublas\.so\.\d+$/, /^libcublasLt\.so\.\d+$/, /^libggml-cuda\.so$/]) {
    assert(files.some(f => lib.test(f)), `${lib} missing from install dir`)
  }
  assert(files.includes('llama-server'), 'llama-server missing')

  // Every CUDA dependency must resolve inside the install dir; only the driver's libcuda may be absent (no GPU here).
  const { stdout } = await run('ldd', [join(bdir, installId, 'libggml-cuda.so')])
  const unresolved = stdout.split('\n').filter(l => /not found/.test(l) && !/libcuda\.so/.test(l))
  assert(unresolved.length === 0, `unresolved libraries:\n${unresolved.join('\n')}`)
  log(`PASS: ${installId} installed with its CUDA runtime`)
} catch (err) {
  failed = true
  console.error(`[cuda-smoke] FAILED: ${err?.stack ?? err}`)
} finally {
  try { await app?.close() } catch {}
  rmSync(home, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
