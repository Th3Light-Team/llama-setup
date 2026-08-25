import { Zap, Settings2 } from 'lucide-react'

interface Props { onNext: () => void; onSkip: () => void; onFinish: () => void }

export default function Step1Welcome({ onNext, onFinish }: Props) {
  return (
    <div className="w-full space-y-8 text-center">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Run llama.cpp locally — without the guesswork</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          llama-studio detects your hardware, installs the right binary, and helps you run local LLMs in minutes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-left">
        <button
          onClick={onNext}
          className="group rounded-xl border-2 border-brand bg-brand-muted p-5 text-left hover:bg-brand/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Zap className="h-6 w-6 text-brand mb-3" aria-hidden />
          <p className="font-semibold text-sm text-foreground">Guided setup</p>
          <p className="text-xs text-muted-foreground mt-1">Detect hardware, install a binary, download a starter model. Recommended.</p>
        </button>
        <button
          onClick={onFinish}
          className="group rounded-xl border border-border bg-card p-5 text-left hover:border-foreground/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings2 className="h-6 w-6 text-muted-foreground mb-3" aria-hidden />
          <p className="font-semibold text-sm text-foreground">I know what I'm doing</p>
          <p className="text-xs text-muted-foreground mt-1">Skip setup and go straight to the app.</p>
        </button>
      </div>

      <p className="text-xs text-muted-foreground">You can always re-run this wizard from Settings.</p>
    </div>
  )
}
