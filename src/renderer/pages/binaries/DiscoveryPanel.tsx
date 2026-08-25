import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Loader2, FolderSearch, Search, Shield, ShieldCheck,
  ShieldAlert, ShieldX, Import, CheckCircle2, AlertTriangle
} from 'lucide-react'
import { getHealthColor, getHealthLabel, getSourceLabel } from './helpers'
import { useToast } from '@/components/ui/toast'
import type { InstallationScan, DiscoveredInstall } from '../../../core/discovery/types'

interface Props {
  scan: InstallationScan | null
  isScanning: boolean
  onRunScan: (opts: { forceRescan?: boolean }) => Promise<void>
  onImport: (binaryPath: string, backend?: string) => Promise<void>
  onVerify: (binaryPath: string) => Promise<any>
  onRefreshInstalled: () => Promise<void>
}

function HealthIcon({ status }: { status: string }) {
  switch (status) {
    case 'healthy':  return <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
    case 'degraded': return <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
    case 'broken':   return <ShieldX className="w-3.5 h-3.5 text-red-500" />
    default:         return <Shield className="w-3.5 h-3.5 text-slate-400" />
  }
}

export function DiscoveryPanel({ scan, isScanning, onRunScan, onImport, onVerify, onRefreshInstalled }: Props) {
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const { addToast } = useToast()

  const externals = scan?.installations.filter(i => !i.managed) ?? []

  const handleImport = async (install: DiscoveredInstall) => {
    setBusyPath(install.binaryPath)
    try {
      await onImport(install.binaryPath, install.backend)
      await onRefreshInstalled()
      addToast({ variant: 'success', title: 'Binary imported', description: `${install.binaryName} added to managed installs.` })
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Import failed', description: err?.message || 'Unknown error' })
    } finally {
      setBusyPath(null)
    }
  }

  const handleVerify = async (install: DiscoveredInstall) => {
    setBusyPath(install.binaryPath)
    try {
      const health = await onVerify(install.binaryPath)
      await onRunScan({ forceRescan: true })
      const status = health?.status || 'unknown'
      addToast({
        variant: status === 'healthy' ? 'success' : status === 'degraded' ? 'warning' : 'error',
        title: `Verification: ${getHealthLabel(status)}`,
        description: `${install.binaryName} at ${install.binaryPath}`
      })
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Verification failed', description: err?.message || 'Unknown error' })
    } finally {
      setBusyPath(null)
    }
  }

  return (
    <section className="shrink-0 border rounded-lg bg-muted/20">
      <div className="p-3 px-4 border-b bg-background rounded-t-lg flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <FolderSearch className="w-4 h-4" /> Found on your system
          {externals.length > 0 && <Badge variant="secondary" className="text-[10px]">{externals.length}</Badge>}
        </h3>
        <div className="flex items-center gap-2">
          {scan && <span className="text-[10px] text-muted-foreground">Scanned in {scan.scanDurationMs}ms</span>}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => onRunScan({ forceRescan: true })} disabled={isScanning}>
            {isScanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            {isScanning ? 'Scanning...' : 'Full Scan'}
          </Button>
        </div>
      </div>
      <div className="p-3">
        {isScanning && !scan ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Scanning for llama.cpp installations...</span>
          </div>
        ) : externals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 text-muted-foreground text-center gap-2">
            <FolderSearch className="w-8 h-8 opacity-20" />
            <div>
              <p className="text-sm font-medium">No external installations found</p>
              <p className="text-xs mt-0.5">Click &quot;Full Scan&quot; to check PATH, package managers, and common directories</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {externals.map(install => {
              const isBusy = busyPath === install.binaryPath

              return (
                <Card key={install.binaryPath} className="p-3 hover:ring-1 hover:ring-border transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-semibold text-xs capitalize">{install.binaryName.replace(/-/g, ' ')}</span>
                        <Badge variant="outline" className={`${getHealthColor(install.health.status)} text-[9px] gap-0.5`}>
                          <HealthIcon status={install.health.status} /> {getHealthLabel(install.health.status)}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{getSourceLabel(install)}</p>
                    </div>
                  </div>

                  {install.version && (
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {install.version.build ? `Build ${install.version.build.toLocaleString()}` : install.version.raw.substring(0, 40)}
                      {install.version.commit && <span className="font-mono ml-1">({install.version.commit.substring(0, 8)})</span>}
                    </p>
                  )}

                  <p className="text-[10px] text-muted-foreground font-mono truncate mb-2" title={install.binaryPath}>
                    {install.binaryPath}
                  </p>

                  {install.health.checks.length > 0 && (
                    <div className="space-y-0.5 mb-2">
                      {install.health.checks.map((check, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                          {check.passed
                            ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500 shrink-0" />
                            : <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                          <span className="text-muted-foreground truncate">{check.name}: {check.detail.substring(0, 60)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="secondary" size="sm" className="h-6 text-[10px] gap-1 flex-1"
                            disabled={isBusy || install.health.status === 'broken'}
                            onClick={() => handleImport(install)}
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Import className="w-3 h-3" />}
                            Import
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Add to managed installs</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            variant="ghost" size="sm" className="h-6 text-[10px] gap-1"
                            disabled={isBusy}
                            onClick={() => handleVerify(install)}
                          >
                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                            Verify
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent><p>Run deep health check</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* Issues summary */}
        {scan && scan.issues.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Issues ({scan.issues.length})
            </h4>
            <div className="space-y-1.5">
              {scan.issues.slice(0, 5).map((issue, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[11px]">
                  <Badge
                    variant="outline"
                    className={`text-[9px] shrink-0 mt-0.5 ${
                      issue.severity === 'error' ? 'border-red-300 text-red-600 dark:border-red-700 dark:text-red-400'
                      : issue.severity === 'warning' ? 'border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400'
                      : 'border-slate-300 text-slate-500'
                    }`}
                  >
                    {issue.severity}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-muted-foreground">{issue.message}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">💡 {issue.suggestion}</p>
                  </div>
                </div>
              ))}
              {scan.issues.length > 5 && (
                <p className="text-[10px] text-muted-foreground">...and {scan.issues.length - 5} more</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
