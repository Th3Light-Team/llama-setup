import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, HardDrive, Loader2, Search } from 'lucide-react'
import { useEffect } from 'react'
import { useDiscoveryStore } from '@/lib/stores'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function DiscoveryBadge() {
  const { scan, isScanning, lastError, runScan } = useDiscoveryStore()

  useEffect(() => {
    // Run a quick scan on mount (phases 1-3 only)
    runScan({ quickScan: true })
  }, [runScan])

  if (isScanning) {
    return (
      <Badge variant="outline" className="w-full justify-center text-xs py-1.5 flex gap-1 mt-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Scanning...
      </Badge>
    )
  }

  if (lastError) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="w-full justify-center text-xs py-1.5 flex gap-1 mt-1.5 border-status-warning/50 text-status-warning cursor-pointer">
              <AlertTriangle className="w-3 h-3" /> Scan error
            </Badge>
          </TooltipTrigger>
          <TooltipContent><p>{lastError}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (!scan) return null

  const totalInstalls = scan.installations.length
  const issueCount = scan.issues.filter(i => i.severity === 'error' || i.severity === 'warning').length
  const hasIssues = issueCount > 0

  if (totalInstalls === 0) {
    return (
      <Badge variant="outline" className="w-full justify-center text-xs py-1.5 flex gap-1 mt-1.5 text-muted-foreground">
        <Search className="w-3 h-3" /> No binaries found
      </Badge>
    )
  }

  const icon = hasIssues
    ? <AlertTriangle className="w-3 h-3 text-status-warning" />
    : <CheckCircle2 className="w-3 h-3 text-status-ready" />

  const text = hasIssues
    ? `${totalInstalls} binar${totalInstalls === 1 ? 'y' : 'ies'} (${issueCount} issue${issueCount === 1 ? '' : 's'})`
    : `${totalInstalls} binar${totalInstalls === 1 ? 'y' : 'ies'}`

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge
            variant="outline"
            className={`w-full justify-center text-xs py-1.5 flex gap-1.5 mt-1.5 cursor-pointer ${
              hasIssues
                ? 'border-status-warning/50 text-status-warning'
                : 'border-status-ready/50 text-status-ready'
            }`}
          >
            {icon}
            <span className="truncate max-w-[150px]">{text}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[280px]">
          <div className="space-y-2">
            <p className="font-semibold flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" /> Installation Discovery
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Found {totalInstalls} llama.cpp installation{totalInstalls !== 1 ? 's' : ''}</p>
              {scan.installations.filter(i => i.managed).length > 0 && (
                <p>• {scan.installations.filter(i => i.managed).length} managed by Llama Studio</p>
              )}
              {scan.installations.filter(i => !i.managed).length > 0 && (
                <p>• {scan.installations.filter(i => !i.managed).length} found externally</p>
              )}
              {hasIssues && (
                <p className="text-status-warning">
                  ⚠ {issueCount} issue{issueCount !== 1 ? 's' : ''} detected
                </p>
              )}
            </div>
            <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground flex justify-between">
              <span>Scanned in {scan.scanDurationMs}ms</span>
              <button onClick={() => runScan({ forceRescan: true })} className="hover:text-foreground underline">
                Re-scan
              </button>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
