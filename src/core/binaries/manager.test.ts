/**
 * installBinary / registerBinaryInstallHooks against a real in-memory SQLite
 * `installs` table and a stub DownloadManager. HOME is redirected to a temp
 * dir *before* the module loads so nothing touches the real ~/.llama-studio.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const h = vi.hoisted(() => ({
  home: '' as string,
  enqueue: undefined as unknown as ReturnType<typeof vi.fn>,
  events: undefined as unknown as import('events').EventEmitter
}))

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
  h.events = new EventEmitter()
  return { DownloadManager: { getInstance: () => ({ enqueue: h.enqueue, events: h.events }) } }
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
  registerBinaryInstallHooks() // attach once; the stub emitter is shared

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
