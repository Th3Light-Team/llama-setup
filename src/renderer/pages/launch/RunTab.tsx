import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, Copy, Check, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { useLauncherStore, useBinariesStore } from '@/lib/stores'
import { cn } from '@/lib/utils'
import type { Profile } from '../../../core/launcher/types'
import { RunSummary } from './RunSummary'

interface RunTabProps {
  profile: Profile
}

type OutputView = 'summary' | 'console'
const OUTPUT_VIEWS: { id: OutputView; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'console', label: 'Console' },
]

export function RunTab({ profile }: RunTabProps) {
  const {
    flagCatalog, flagValues, serverStatus, logs,
    startServer, stopServer, pollStatus, initLogListener, clearLogs
  } = useLauncherStore()
  const { installed } = useBinariesStore()
  const [copied, setCopied] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const [defaultEnginePath, setDefaultEnginePath] = useState<string | null>(null)
  const [view, setView] = useState<OutputView>('summary')
  const [focusLine, setFocusLine] = useState<number | null>(null)
  // satisfy noUnusedLocals — `profile` is held so callers can key us by profile id
  void profile

  useEffect(() => {
    const cleanup = initLogListener()
    return cleanup
  }, [initLogListener])

  // Resolve which engine to launch: the user-chosen default from the Binaries
  // page, falling back to the first managed install. Replaces the old blind
  // `installed[0]`.
  useEffect(() => {
    window.electron.engines.getDefault().then(setDefaultEnginePath).catch(() => {})
  }, [])

  useEffect(() => {
    if (serverStatus.state === 'starting' || serverStatus.state === 'running') {
      const interval = setInterval(() => pollStatus(), 2000)
      return () => clearInterval(interval)
    }
  }, [serverStatus.state])

  // Follow the tail in the console, unless the user jumped to a specific line.
  useEffect(() => {
    if (view === 'console' && focusLine === null) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, view, focusLine])

  useEffect(() => {
    if (view !== 'console' || focusLine === null) return
    document.getElementById(`log-line-${focusLine}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [view, focusLine])

  function jumpToLine(index: number) {
    setFocusLine(index)
    setView('console')
  }

  function switchView(next: OutputView) {
    setView(next)
    if (next === 'summary') setFocusLine(null)
  }

  const installPath = defaultEnginePath ?? installed[0]?.path ?? null

  const cliPreview = useMemo(() => {
    // Mirror the resolution rule in core/launcher/server.ts:resolveLlamaBinary:
    // the install path is a directory; the actual exe lives at
    // <dir>/llama-server[.exe] (or under bin/ / build/bin/).  Showing the
    // bare directory contradicted what we then spawned.
    const installDir = installPath ?? undefined
    const isWin = navigator.userAgent.toLowerCase().includes('windows')
    const exe = isWin ? 'llama-server.exe' : 'llama-server'
    const binaryPath = installDir
      ? `${installDir}${installDir.endsWith('\\') || installDir.endsWith('/') ? '' : (isWin ? '\\' : '/')}${exe}`
      : exe
    const quoted = binaryPath.includes(' ') ? `"${binaryPath}"` : binaryPath

    // Use the live store flagValues so unsaved edits show up in the preview
    // (the actual `start` call passes the same store state to the launcher).
    const args = Object.entries(flagValues ?? {})
      .filter(([k, v]) => {
        const def = flagCatalog.find(f => f.key === k)
        if (!def) return false
        if (v === def.default && !def.alwaysEmit) return false
        if (typeof v === 'string' && v.trim() === '') return false
        return true
      })
      .map(([k, v]) => {
        const def = flagCatalog.find(f => f.key === k)!
        if (def.type === 'boolean') return v ? def.flag : ''
        const strVal = String(v)
        const valQuoted = strVal.includes(' ') ? `"${strVal}"` : strVal
        return `${def.flag} ${valQuoted}`
      })
      .filter(Boolean)
      .join(' ')
    return `${quoted}${args ? ' ' + args : ''}`
  }, [flagValues, flagCatalog, installPath])

  const isRunning = serverStatus.state === 'running' || serverStatus.state === 'starting'

  async function handleStart() {
    if (!installPath) return
    const runId = await window.electron.launcher.recordRun(profile.id)
    setCurrentRunId(runId)
    startServer(installPath)
  }

  async function handleStop() {
    stopServer()
    if (currentRunId) {
      await window.electron.launcher.stopRun(currentRunId, 0)
      setCurrentRunId(null)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(cliPreview)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const statusKind = serverStatus.state === 'running' ? 'running'
    : serverStatus.state === 'starting' ? 'scanning'
    : serverStatus.state === 'error' ? 'error'
    : 'idle'

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <StatusPill kind={statusKind} label={
          serverStatus.state === 'running' ? `Running :${serverStatus.port}` :
          serverStatus.state === 'starting' ? 'Starting…' :
          serverStatus.state === 'error' ? serverStatus.error ?? 'Error' :
          'Stopped'
        } />
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5">
              <Square className="h-3.5 w-3.5" aria-hidden /> Stop
            </Button>
          ) : (
            <Button
              data-tour="launch-start"
              size="sm"
              onClick={handleStart}
              disabled={!installPath}
              className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Play className="h-3.5 w-3.5" aria-hidden /> Start
            </Button>
          )}
        </div>
      </div>

      {/* CLI preview */}
      <div data-tour="launch-cli" className="rounded-lg border border-border bg-muted/40 p-3 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">CLI Preview</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy} aria-label="Copy command">
            {copied ? <Check className="h-3 w-3 text-status-ready" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
        <pre className="text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
          {cliPreview || 'No binary installed'}
        </pre>
      </div>

      {/* Output: Summary (friendly) or Console (raw) */}
      <div data-tour="launch-output" className="flex-1 flex flex-col min-h-0 rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5" aria-hidden /> Server output
          </span>
          <div className="flex items-center gap-2">
            {view === 'console' && (
              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={clearLogs}>
                Clear
              </Button>
            )}
            <div role="tablist" aria-label="Output view" className="inline-flex p-0.5 rounded-md bg-muted border border-border">
              {OUTPUT_VIEWS.map(v => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => switchView(v.id)}
                  className={cn(
                    'px-2.5 py-0.5 text-[11px] rounded-[5px] transition-colors',
                    view === v.id ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === 'summary' ? (
          <RunSummary logs={logs} status={serverStatus} onViewLine={jumpToLine} />
        ) : (
          <div className="flex-1 overflow-y-auto bg-[oklch(0.12_0_0)] p-3 font-mono text-[11px] text-[oklch(0.72_0.13_150)] leading-relaxed">
            {logs.length === 0 ? (
              <span className="text-muted-foreground opacity-50">Server output will appear here…</span>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  id={`log-line-${i}`}
                  className={cn(
                    'whitespace-pre-wrap break-all',
                    line.toLowerCase().includes('error') && 'text-status-error',
                    i === focusLine && 'bg-brand/20 rounded-sm'
                  )}
                >
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  )
}
