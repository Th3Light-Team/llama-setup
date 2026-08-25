import { useState } from 'react'
import { Gauge, Zap, Settings2, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useBenchStore } from '@/lib/stores/bench'
import { useBinariesStore } from '@/lib/stores'
import { useToast } from '@/components/ui/toast'
import { quickBenchSpec } from '../../core/bench/defaults'
import { BenchConfigDialog } from './BenchConfigDialog'

interface Props {
  modelPath: string
  modelName: string
}

/**
 * Icon button + dropdown shown on every model card.
 *   • Quick bench  — fire-and-forget with sensible defaults
 *   • Custom...    — open the config modal for full control
 *
 * Both paths converge on `useBenchStore.start()` so the runner / sidebar /
 * details modal don't need to know which menu item triggered the run.
 */
export function BenchMenuButton({ modelPath, modelName }: Props) {
  const [configOpen, setConfigOpen] = useState(false)
  const start = useBenchStore(s => s.start)
  const installed = useBinariesStore(s => s.installed)
  const { toast } = useToast()

  const installPath = installed[0]?.path
  const disabled = !installPath

  async function handleQuick() {
    if (!installPath) return
    const spec = quickBenchSpec(modelPath, installPath)
    spec.displayName = `${modelName} · quick`
    await start(spec)
    toast({ title: 'Quick bench queued', description: modelName, variant: 'info' })
  }

  if (disabled) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground/50 cursor-not-allowed"
        title="Install a llama.cpp binary first"
        disabled
      >
        <Gauge className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Bench (disabled — no binary)</span>
      </Button>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Benchmark this model">
              <Gauge className="h-3.5 w-3.5" aria-hidden />
              <ChevronDown className="h-2.5 w-2.5 -ml-1 opacity-50" aria-hidden />
              <span className="sr-only">Bench menu</span>
            </Button>
          }
        />
        <DropdownMenuContent>
          <DropdownMenuLabel>Benchmark</DropdownMenuLabel>
          <DropdownMenuItem onClick={handleQuick}>
            <Zap className="h-3.5 w-3.5 text-brand" aria-hidden />
            <div className="flex flex-col">
              <span>Quick bench</span>
              <span className="text-[10px] text-muted-foreground">512 prompt, 128 gen, 3 reps</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setConfigOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
            <div className="flex flex-col">
              <span>Custom…</span>
              <span className="text-[10px] text-muted-foreground">Configure prompt, gen, batch, layers</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BenchConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        modelPath={modelPath}
        modelName={modelName}
        installPath={installPath}
      />
    </>
  )
}
