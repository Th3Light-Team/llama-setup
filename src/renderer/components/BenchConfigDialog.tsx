import { useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Zap, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBenchStore } from '@/lib/stores/bench'
import { useToast } from '@/components/ui/toast'
import { customBenchDefaults } from '../../core/bench/defaults'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  modelPath: string
  modelName: string
  installPath: string
}

/**
 * Custom bench configuration modal — exposes the knobs that meaningfully
 * change benchmark numbers without dumping the full llama-bench flag set on
 * the user.  Values default to customBenchDefaults; only fields that differ
 * from the default end up in the spec.
 */
export function BenchConfigDialog({ open, onOpenChange, modelPath, modelName, installPath }: Props) {
  const defaults = customBenchDefaults(modelPath, installPath)
  const [prompts, setPrompts] = useState((defaults.prompts ?? [512]).join(','))
  const [generations, setGenerations] = useState((defaults.generations ?? [128]).join(','))
  const [repetitions, setRepetitions] = useState(defaults.repetitions ?? 3)
  const [threads, setThreads] = useState(defaults.threads ?? 0)
  const [batchSize, setBatchSize] = useState(defaults.batchSize ?? 2048)
  const [microBatchSize, setMicroBatchSize] = useState(defaults.microBatchSize ?? 512)
  const [gpuLayers, setGpuLayers] = useState(defaults.gpuLayers ?? -1)
  const [flashAttn, setFlashAttn] = useState(defaults.flashAttn ?? true)

  const start = useBenchStore(s => s.start)
  const { toast } = useToast()

  function parseNumList(s: string): number[] {
    return s
      .split(',')
      .map(p => parseInt(p.trim(), 10))
      .filter(n => Number.isFinite(n) && n > 0)
  }

  async function handleRun() {
    const promptList = parseNumList(prompts)
    const genList = parseNumList(generations)
    if (promptList.length === 0 && genList.length === 0) {
      toast({ title: 'Need at least one prompt or gen size', variant: 'error' })
      return
    }
    await start({
      modelPath,
      installPath,
      displayName: `${modelName} · custom`,
      prompts: promptList,
      generations: genList,
      repetitions,
      threads,
      batchSize,
      microBatchSize,
      gpuLayers,
      flashAttn,
      timeoutMs: 10 * 60 * 1000,
    })
    toast({ title: 'Custom bench queued', description: modelName, variant: 'info' })
    onOpenChange(false)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-xs data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150"
        />
        <DialogPrimitive.Popup
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md',
            'rounded-xl border border-border bg-popover text-popover-foreground shadow-xl',
            'data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150'
          )}
        >
          <div className="flex items-start justify-between p-5 border-b border-border">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold">Custom benchmark</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                {modelName}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              render={
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <X className="h-4 w-4" aria-hidden />
                  <span className="sr-only">Close</span>
                </Button>
              }
            />
          </div>

          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <Field label="Prompt sizes (-p)" hint="Comma-separated, e.g. 128,512,1024">
              <input
                type="text"
                value={prompts}
                onChange={e => setPrompts(e.target.value)}
                className="w-full h-8 px-2 text-sm font-mono bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            <Field label="Generation sizes (-n)" hint="Comma-separated">
              <input
                type="text"
                value={generations}
                onChange={e => setGenerations(e.target.value)}
                className="w-full h-8 px-2 text-sm font-mono bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Repetitions (-r)">
                <NumberInput value={repetitions} onChange={setRepetitions} min={1} max={20} />
              </Field>
              <Field label="Threads (-t)" hint="0 = auto">
                <NumberInput value={threads} onChange={setThreads} min={0} max={128} />
              </Field>
              <Field label="Batch (-b)">
                <NumberInput value={batchSize} onChange={setBatchSize} min={32} max={8192} step={32} />
              </Field>
              <Field label="Micro-batch (-ub)">
                <NumberInput value={microBatchSize} onChange={setMicroBatchSize} min={32} max={2048} step={32} />
              </Field>
              <Field label="GPU layers (-ngl)" hint="-1 = all">
                <NumberInput value={gpuLayers} onChange={setGpuLayers} min={-1} max={200} />
              </Field>
              <Field label="Flash attention (-fa)">
                <label className="flex items-center gap-2 h-8 text-sm">
                  <input
                    type="checkbox"
                    checked={flashAttn}
                    onChange={e => setFlashAttn(e.target.checked)}
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="text-muted-foreground text-xs">{flashAttn ? 'Enabled' : 'Disabled'}</span>
                </label>
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-muted/20">
            <DialogPrimitive.Close
              render={<Button variant="outline" size="sm">Cancel</Button>}
            />
            <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90" onClick={handleRun}>
              <Zap className="h-3.5 w-3.5" aria-hidden /> Run benchmark
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium">{label}</label>
      {children}
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function NumberInput({ value, onChange, min, max, step = 1 }: { value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
      className="w-full h-8 px-2 text-sm font-mono bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}
