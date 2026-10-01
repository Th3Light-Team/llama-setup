/**
 * installBinary / registerBinaryInstallHooks against a real in-memory SQLite
 * `installs` table and a stub DownloadManager. HOME is redirected to a temp
 * dir *before* the module loads so nothing touches the real ~/.llama-studio.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const h = vi.hoisted(() => ({
  home: '' as string,
  enqueue: undefined as unknown as ReturnType<typeof vi.fn>,
  cancel: undefined as unknown as ReturnType<typeof vi.fn>,
  onInstalled: undefined as unknown as ReturnType<typeof vi.fn>,
  jobs: new Map<string, Record<string, unknown>>(),
  systemRuntime: false,
  events: undefined as unknown as import('events').EventEmitter
}))

vi.mock('./cuda-runtime', () => ({ hasSystemCudaRuntime: () => h.systemRuntime }))

vi.mock('../../main/db', async () => {
  const Database = (await import('better-sqlite3')).default
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE installs (
    id TEXT PRIMARY KEY, tag TEXT NOT NULL, backend TEXT NOT NULL,
    install_date TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL)`)
  return { db }
})

vi.mock('../../main/downloads/DownloadManager', async () => {
  const { EventEmitter } = await import('events')
  const { mkdtempSync } = await import('fs')
  const { tmpdir } = await import('os')
  const { join } = await import('path')
  h.home = mkdtempSync(join(tmpdir(), 'llama-home-'))
  process.env.HOME = h.home
  process.env.USERPROFILE = h.home
  h.enqueue = vi.fn((spec: { id: string }) => spec.id)
  h.cancel = vi.fn()
  h.onInstalled = vi.fn()
  h.events = new EventEmitter()
  return {
    DownloadManager: {
      getInstance: () => ({
        enqueue: h.enqueue,
        cancel: h.cancel,
        getJob: (id: string) => h.jobs.get(id) ?? null,
        events: h.events
      })
    }
  }
})

import { db } from '../../main/db'
import { installBinary, registerBinaryInstallHooks, getInstalledBinaries, uninstallBinary } from './manager'
import type { ParsedAsset } from './types'

const asset = (over: Partial<ParsedAsset> = {}): ParsedAsset => ({
  filename: 'llama-b8757-bin-ubuntu-x64.tar.gz',
  url: 'https://github.com/ggml-org/llama.cpp/releases/download/b8757/llama-b8757-bin-ubuntu-x64.tar.gz',
  size: 1, downloadCount: 0, os: 'linux', arch: 'x64', backend: 'cpu', ...over
})

beforeEach(() => {
  h.enqueue.mockClear()
  h.cancel.mockClear()
  h.onInstalled.mockClear()
  h.jobs.clear()
  h.systemRuntime = false
  db.prepare('DELETE FROM installs').run()
})
afterAll(() => rmSync(h.home, { recursive: true, force: true }))

describe('installBinary', () => {
  it('enqueues an extracting binary job keyed by tag+backend+arch, using the asset URL as-is', () => {
    const id = installBinary('b8757', asset())
    expect(id).toBe('binary:b8757-cpu-x64')
    const spec = h.enqueue.mock.calls[0][0]
    expect(spec).toMatchObject({
      id: 'binary:b8757-cpu-x64',
      kind: 'binary',
      extractZip: true,
      url: asset().url,
      extra: { installId: 'b8757-cpu-x64', tag: 'b8757', backend: 'cpu', arch: 'x64' }
    })
    expect(spec.targetPath).toBe(join(h.home, '.llama-studio', 'binaries', 'b8757-cpu-x64'))
  })

  it('gives x64 and arm64 builds of the same backend distinct install ids', () => {
    const a = installBinary('b8757', asset({ arch: 'x64', backend: 'vulkan' }))
    const b = installBinary('b8757', asset({ arch: 'arm64', backend: 'vulkan' }))
    expect(a).not.toBe(b)
  })

  it('refuses to reinstall into an existing directory', () => {
    mkdirSync(join(h.home, '.llama-studio', 'binaries', 'b1-cpu-x64'), { recursive: true })
    expect(() => installBinary('b1', asset())).toThrow(/already installed/i)
    expect(h.enqueue).not.toHaveBeenCalled()
  })
})

describe('registerBinaryInstallHooks', () => {
  registerBinaryInstallHooks(h.onInstalled) // attach once; the stub emitter is shared

  const done = (over: Record<string, unknown> = {}) => ({
    kind: 'binary', targetPath: '/x/b1-cpu-x64',
    extra: { installId: 'b1-cpu-x64', tag: 'b1', backend: 'cpu' }, ...over
  })

  it('records a successful binary download in the installs table', async () => {
    h.events.emit('done', done())
    const rows = await getInstalledBinaries()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'b1-cpu-x64', tag: 'b1', backend: 'cpu', path: '/x/b1-cpu-x64', verified: 1 })
  })

  it('is idempotent for a repeated done event', async () => {
    h.events.emit('done', done())
    h.events.emit('done', done())
    expect(await getInstalledBinaries()).toHaveLength(1)
  })

  it('ignores model downloads and binary jobs with incomplete metadata', async () => {
    h.events.emit('done', done({ kind: 'model' }))
    h.events.emit('done', done({ extra: { installId: 'x' } }))
    h.events.emit('done', done({ extra: null }))
    expect(await getInstalledBinaries()).toHaveLength(0)
  })
})

describe('uninstallBinary', () => {
  it('removes the DB row and the install directory', async () => {
    const dir = join(h.home, '.llama-studio', 'binaries', 'b2-cpu-x64')
    mkdirSync(dir, { recursive: true })
    db.prepare("INSERT INTO installs VALUES ('b2-cpu-x64','b2','cpu','2026-01-01',1,?)").run(dir)
    await uninstallBinary('b2-cpu-x64')
    expect(await getInstalledBinaries()).toHaveLength(0)
    expect(() => installBinary('b2', asset())).not.toThrow() // dir is gone again
  })
})

describe('CUDA engine + runtime bundle', () => {
  const cuda = (over: Partial<ParsedAsset> = {}) => asset({
    filename: 'llama-b9-bin-win-cuda-12.4-x64.zip', os: 'windows', backend: 'cuda-cu12.4', ...over
  })
  const rt = (over: Partial<ParsedAsset> = {}) => asset({
    filename: 'cudart-llama-bin-win-cuda-12.4-x64.zip', url: 'https://example.com/cudart-llama-bin-win-cuda-12.4-x64.zip',
    os: 'windows', backend: 'cuda-cu12.4', ...over
  })
  const ID = 'b9-cuda-cu12.4-x64'
  const bin = (...p: string[]) => join(h.home, '.llama-studio', 'binaries', ...p)

  it('enqueues the engine and, in parallel, the runtime into a sibling directory', () => {
    installBinary('b9', cuda(), rt())
    expect(h.enqueue).toHaveBeenCalledTimes(2)
    const [engine, runtime] = h.enqueue.mock.calls.map(c => c[0])
    expect(engine).toMatchObject({ id: `binary:${ID}`, extra: { installId: ID, runtimeJobId: `binary:${ID}:runtime` } })
    expect(runtime).toMatchObject({
      id: `binary:${ID}:runtime`, kind: 'binary', extractZip: true,
      url: rt().url, targetPath: bin(`${ID}.runtime`), extra: { runtimeOf: ID, tag: 'b9' }
    })
    expect(runtime.extra.installId).toBeUndefined() // so UIs keyed on installId follow only the engine job
  })

  it('skips the ~400 MB runtime when the system already has that CUDA version', () => {
    h.systemRuntime = true
    installBinary('b9', cuda(), rt())
    expect(h.enqueue).toHaveBeenCalledTimes(1)
    expect(h.enqueue.mock.calls[0][0].extra.runtimeJobId).toBeUndefined()
  })

  it('does nothing extra for non-CUDA engines, even if a runtime is passed', () => {
    installBinary('b9', asset({ backend: 'vulkan' }), null)
    expect(h.enqueue).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['another CUDA version', { backend: 'cuda-cu13.4' }],
    ['another OS', { os: 'linux' as const }],
    ['another arch', { arch: 'arm64' as const }]
  ])('rejects a runtime for %s', (_name, over) => {
    expect(() => installBinary('b9', cuda(), rt(over))).toThrow(/does not match/)
    expect(h.enqueue).not.toHaveBeenCalled()
  })

  const engineJob = (state = 'done') => ({
    id: `binary:${ID}`, kind: 'binary', state, targetPath: bin(ID),
    extra: { installId: ID, tag: 'b9', backend: 'cuda-cu12.4', runtimeJobId: `binary:${ID}:runtime` }
  })
  const runtimeJob = (state = 'done') => ({
    id: `binary:${ID}:runtime`, kind: 'binary', state, targetPath: bin(`${ID}.runtime`),
    extra: { runtimeOf: ID, tag: 'b9' }
  })
  const settle = () => new Promise(r => setTimeout(r, 50))

  function stageExtracted() {
    mkdirSync(bin(ID), { recursive: true })
    writeFileSync(bin(ID, 'llama-server.exe'), 'engine')
    writeFileSync(bin(ID, 'ggml-cuda.dll'), 'engine-cuda')
    mkdirSync(bin(`${ID}.runtime`), { recursive: true })
    for (const f of ['cudart64_12.dll', 'cublas64_12.dll', 'cublasLt64_12.dll']) writeFileSync(bin(`${ID}.runtime`, f), f)
  }

  it('registers nothing until BOTH downloads are done', async () => {
    stageExtracted()
    h.jobs.set(`binary:${ID}`, engineJob('done'))
    h.jobs.set(`binary:${ID}:runtime`, runtimeJob('downloading'))
    h.events.emit('done', engineJob('done'))
    await settle()
    expect(await getInstalledBinaries()).toHaveLength(0)
    expect(h.onInstalled).not.toHaveBeenCalled()
    expect(existsSync(bin(`${ID}.runtime`))).toBe(true)
  })

  it('merges the runtime DLLs next to the engine, cleans up and registers once both are done', async () => {
    stageExtracted()
    h.jobs.set(`binary:${ID}`, engineJob('done'))
    h.jobs.set(`binary:${ID}:runtime`, runtimeJob('done'))
    h.events.emit('done', runtimeJob('done'))
    await settle()
    expect(readdirSync(bin(ID)).sort()).toEqual(
      ['cublas64_12.dll', 'cublasLt64_12.dll', 'cudart64_12.dll', 'ggml-cuda.dll', 'llama-server.exe'])
    expect(readFileSync(bin(ID, 'llama-server.exe'), 'utf8')).toBe('engine') // engine files untouched
    expect(existsSync(bin(`${ID}.runtime`))).toBe(false)
    const rows = await getInstalledBinaries()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: ID, backend: 'cuda-cu12.4', path: bin(ID) })
    expect(h.onInstalled).toHaveBeenCalledWith(ID)
  })

  it('works whichever job finishes last, and a duplicate event does not double-register', async () => {
    stageExtracted()
    h.jobs.set(`binary:${ID}`, engineJob('done'))
    h.jobs.set(`binary:${ID}:runtime`, runtimeJob('done'))
    h.events.emit('done', engineJob('done'))
    h.events.emit('done', runtimeJob('done'))
    await settle()
    expect(await getInstalledBinaries()).toHaveLength(1)
    expect(h.onInstalled).toHaveBeenCalledTimes(1)
  })

  it('a failed runtime cancels the engine job and removes both directories (no stuck "already installed")', async () => {
    stageExtracted()
    h.events.emit('failed', runtimeJob('failed'))
    await settle()
    expect(h.cancel).toHaveBeenCalledWith(`binary:${ID}`)
    expect(h.cancel).not.toHaveBeenCalledWith(`binary:${ID}:runtime`)
    expect(existsSync(bin(ID))).toBe(false)
    expect(existsSync(bin(`${ID}.runtime`))).toBe(false)
    expect(await getInstalledBinaries()).toHaveLength(0)
    expect(() => installBinary('b9', cuda(), rt())).not.toThrow()
  })

  it('a failed engine cancels the runtime job too', async () => {
    h.events.emit('failed', engineJob('failed'))
    await settle()
    expect(h.cancel).toHaveBeenCalledWith(`binary:${ID}:runtime`)
  })

  it('a plain (non-CUDA) engine download is still registered immediately and announced', async () => {
    h.events.emit('done', { kind: 'binary', targetPath: '/x/b1-cpu-x64', extra: { installId: 'b1-cpu-x64', tag: 'b1', backend: 'cpu' } })
    expect(await getInstalledBinaries()).toHaveLength(1)
    expect(h.onInstalled).toHaveBeenCalledWith('b1-cpu-x64')
  })
})
