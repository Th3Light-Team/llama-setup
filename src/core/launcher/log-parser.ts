/**
 * Parser for llama-server output. Pure: no process or DOM access.
 *
 * Formats are grounded in llama.cpp b11819 (see docs/llama-server-output.md).
 * Lines that do not match a known pattern become `other` events, so new
 * llama.cpp versions degrade to the raw console instead of breaking the view.
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'plain'

export type LogEvent =
  | { kind: 'loading'; model: string }
  | { kind: 'slots'; slots: number; ctxPerSlot: number }
  | { kind: 'model-loaded' }
  | { kind: 'listening'; url: string; port: number }
  | { kind: 'request-start'; slot: number; task: number }
  | { kind: 'timing'; slot: number; task: number; promptTokens: number | null; promptTps: number | null; genTokens: number | null; genTps: number | null; totalMs: number | null }
  | { kind: 'request-done'; slot: number; task: number; tokens: number }
  | { kind: 'warning'; message: string }
  | { kind: 'http-error'; code: number | null; message: string }
  | { kind: 'stopping' }
  | { kind: 'exited'; code: number | null }
  | { kind: 'other' }

export interface ParsedLine {
  raw: string
  /** Elapsed time since the server started, in ms. Null for lines without a timestamp. */
  elapsedMs: number | null
  level: LogLevel
  module: string | null
  message: string
  event: LogEvent
}

// [M.SS.mmm.uuu] I|W|E module message   (common/log.cpp:124-141)
const PREFIX = /^(\d+)\.(\d{2})\.(\d{3})\.(\d{3})\s+([IWE])\s+(\S+)\s+(.*)$/
// Process lines written by the launcher itself, e.g. "[Process exited with code 1]".
const EXIT = /^\[Process exited with code (-?\d+|null)/
// eslint-disable-next-line no-control-regex -- terminal color codes are the input here
const ANSI = /\x1b\[[0-9;]*m/g

const LEVEL: Record<string, LogLevel> = { I: 'info', W: 'warn', E: 'error' }

function parseEvent(message: string, module: string | null): LogEvent {
  const slotTask = /id\s+(\d+)\s*\|\s*task\s+(-?\d+)/.exec(message)
  const slot = slotTask ? Number(slotTask[1]) : 0
  const task = slotTask ? Number(slotTask[2]) : -1

  if (module === 'srv') {
    let m: RegExpExecArray | null
    if ((m = /loading model '(.+)'/.exec(message))) return { kind: 'loading', model: m[1] }
    if ((m = /initializing, n_slots = (\d+), n_ctx_slot = (\d+)/.exec(message))) {
      return { kind: 'slots', slots: Number(m[1]), ctxPerSlot: Number(m[2]) }
    }
    if (/model loaded/.test(message)) return { kind: 'model-loaded' }
    if ((m = /listening on (https?:\/\/[^\s:]+:(\d+))/.exec(message))) {
      return { kind: 'listening', url: m[1], port: Number(m[2]) }
    }
    if ((m = /got exception: (\{.*\})/.exec(message))) {
      const code = /"code":\s*(\d+)/.exec(m[1])
      const text = /"message":"([^"]*)"/.exec(m[1])
      return { kind: 'http-error', code: code ? Number(code[1]) : null, message: text ? text[1] : m[1] }
    }
    if (/cleaning up before exit/.test(message)) return { kind: 'stopping' }
  }

  if (module === 'slot') {
    if (/processing task/.test(message)) return { kind: 'request-start', slot, task }
    if (/print_timing/.test(message)) {
      const prompt = /prompt eval time =\s*[\d.]+ ms \/\s*(\d+) tokens \(.*?([\d.]+) tokens per second\)/.exec(message)
      const gen = /(?<!prompt )eval time =\s*[\d.]+ ms \/\s*(\d+) tokens \(.*?([\d.]+) tokens per second\)/.exec(message)
      const total = /total time =\s*([\d.]+) ms/.exec(message)
      return {
        kind: 'timing',
        slot,
        task,
        promptTokens: prompt ? Number(prompt[1]) : null,
        promptTps: prompt ? Number(prompt[2]) : null,
        genTokens: gen ? Number(gen[1]) : null,
        genTps: gen ? Number(gen[2]) : null,
        totalMs: total ? Number(total[1]) : null,
      }
    }
    const stop = /stop processing: n_tokens = (\d+)/.exec(message)
    if (stop) return { kind: 'request-done', slot, task, tokens: Number(stop[1]) }
  }

  return { kind: 'other' }
}

export function parseLine(line: string): ParsedLine {
  const raw = line.replace(ANSI, '')
  const prefixed = PREFIX.exec(raw)

  if (prefixed) {
    const [, min, sec, ms, us, lvl, mod, message] = prefixed
    const level = LEVEL[lvl] ?? 'plain'
    const event = parseEvent(message, mod)
    return {
      raw,
      elapsedMs: Number(min) * 60_000 + Number(sec) * 1000 + Number(ms) + Number(us) / 1000,
      level,
      module: mod,
      message,
      // Any other warning is still worth surfacing as a notice.
      event: event.kind === 'other' && level === 'warn' ? { kind: 'warning', message } : event,
    }
  }

  const exit = EXIT.exec(raw)
  if (exit) {
    return { raw, elapsedMs: null, level: 'plain', module: null, message: raw, event: { kind: 'exited', code: exit[1] === 'null' ? null : Number(exit[1]) } }
  }

  return { raw, elapsedMs: null, level: 'plain', module: null, message: raw, event: { kind: 'other' } }
}

// ────────────────────────────────────────────────────────────────────────────
// Summary: a reduction over the parsed log, used by the Summary tab.
// ────────────────────────────────────────────────────────────────────────────

export interface RequestMetrics {
  promptTokens: number | null
  promptTps: number | null
  genTokens: number | null
  genTps: number | null
  totalMs: number | null
}

export interface Notice {
  id: number
  tone: 'info' | 'success' | 'warning' | 'error'
  title: string
  detail: string
  elapsedMs: number | null
  /** Index into the parsed lines, so the Console tab can jump to it. */
  lineIndex: number
}

export interface LaunchSummary {
  /** Ready means the port is listening; serving means a request is in flight. */
  phase: 'idle' | 'loading' | 'ready' | 'serving' | 'error' | 'stopped'
  model: string | null
  quant: string | null
  slots: number | null
  ctxPerSlot: number | null
  port: number | null
  url: string | null
  last: RequestMetrics | null
  /** Generation speed of the last completed requests, oldest first. */
  genHistory: number[]
  requestsDone: number
  notices: Notice[]
}

const QUANT = /\b(IQ\d_[A-Z0-9_]+|Q\d(?:_[A-Z0-9]+)*|BF16|F16|F32)\b/i

/** Pulls a quantization label such as `Q4_K_M` out of a GGUF filename. */
export function quantFromFilename(name: string): string | null {
  const m = QUANT.exec(name)
  return m ? m[1].toUpperCase() : null
}

export function summarizeLog(lines: string[], opts: { running: boolean; errorText: string | null } = { running: false, errorText: null }): LaunchSummary {
  const parsed = lines.map(parseLine)
  const summary: LaunchSummary = {
    phase: opts.running ? 'loading' : 'stopped',
    model: null,
    quant: null,
    slots: null,
    ctxPerSlot: null,
    port: null,
    url: null,
    last: null,
    genHistory: [],
    requestsDone: 0,
    notices: [],
  }

  let inFlight = false
  let pendingTiming: RequestMetrics | null = null
  let noticeId = 0
  let errored = false

  const notify = (n: Omit<Notice, 'id'>) => { summary.notices.push({ ...n, id: noticeId++ }) }

  parsed.forEach((p, lineIndex) => {
    const e = p.event
    switch (e.kind) {
      case 'loading':
        summary.model = e.model.split(/[\\/]/).pop() ?? e.model
        summary.quant = quantFromFilename(summary.model)
        summary.phase = 'loading'
        break
      case 'slots':
        summary.slots = e.slots
        summary.ctxPerSlot = e.ctxPerSlot
        break
      case 'listening':
        summary.port = e.port
        summary.url = e.url
        summary.phase = inFlight ? 'serving' : 'ready'
        notify({ tone: 'success', title: `Listening on :${e.port}`, detail: e.url, elapsedMs: p.elapsedMs, lineIndex })
        break
      case 'request-start':
        inFlight = true
        if (summary.phase !== 'error') summary.phase = 'serving'
        pendingTiming = null
        break
      case 'timing':
        pendingTiming = {
          promptTokens: e.promptTokens ?? pendingTiming?.promptTokens ?? null,
          promptTps: e.promptTps ?? pendingTiming?.promptTps ?? null,
          genTokens: e.genTokens ?? pendingTiming?.genTokens ?? null,
          genTps: e.genTps ?? pendingTiming?.genTps ?? null,
          totalMs: e.totalMs ?? pendingTiming?.totalMs ?? null,
        }
        break
      case 'request-done': {
        inFlight = false
        summary.requestsDone++
        const timing = pendingTiming
        if (timing) {
          summary.last = timing
          if (timing.genTps !== null) summary.genHistory = [...summary.genHistory.slice(-19), timing.genTps]
        }
        const tokens = timing?.genTokens ?? e.tokens
        const took = timing?.totalMs != null ? ` in ${Math.round(timing.totalMs)} ms` : ''
        notify({ tone: 'success', title: 'Completion finished', detail: `${tokens} tokens${took}`, elapsedMs: p.elapsedMs, lineIndex })
        pendingTiming = null
        if (summary.phase === 'serving') summary.phase = 'ready'
        break
      }
      case 'warning':
        notify({ tone: 'warning', title: 'Warning', detail: e.message, elapsedMs: p.elapsedMs, lineIndex })
        break
      case 'http-error':
        notify({ tone: 'error', title: `Request rejected${e.code ? ` (${e.code})` : ''}`, detail: e.message, elapsedMs: p.elapsedMs, lineIndex })
        break
      case 'stopping':
        notify({ tone: 'info', title: 'Stopping server', detail: 'Shutting down cleanly.', elapsedMs: p.elapsedMs, lineIndex })
        break
      case 'exited':
        if (e.code !== null && e.code !== 0) {
          errored = true
          notify({ tone: 'error', title: 'Server exited', detail: `Exit code ${e.code}`, elapsedMs: null, lineIndex })
        } else {
          notify({ tone: 'info', title: 'Server stopped', detail: 'The process exited.', elapsedMs: null, lineIndex })
        }
        break
      default:
        if (p.level === 'error' && !errored) {
          notify({ tone: 'error', title: 'Error', detail: p.message, elapsedMs: p.elapsedMs, lineIndex })
        }
    }
  })

  if (opts.errorText) {
    errored = true
  }
  if (errored) summary.phase = 'error'
  else if (!opts.running && summary.phase !== 'stopped') summary.phase = 'stopped'

  summary.notices.reverse()
  return summary
}
