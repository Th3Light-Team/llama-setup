/**
 * Tests for the llama-server output parser, against a real capture from llama.cpp b11819.
 * See docs/llama-server-output.md for the formats.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseLine, summarizeLog, quantFromFilename } from '../core/launcher/log-parser'

const fixture = readFileSync(new URL('./fixtures/llama-server-b11819.stderr.log', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)

describe('parseLine: timestamp and prefix', () => {
  it('reads M.SS.mmm.uuu as elapsed milliseconds', () => {
    const p = parseLine('0.08.981.640 I cmn          init: llama threadpool init, n_threads = 12')
    expect(p.elapsedMs).toBeCloseTo(8981.64, 2)
    expect(p.level).toBe('info')
    expect(p.module).toBe('cmn')
  })

  it('maps W and E to warn and error', () => {
    expect(parseLine('0.00.119.006 W srv  llama_server: security: no API key').level).toBe('warn')
    expect(parseLine('0.00.119.006 E srv  boom').level).toBe('error')
  })

  it('strips ANSI color codes before parsing', () => {
    const p = parseLine('\x1b[34m0.00.001.514\x1b[0m \x1b[32mI\x1b[0m srv  llama_server: model loaded')
    expect(p.raw).toBe('0.00.001.514 I srv  llama_server: model loaded')
    expect(p.event.kind).toBe('model-loaded')
  })

  it('keeps unknown lines as other events without throwing', () => {
    const p = parseLine('some continuation line with no prefix')
    expect(p.elapsedMs).toBeNull()
    expect(p.event.kind).toBe('other')
  })
})

describe('parseLine: events from the real capture', () => {
  const events = fixture.map(parseLine)
  const kinds = events.map(e => e.event.kind)

  it('finds the startup sequence in order', () => {
    const order = ['loading', 'slots', 'model-loaded', 'listening']
    const found = kinds.filter(k => order.includes(k))
    expect(found).toEqual(order)
  })

  it('extracts the model path, slots and context', () => {
    const loading = events.find(e => e.event.kind === 'loading')!.event
    expect(loading).toMatchObject({ kind: 'loading' })
    expect((loading as { model: string }).model).toMatch(/Llama-3\.2-3B-Instruct-Q4_K_M\.gguf$/)
    expect(events.find(e => e.event.kind === 'slots')!.event).toEqual({ kind: 'slots', slots: 4, ctxPerSlot: 2048 })
  })

  it('extracts the listening port and url', () => {
    expect(events.find(e => e.event.kind === 'listening')!.event).toEqual({
      kind: 'listening',
      url: 'http://127.0.0.1:8099',
      port: 8099,
    })
  })

  it('extracts prompt and generation metrics from print_timing', () => {
    const timing = events.find(e => e.event.kind === 'timing' && e.event.promptTokens !== null)!.event
    expect(timing).toEqual({
      kind: 'timing',
      slot: 0,
      task: 0,
      promptTokens: 42,
      promptTps: 196.32,
      genTokens: null,
      genTps: null,
      totalMs: null,
    })
    const gen = events.find(e => e.event.kind === 'timing' && e.event.genTps !== null)!.event
    expect(gen).toMatchObject({ genTokens: 11, genTps: 24.38 })
    const total = events.find(e => e.event.kind === 'timing' && e.event.totalMs !== null)!.event
    expect(total).toMatchObject({ totalMs: 624.09 })
  })

  it('does not treat the prompt eval line as generation', () => {
    const prompt = events.find(e => e.event.kind === 'timing' && e.event.promptTokens !== null)!.event
    expect(prompt).toMatchObject({ genTokens: null })
  })

  it('detects request start and done', () => {
    expect(kinds).toContain('request-start')
    expect(events.find(e => e.event.kind === 'request-done')!.event).toEqual({
      kind: 'request-done',
      slot: 0,
      task: 0,
      tokens: 52,
    })
  })

  it('extracts an HTTP error with its code and message', () => {
    const err = events.find(e => e.event.kind === 'http-error')!.event
    expect(err).toMatchObject({ kind: 'http-error', code: 400 })
    expect((err as { message: string }).message).toContain('parse_error')
  })

  it('detects the cleanup-before-exit line as stopping', () => {
    expect(kinds).toContain('stopping')
  })

  it('reports the no-API-key security warning as a warning', () => {
    const warn = events.find(e => e.level === 'warn' && e.module === 'srv')!
    expect(warn.message).toContain('no API key is set')
  })
})

describe('parseLine: launcher-written lines', () => {
  it('reads a non-zero exit code', () => {
    expect(parseLine('[Process exited with code 1]').event).toEqual({ kind: 'exited', code: 1 })
  })

  it('reads a clean exit', () => {
    expect(parseLine('[Process exited with code 0]').event).toEqual({ kind: 'exited', code: 0 })
  })
})

describe('quantFromFilename', () => {
  it('finds common quantization labels', () => {
    expect(quantFromFilename('Llama-3.2-3B-Instruct-Q4_K_M.gguf')).toBe('Q4_K_M')
    expect(quantFromFilename('model-Q8_0.gguf')).toBe('Q8_0')
    expect(quantFromFilename('model-IQ4_XS.gguf')).toBe('IQ4_XS')
    expect(quantFromFilename('model-F16.gguf')).toBe('F16')
  })

  it('returns null when there is no label', () => {
    expect(quantFromFilename('plain-model.gguf')).toBeNull()
  })
})

describe('summarizeLog', () => {
  it('builds the running summary from the full capture', () => {
    const s = summarizeLog(fixture, { running: true, errorText: null })
    expect(s.model).toBe('Llama-3.2-3B-Instruct-Q4_K_M.gguf')
    expect(s.quant).toBe('Q4_K_M')
    expect(s.slots).toBe(4)
    expect(s.ctxPerSlot).toBe(2048)
    expect(s.port).toBe(8099)
    expect(s.requestsDone).toBe(1)
    expect(s.last).toMatchObject({ promptTps: 196.32, genTps: 24.38, genTokens: 11, totalMs: 624.09 })
    expect(s.genHistory).toEqual([24.38])
    expect(s.phase).toBe('ready')
  })

  it('creates one notice per notable event, newest first', () => {
    const s = summarizeLog(fixture, { running: true, errorText: null })
    const titles = s.notices.map(n => n.title)
    expect(titles[0]).toBe('Stopping server')
    expect(titles).toContain('Listening on :8099')
    expect(titles).toContain('Request rejected (400)')
    expect(titles).toContain('Completion finished')
    expect(titles).toContain('Warning')
  })

  it('marks the server stopped when it is no longer running', () => {
    expect(summarizeLog(fixture, { running: false, errorText: null }).phase).toBe('stopped')
  })

  it('marks the server as in error after a non-zero exit', () => {
    const s = summarizeLog([...fixture, '[Process exited with code 1]'], { running: false, errorText: null })
    expect(s.phase).toBe('error')
    expect(s.notices[0]).toMatchObject({ tone: 'error', title: 'Server exited', detail: 'Exit code 1' })
  })

  it('shows serving while a request is in flight', () => {
    const lines = fixture.slice(0, fixture.findIndex(l => l.includes('stop processing')))
    expect(summarizeLog(lines, { running: true, errorText: null }).phase).toBe('serving')
  })

  it('is empty and stopped with no logs', () => {
    const s = summarizeLog([], { running: false, errorText: null })
    expect(s.phase).toBe('stopped')
    expect(s.notices).toEqual([])
    expect(s.genHistory).toEqual([])
  })
})
