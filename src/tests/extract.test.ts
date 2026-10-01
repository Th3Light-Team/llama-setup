/**
 * Real-filesystem tests for archive extraction (no mocks): builds tiny
 * .tar.gz / .zip archives in a temp dir and extracts them with the production
 * code. Covers the llama.cpp Linux/macOS release layout (.tar.gz wrapping a
 * single top-level folder) that broke first-run installs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import { extractTarGzTo, extractArchiveTo } from '../main/downloads/verifiers'

function hasCli(cmd: string, args: string[]): boolean {
  try { execFileSync(cmd, args, { stdio: 'ignore' }); return true } catch { return false }
}
const HAS_TAR = hasCli('tar', ['--version'])
const HAS_ZIP = hasCli('zip', ['-v'])

let work: string

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'llama-extract-'))
})
afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

/** Create <work>/src with the given files, return its path. */
async function makeSrc(files: Record<string, string>): Promise<string> {
  const src = join(work, 'src')
  for (const [rel, content] of Object.entries(files)) {
    const full = join(src, rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, content)
  }
  return src
}

/** tar -czf <archive> -C <cwd> <entries...> */
function makeTarGz(archive: string, cwd: string, entries: string[]): void {
  execFileSync('tar', ['-czf', archive, '-C', cwd, ...entries])
}

describe.skipIf(!HAS_TAR)('extractTarGzTo', () => {
  it('hoists the contents of a single top-level folder into the target (llama.cpp layout)', async () => {
    const src = await makeSrc({
      'llama-b8757/llama-server': 'SERVER',
      'llama-b8757/libggml.so': 'LIB',
      'llama-b8757/models/readme.txt': 'nested'
    })
    const archive = join(work, 'llama-b8757-bin-ubuntu-x64.tar.gz')
    makeTarGz(archive, src, ['llama-b8757'])

    const target = join(work, 'out')
    await extractTarGzTo(archive, target)

    expect((await readdir(target)).sort()).toEqual(['libggml.so', 'llama-server', 'models'])
    expect(await readFile(join(target, 'llama-server'), 'utf8')).toBe('SERVER')
    expect(await readFile(join(target, 'models', 'readme.txt'), 'utf8')).toBe('nested')
  })

  it('does not hoist when the archive has multiple top-level entries', async () => {
    const src = await makeSrc({ 'llama-server': 'S', 'libggml.so': 'L', 'bin/tool': 'T' })
    const archive = join(work, 'flat.tar.gz')
    makeTarGz(archive, src, ['llama-server', 'libggml.so', 'bin'])

    const target = join(work, 'out')
    await extractTarGzTo(archive, target)

    expect((await readdir(target)).sort()).toEqual(['bin', 'libggml.so', 'llama-server'])
    expect(await readFile(join(target, 'bin', 'tool'), 'utf8')).toBe('T')
  })

  it('does not hoist a lone top-level FILE', async () => {
    const src = await makeSrc({ 'llama-server': 'S' })
    const archive = join(work, 'one.tar.gz')
    makeTarGz(archive, src, ['llama-server'])

    const target = join(work, 'out')
    await extractTarGzTo(archive, target)
    expect(await readdir(target)).toEqual(['llama-server'])
  })

  it('creates the target directory when it does not exist (nested path)', async () => {
    const src = await makeSrc({ 'a/b': 'x' })
    const archive = join(work, 'a.tar.gz')
    makeTarGz(archive, src, ['a'])
    const target = join(work, 'deep', 'er', 'out')
    await extractTarGzTo(archive, target)
    expect((await stat(join(target, 'b'))).isFile()).toBe(true)
  })

  it('rejects for a corrupt archive instead of silently succeeding', async () => {
    const archive = join(work, 'bad.tar.gz')
    await writeFile(archive, 'this is not a gzip stream')
    await expect(extractTarGzTo(archive, join(work, 'out'))).rejects.toThrow()
  })
})

describe.skipIf(!HAS_TAR)('extractArchiveTo dispatch', () => {
  async function tarFixture(name: string): Promise<string> {
    const src = await makeSrc({ 'top/llama-server': 'S' })
    const archive = join(work, name)
    makeTarGz(archive, src, ['top'])
    return archive
  }

  it('routes a .tar.gz source URL to tar extraction', async () => {
    const archive = await tarFixture('dl.part') // on disk the file is a ".part", only the URL tells the type
    const target = join(work, 'out')
    await extractArchiveTo(archive, 'https://github.com/x/releases/download/b1/llama-b1-bin-ubuntu-x64.tar.gz', target)
    expect(await readdir(target)).toEqual(['llama-server'])
  })

  it('ignores a query string and upper-case extension when deciding by URL', async () => {
    const archive = await tarFixture('dl.part')
    const target = join(work, 'out')
    await extractArchiveTo(archive, 'https://cdn.example.com/LLAMA-B1.TAR.GZ?token=abc.zip', target)
    expect(await readdir(target)).toEqual(['llama-server'])
  })

  it('routes .tgz to tar extraction', async () => {
    const archive = await tarFixture('dl.part')
    const target = join(work, 'out')
    await extractArchiveTo(archive, 'https://example.com/llama.tgz', target)
    expect(await readdir(target)).toEqual(['llama-server'])
  })
})

describe.skipIf(!HAS_ZIP)('extractArchiveTo: zip', () => {
  it('routes a .zip source URL to zip extraction and does NOT hoist', async () => {
    const src = await makeSrc({ 'llama-server.exe': 'EXE', 'ggml.dll': 'DLL' })
    const archive = join(work, 'win.part')
    execFileSync('zip', ['-qr', archive + '.zip', '.'], { cwd: src })
    const target = join(work, 'out')
    await extractArchiveTo(archive + '.zip', 'https://example.com/llama-b1-bin-win-cpu-x64.zip', target)
    expect((await readdir(target)).sort()).toEqual(['ggml.dll', 'llama-server.exe'])
    expect(await readFile(join(target, 'llama-server.exe'), 'utf8')).toBe('EXE')
  })

  it('a zip is not mistaken for a tarball (extract-zip handles it even with a .tar.gz-free URL)', async () => {
    const src = await makeSrc({ 'only-dir/inner.txt': 'x' })
    execFileSync('zip', ['-qr', join(work, 'z.zip'), 'only-dir'], { cwd: src })
    const target = join(work, 'out')
    await extractArchiveTo(join(work, 'z.zip'), 'https://example.com/a.zip?x=1', target)
    // zip path keeps the folder (hoisting is a tar-only behaviour)
    expect(await readdir(target)).toEqual(['only-dir'])
  })
})
