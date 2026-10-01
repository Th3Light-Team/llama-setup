import { useEffect, useState } from 'react'
import { Download, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressCard } from '@/components/ui/progress-card'
import { Badge } from '@/components/ui/badge'
import { useDownloadsStore } from '@/lib/stores/downloads'

interface StarterModel {
  id: string
  name: string
  quant: string
  sizeMb: number
  description: string
  filename: string
  url: string
}

const STARTERS: StarterModel[] = [
  {
    id: 'microsoft/Phi-3-mini-4k-instruct-gguf',
    name: 'Phi-3 Mini',
    quant: 'Q4_K_M',
    sizeMb: 2300,
    description: 'Fast, small, great for quick experiments',
    filename: 'Phi-3-mini-4k-instruct-q4.gguf',
    url: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf',
  },
  {
    id: 'meta-llama/Llama-3.2-3B-Instruct-GGUF',
    name: 'Llama 3.2 3B',
    quant: 'Q4_K_M',
    sizeMb: 2000,
    description: 'Meta\'s compact chat model',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    name: 'Qwen 2.5 1.5B',
    quant: 'Q4_K_M',
    sizeMb: 1000,
    description: 'Smallest option, fastest to download',
    filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
]

interface Props { onNext: () => void; onSkip: () => void; onFinish: () => void }

export default function Step5PickModel({ onNext, onSkip }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [selected, setSelected] = useState<string>(STARTERS[0].id)
  const downloadJobs = useDownloadsStore(s => s.jobs)

  // Find the job for the model currently downloading
  const activeJob = downloading
    ? Object.values(downloadJobs).find(j => {
        const e = j.extra as { modelId?: string } | null
        return j.kind === 'model' && e?.modelId === downloading
      })
    : undefined
  const progress = activeJob && activeJob.bytesTotal && activeJob.bytesTotal > 0
    ? Math.round((activeJob.bytesDone / activeJob.bytesTotal) * 100)
    : 0

  useEffect(() => {
    if (!downloading || !activeJob) return
    if (activeJob.state === 'done') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to external download job state transition
      setDone(downloading)
      setDownloading(null)
    } else if (activeJob.state === 'failed' || activeJob.state === 'cancelled') {
      setDownloading(null)
    }
  }, [activeJob?.state, downloading])

  async function handleDownload() {
    const model = STARTERS.find(m => m.id === selected)
    if (!model) return
    setDownloading(model.id)
    try {
      await window.electron.registry.download(model.id, model.filename, model.url)
    } catch {
      setDownloading(null)
    }
  }

  const activeModel = STARTERS.find(m => m.id === selected)

  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Pick a starter model</h2>
        <p className="text-sm text-muted-foreground">Download a small model to test your setup. You can add more from the Registry later.</p>
      </div>

      <div className="space-y-2">
        {STARTERS.map(m => (
          <button
            key={m.id}
            onClick={() => { if (!downloading) setSelected(m.id) }}
            className={[
              'w-full text-left rounded-lg border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected === m.id ? 'border-brand bg-brand-muted' : 'border-border bg-card hover:border-foreground/20',
              downloading ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{m.name}</span>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">{m.quant}</Badge>
                <span className="text-xs text-muted-foreground">{(m.sizeMb / 1000).toFixed(1)} GB</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
          </button>
        ))}
      </div>

      {(downloading || done) && activeModel ? (
        <ProgressCard
          title={`Downloading ${activeModel.name}`}
          subtitle={`${activeModel.quant} · ${(activeModel.sizeMb / 1000).toFixed(1)} GB`}
          percent={progress}
          state={done === activeModel.id ? 'done' : 'active'}
        />
      ) : null}

      {done ? (
        <div className="flex items-center gap-2 text-sm text-status-ready">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>Model downloaded and ready to use in Launch Pad.</span>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground" disabled={!!downloading}>
          Skip for now
        </Button>
        {!done ? (
          <Button
            onClick={handleDownload}
            disabled={!!downloading}
            className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Download className="h-4 w-4" aria-hidden />
            {downloading ? 'Downloading…' : 'Download'}
          </Button>
        ) : (
          <Button onClick={onNext} className="bg-brand text-brand-foreground hover:bg-brand/90">
            Continue
          </Button>
        )}
      </div>
    </div>
  )
}
