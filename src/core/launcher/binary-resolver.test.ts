import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { resolveLlamaBinary } from './binary-resolver'

const EXE = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'
let root: string

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'llama-resolve-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

async function touch(...parts: string[]): Promise<string> {
  const p = join(root, ...parts)
  await mkdir(join(p, '..'), { recursive: true })
  await writeFile(p, '')
  return p
}

describe('resolveLlamaBinary', () => {
  it('finds the binary at the install root (flat layout after tar hoisting / zip)', async () => {
    const p = await touch(EXE)
    expect(resolveLlamaBinary(root, 'llama-server')).toBe(p)
  })

  it('finds it under bin/', async () => {
    const p = await touch('bin', EXE)
    expect(resolveLlamaBinary(root, 'llama-server')).toBe(p)
  })

  it('finds it under build/bin/ (source-build layout)', async () => {
    const p = await touch('build', 'bin', EXE)
    expect(resolveLlamaBinary(root, 'llama-server')).toBe(p)
  })

  it('prefers root over bin/ over build/bin/', async () => {
    const deep = await touch('build', 'bin', EXE)
    expect(resolveLlamaBinary(root, 'llama-server')).toBe(deep)
    const mid = await touch('bin', EXE)
    expect(resolveLlamaBinary(root, 'llama-server')).toBe(mid)
    const top = await touch(EXE)
    expect(resolveLlamaBinary(root, 'llama-server')).toBe(top)
  })

  it('resolves other llama tools by name (llama-bench) independently', async () => {
    const bench = await touch(process.platform === 'win32' ? 'llama-bench.exe' : 'llama-bench')
    expect(resolveLlamaBinary(root, 'llama-bench')).toBe(bench)
    expect(resolveLlamaBinary(root, 'llama-server')).toBeNull()
  })

  it('returns null when nothing matches, including a still-nested (un-hoisted) layout', async () => {
    expect(resolveLlamaBinary(root, 'llama-server')).toBeNull()
    await touch('llama-b8757', EXE) // one folder too deep: documents the contract
    expect(resolveLlamaBinary(root, 'llama-server')).toBeNull()
  })

  it('returns null for a non-existent install path', () => {
    expect(resolveLlamaBinary(join(root, 'nope'), 'llama-server')).toBeNull()
  })
})
