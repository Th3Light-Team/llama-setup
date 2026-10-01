import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressCard } from '@/components/ui/progress-card'
import { Badge } from '@/components/ui/badge'
import { useDetectorStore, useBinariesStore } from '@/lib/stores'
import { useDownloadsStore } from '@/lib/stores/downloads'
import { cudaMaxForHardware, findRecommendedBackendId, findRuntimeFor, pickBestAsset } from '../../../core/binaries/select'
import { installProgressFor } from '@/lib/install-progress'

interface Props { onNext: () => void; onSkip: () => void; onFinish: () => void }

export default function Step4PickBinary({ onNext, onSkip }: Props) {
  const { result: hw } = useDetectorStore()
  const { releases, installed, isLoadingReleases, fetchReleases, fetchInstalled, install } = useBinariesStore()
  const downloadJobs = useDownloadsStore(s => s.jobs)
  const [installing, setInstalling] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetchReleases()
    fetchInstalled()
  }, [])

  const recommendedId = findRecommendedBackendId(hw)
  const latest = releases[0]
  // Only consider assets built for this machine's OS and CPU architecture.
  const bestAsset = pickBestAsset(latest?.assets ?? [], hw, recommendedId, { cudaMax: cudaMaxForHardware(hw) })
  const runtimeAsset = latest && bestAsset ? findRuntimeFor(latest.runtimes, bestAsset) : undefined

  const installId = bestAsset && latest ? `${latest.tag}-${bestAsset.backend}-${bestAsset.arch}` : null
  const install_ = installId ? installProgressFor(downloadJobs, installId) : undefined
  const progress = install_ ? install_.percent : null
  const alreadyInstalled = installed.length > 0

  // Mark done when every part of the install (engine + CUDA runtime) is done
  useEffect(() => {
    if (install_?.state === 'done') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to external download job state transition
      setDone(true)
      setInstalling(false)
      fetchInstalled()
    } else if (install_?.state === 'failed') {
      setInstalling(false)
    }
  }, [install_?.state, fetchInstalled])

  // Re-read installs once the main process has fully registered the engine
  useEffect(() => window.electron.binaries.onChanged(() => { fetchInstalled() }), [fetchInstalled])

  async function handleInstall() {
    if (!latest || !bestAsset) return
    setInstalling(true)
    try {
      await install(latest.tag, bestAsset)
    } catch {
      setInstalling(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Install a binary</h2>
        <p className="text-sm text-muted-foreground">We'll install the latest llama.cpp build matched to your hardware.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        {isLoadingReleases ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
            <span className="text-sm">Fetching latest releases…</span>
          </div>
        ) : alreadyInstalled ? (
          <div className="flex items-center gap-2 text-status-ready">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
            <span className="text-sm font-medium">A binary is already installed — you're good to go.</span>
          </div>
        ) : latest && bestAsset ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">llama.cpp {latest.tag}</span>
              <div className="flex gap-1.5">
                <Badge variant="secondary">{bestAsset.backend}</Badge>
                <Badge variant="outline">{bestAsset.arch}</Badge>
              </div>
            </div>
            {runtimeAsset && !installing && !done && (
              <p className="text-xs text-muted-foreground">
                NVIDIA GPU build: also downloads the CUDA runtime
                ({Math.round(runtimeAsset.size / 1048576)} MB extra) unless a matching CUDA toolkit is already installed.
              </p>
            )}
            {install_?.state === 'failed' && (
              <p className="text-sm text-destructive">
                Install failed: {install_.error ?? 'unknown error'}
              </p>
            )}
            {installing || done ? (
              <ProgressCard
                title={`Installing llama.cpp ${latest.tag}`}
                subtitle={`${bestAsset.backend} · ${bestAsset.arch}${install_?.hasRuntime ? ' · + CUDA runtime' : ''}`}
                percent={progress ?? 0}
                state={done ? 'done' : 'active'}
              />
            ) : (
              <Button
                onClick={handleInstall}
                className="w-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                Install {bestAsset.backend} build
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Could not fetch release info. Check your connection.</p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
          Skip for now
        </Button>
        <Button
          onClick={onNext}
          disabled={installing}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
