import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, Copy, Check, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { useLauncherStore, useBinariesStore } from '@/lib/stores'
import { cn } from '@/lib/utils'
import type { Profile } from '../../../core/launcher/types'

interface RunTabProps {
  profile: Profile
}

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

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

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
        if (v === def.default) return false
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

      {/* Terminal */}
      <div data-tour="launch-output" className="flex-1 flex flex-col min-h-0 rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 shrink-0">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5" aria-hidden /> Server output
          </span>
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={clearLogs}>
            Clear
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[oklch(0.12_0_0)] p-3 font-mono text-[11px] text-[oklch(0.72_0.13_150)] leading-relaxed">
          {logs.length === 0 ? (
            <span className="text-muted-foreground opacity-50">Server output will appear here…</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} className={cn('whitespace-pre-wrap break-all', line.toLowerCase().includes('error') && 'text-status-error')}>
                {line}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}
