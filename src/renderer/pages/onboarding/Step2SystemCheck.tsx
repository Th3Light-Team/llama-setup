import { useEffect } from 'react'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KeyValueGrid } from '@/components/ui/key-value-grid'
import { useDetectorStore } from '@/lib/stores'

interface Props { onNext: () => void; onSkip: () => void; onFinish: () => void }

export default function Step2SystemCheck({ onNext }: Props) {
  const { result, isLoading, error, detect } = useDetectorStore()

  useEffect(() => { detect() }, [])

  const recommended = result?.backends?.find(b => result.recommendedAsset.toLowerCase().includes(b.id))

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">System check</h2>
        <p className="text-sm text-muted-foreground">We're scanning your hardware to pick the best llama.cpp build for you.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 min-h-40 flex flex-col justify-center">
        {isLoading ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" aria-hidden />
            <span className="text-sm">Scanning hardware…</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
            <span className="text-sm">{error}</span>
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-status-ready">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden />
              <span className="text-sm font-medium">Hardware detected</span>
            </div>
            <KeyValueGrid
              cols={2}
              rows={[
                { label: 'CPU', value: result.system?.cpu?.brand ?? '—' },
                { label: 'GPU', value: result.vram?.gpus?.[0]?.name ?? 'None detected' },
                { label: 'VRAM', value: result.vram?.gpus?.[0]?.vramMB ? `${result.vram.gpus[0].vramMB} MB` : '—' },
                { label: 'RAM', value: result.system?.memory?.totalMB ? `${Math.round(result.system.memory.totalMB / 1024)} GB` : '—' },
                { label: 'Platform', value: result.system?.osInfo?.platform ?? result.os ?? '—' },
                { label: 'Recommended backend', value: recommended?.id ?? 'CPU' },
              ]}
            />
          </div>
        ) : null}
      </div>

      {recommended ? (
        <div className="rounded-lg border border-brand/30 bg-brand-muted px-4 py-3 text-sm">
          <span className="font-medium text-brand">Recommended:</span>{' '}
          <span className="text-foreground">{recommended.id} build</span>
          {recommended.reason ? <span className="text-muted-foreground ml-1">— {recommended.reason}</span> : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={isLoading} className="bg-brand text-brand-foreground hover:bg-brand/90">
          Continue
        </Button>
      </div>
    </div>
  )
}
