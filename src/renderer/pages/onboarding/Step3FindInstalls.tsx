import { useEffect } from 'react'
import { CheckCircle2, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDiscoveryStore } from '@/lib/stores'

interface Props { onNext: () => void; onSkip: () => void; onFinish: () => void }

export default function Step3FindInstalls({ onNext, onSkip }: Props) {
  const { scan, isScanning, runScan } = useDiscoveryStore()

  // Match BinariesPage: quickScan so both pages agree.  Only trigger a scan
  // if none exists yet — preserves any prior scan from Binaries page.
  useEffect(() => {
    if (!scan && !isScanning) runScan({ quickScan: true })
  }, [scan, isScanning, runScan])

  // Count anything that's not outright broken.  "Degraded" still means the
  // binary exists and the user can use it; treating those as "not found"
  // contradicts what the Binaries page shows on the same data.
  const healthy = scan?.installations.filter(
    i => i.health.status === 'healthy' || i.health.status === 'degraded'
  ) ?? []

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Find existing installs</h2>
        <p className="text-sm text-muted-foreground">Scanning for any llama.cpp binaries already on your system.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 min-h-36">
        {isScanning ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
            <span className="text-sm">Scanning PATH and common directories…</span>
          </div>
        ) : !scan ? null : healthy.length === 0 ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Search className="h-5 w-5 shrink-0" aria-hidden />
            <span className="text-sm">No existing installs found. We'll install one in the next step.</span>
          </div>
        ) : (
          <ul className="space-y-2" role="list">
            {healthy.slice(0, 5).map(inst => (
              <li key={inst.binaryPath} className="flex items-center justify-between gap-3 text-sm py-1.5 border-b border-border last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="h-4 w-4 text-status-ready shrink-0" aria-hidden />
                  <span className="font-mono text-xs text-muted-foreground truncate">{inst.binaryPath}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {inst.backend ? <Badge variant="secondary">{inst.backend}</Badge> : null}
                  {inst.version ? <Badge variant="outline">{inst.version.raw}</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {scan && healthy.length > 0 ? (
        <div className="rounded-lg border border-status-ready/30 bg-status-ready/5 px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-status-ready shrink-0" aria-hidden />
          <span>{healthy.length} working install{healthy.length > 1 ? 's' : ''} found — you can use these in Launch Pad right away.</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
          Skip
        </Button>
        <Button onClick={onNext} disabled={isScanning} className="bg-brand text-brand-foreground hover:bg-brand/90">
          {healthy.length > 0 ? 'Continue' : 'Install a binary'}
        </Button>
      </div>
    </div>
  )
}
