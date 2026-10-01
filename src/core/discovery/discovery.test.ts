import { describe, it, expect } from 'vitest'
import { parseVersionString, checkDependencies } from './health'

describe('parseVersionString', () => {
  it('parses "version: NNNN (HASH)" format', () => {
    const result = parseVersionString('version: 4358 (42c3bb5e)')
    expect(result.build).toBe(4358)
    expect(result.commit).toBe('42c3bb5e')
    expect(result.raw).toBe('version: 4358 (42c3bb5e)')
  })

  it('parses "bNNNN" format', () => {
    const result = parseVersionString('b8492')
    expect(result.build).toBe(8492)
    expect(result.raw).toBe('b8492')
  })

  it('parses build number from multiline output', () => {
    const result = parseVersionString('ggml_init: loaded b8492\nsome other output')
    expect(result.build).toBe(8492)
  })

  it('handles pure numeric version', () => {
    const result = parseVersionString('4358')
    expect(result.build).toBe(4358)
    expect(result.commit).toBeNull()
  })

  it('handles "version: NNNN (HASH)" with extra whitespace', () => {
    const result = parseVersionString('  version:  9037  (abc1234def)  ')
    expect(result.build).toBe(9037)
    expect(result.commit).toBe('abc1234def')
  })

  it('returns null build for unparseable output', () => {
    const result = parseVersionString('some random text without version')
    expect(result.build).toBeNull()
    expect(result.commit).toBeNull()
    expect(result.raw).toBe('some random text without version')
  })

  it('handles empty string', () => {
    const result = parseVersionString('')
    expect(result.build).toBeNull()
    expect(result.raw).toBe('')
  })

  it('handles "b" prefix with small numbers (below 3 digits threshold)', () => {
    // "b12" should NOT match — our threshold is 3+ digits
    const result = parseVersionString('b12')
    expect(result.build).toBeNull()
  })

  it('parses version with commit hash in build-style output', () => {
    const result = parseVersionString('b9037 (commit abc1234)')
    expect(result.build).toBe(9037)
  })

  // Real llama-cli on Windows prints the version line to *stderr*, interleaved
  // with the backend-load status, then a "built with Clang..." footer.
  // analyzeBinary now feeds combined stdout+stderr to parseVersionString, so
  // this string must parse cleanly even though most of it is non-version noise.
  it('parses version embedded in llama-cli combined stdout+stderr', () => {
    const combined = [
      '',                                                     // empty stdout
      'load_backend: loaded RPC backend from C:\\...\\ggml-rpc.dll',
      'load_backend: loaded Vulkan backend from C:\\...\\ggml-vulkan.dll',
      'load_backend: loaded CPU backend from C:\\...\\ggml-cpu-zen4.dll',
      'version: 8757 (a29e4c0b7)',
      'built with Clang 19.1.5 for Windows x86_64',
    ].join('\n')
    const result = parseVersionString(combined)
    expect(result.build).toBe(8757)
    expect(result.commit).toBe('a29e4c0b7')
  })
})

describe('PathAnalysis', () => {
  // Note: Full integration tests require mocking fs operations
  // These tests validate the analysis logic

  it('should be importable', async () => {
    const { buildPathAnalysis } = await import('./path-analysis')
    expect(buildPathAnalysis).toBeDefined()
  })

  it('detects empty PATH entries', async () => {
    const { buildPathAnalysis } = await import('./path-analysis')
    const result = buildPathAnalysis([])
    expect(result.entries).toHaveLength(0)
    // The "binaries dir not on PATH" warning depends on whether the host has
    // already run the app (~/.llama-studio/binaries exists), so ignore it here.
    expect(result.warnings.filter(w => !w.startsWith('Llama Studio binaries directory'))).toEqual([])
  })

  it('generates warning for non-existent PATH directory', async () => {
    const { buildPathAnalysis } = await import('./path-analysis')
    const result = buildPathAnalysis([{
      directory: '/some/nonexistent/path',
      exists: false,
      containsLlama: false,
      llamaBinaries: [],
      priority: 0
    }])
    expect(result.warnings.length).toBeGreaterThanOrEqual(1)
    expect(result.warnings[0]).toContain('non-existent')
  })

  it('detects shadowed binaries', async () => {
    const { buildPathAnalysis } = await import('./path-analysis')
    const result = buildPathAnalysis([
      { directory: '/usr/local/bin', exists: true, containsLlama: true, llamaBinaries: ['llama-server'], priority: 0 },
      { directory: '/usr/bin', exists: true, containsLlama: true, llamaBinaries: ['llama-server'], priority: 1 }
    ])
    const shadowWarning = result.warnings.find(w => w.includes('llama-server') && w.includes('PATH'))
    expect(shadowWarning).toBeDefined()
  })
})

describe('Discovery types', () => {
  it('should export all required types', async () => {
    const types = await import('./types')
    // Verify the module exports are accessible (compile-time check mostly)
    expect(types).toBeDefined()
  })
})

describe('checkDependencies', () => {
  const BIN = 'C:/fake/llama-bench.exe'

  it('passes when binary executes successfully', () => {
    const r = checkDependencies(BIN, { ok: true, stdout: 'b8757 (abc1234)', error: '' })
    expect(r.passed).toBe(true)
  })

  // The bug: llama-bench --version exits non-zero and prints a usage banner
  // whose stderr includes the names of successfully-loaded backend libraries
  // ("ggml-vulkan.dll", "ggml-rpc.dll", ...).  The old heuristic matched the
  // bare substring "dll" and flagged the binary as Broken.
  it('does NOT flag llama-bench as broken when --version prints usage + loaded-backend log', () => {
    const stderr = [
      'load_backend: loaded RPC backend from C:\\path\\ggml-rpc.dll',
      'load_backend: loaded Vulkan backend from C:\\path\\ggml-vulkan.dll',
      'load_backend: loaded CPU backend from C:\\path\\ggml-cpu-zen4.dll',
      'error: invalid parameter for argument: --version',
      'usage: llama-bench.exe [options]',
    ].join('\n')
    const r = checkDependencies(BIN, { ok: false, stdout: '', error: stderr })
    expect(r.passed).toBe(true)
    expect(r.detail).toMatch(/usage|argument/i)
  })

  it('flags actual missing-DLL errors', () => {
    const stderr = 'The code execution cannot proceed because vcruntime140.dll was not found.'
    const r = checkDependencies(BIN, { ok: false, stdout: '', error: stderr })
    expect(r.passed).toBe(false)
    expect(r.detail).toMatch(/dll|runtime/i)
  })

  it('flags wrong-architecture binaries', () => {
    const r = checkDependencies(BIN, {
      ok: false, stdout: '',
      error: '%1 is not a valid Win32 application'
    })
    expect(r.passed).toBe(false)
  })

  it('does NOT flag broken just because stderr mentions .so filenames', () => {
    // Equivalent on Linux: backend log mentions ggml-cuda.so but binary works
    const stderr = [
      'load_backend: loaded CUDA backend from /opt/llama/libggml-cuda.so',
      'error: missing required argument',
      'usage: llama-bench [options]',
    ].join('\n')
    const r = checkDependencies(BIN, { ok: false, stdout: '', error: stderr })
    expect(r.passed).toBe(true)
  })

  it('flags real Linux shared library errors', () => {
    const stderr = './llama-cli: error while loading shared libraries: libcuda.so.1: cannot open shared object file: No such file or directory'
    const r = checkDependencies(BIN, { ok: false, stdout: '', error: stderr })
    expect(r.passed).toBe(false)
  })
})
