import { CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDetectorStore, useBinariesStore } from '@/lib/stores'

interface Props { onNext: () => void; onSkip: () => void; onFinish: () => void }

export default function Step6Done({ onFinish }: Props) {
  const { result: hw } = useDetectorStore()
  const { installed } = useBinariesStore()
  const recommended = hw?.backends?.find(b => hw.recommendedAsset.toLowerCase().includes(b.id))

  const items = [
    { label: 'Hardware detected', detail: recommended?.id ? `${recommended.id.toUpperCase()} recommended` : 'CPU fallback' },
    { label: 'Binary ready', detail: installed.length > 0 ? `${installed.length} install${installed.length > 1 ? 's' : ''} available` : 'Skipped — install from Binaries page' },
    { label: 'Models', detail: 'Check your library or search the Registry' },
  ]

  return (
    <div className="w-full space-y-8 text-center">
      <div className="space-y-2">
        <div className="flex items-center justify-center">
          <div className="h-16 w-16 rounded-full bg-brand/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-brand" aria-hidden />
          </div>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">You're ready to run local LLMs</h2>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Head to Launch Pad to pick a model, configure flags, and start your server.
        </p>
      </div>

      <ul className="space-y-2 text-left" role="list">
        {items.map(item => (
          <li key={item.label} className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-status-ready mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <Button
        onClick={onFinish}
        size="lg"
        className="w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
      >
        Open Launch Pad
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  )
}
