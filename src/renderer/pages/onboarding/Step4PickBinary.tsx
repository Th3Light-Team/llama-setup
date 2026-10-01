import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressCard } from '@/components/ui/progress-card'
import { Badge } from '@/components/ui/badge'
import { useDetectorStore, useBinariesStore } from '@/lib/stores'
import { useDownloadsStore } from '@/lib/stores/downloads'

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

  const recommended = hw?.backends?.find(b => hw.recommendedAsset.toLowerCase().includes(b.id))
  const latest = releases[0]
  const bestAsset = latest?.assets?.find(a =>
    recommended ? a.backend.toLowerCase().includes(recommended.id.toLowerCase()) : a.backend === 'cpu'
  ) ?? latest?.assets?.[0]

  const installId = bestAsset && latest ? `${latest.tag}-${bestAsset.backend}-${bestAsset.arch}` : null
  const downloadJob = installId
    ? Object.values(downloadJobs).find(j => {
        const e = j.extra as { installId?: string } | null
        return e?.installId === installId
      })
    : undefined
  const progress = downloadJob && downloadJob.bytesTotal && downloadJob.bytesTotal > 0
    ? Math.round((downloadJob.bytesDone / downloadJob.bytesTotal) * 100)
    : (downloadJob?.state === 'done' ? 100 : null)
  const alreadyInstalled = installed.length > 0

  // Mark done when our job reaches 'done'
  useEffect(() => {
    if (downloadJob?.state === 'done') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to external download job state transition
      setDone(true)
      setInstalling(false)
      fetchInstalled()
    } else if (downloadJob?.state === 'failed' || downloadJob?.state === 'cancelled') {
      setInstalling(false)
    }
  }, [downloadJob?.state, fetchInstalled])

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
            {installing || done ? (
              <ProgressCard
                title={`Installing llama.cpp ${latest.tag}`}
                subtitle={`${bestAsset.backend} · ${bestAsset.arch}`}
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
