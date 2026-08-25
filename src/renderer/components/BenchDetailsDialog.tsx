import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X, Cpu, Server, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusPill } from '@/components/ui/status-pill'
import { KeyValueGrid } from '@/components/ui/key-value-grid'
import { cn } from '@/lib/utils'
import type { BenchJob, BenchTest } from '../../core/bench/types'

interface Props {
  open: boolean
  job: BenchJob | null
  onOpenChange: (open: boolean) => void
}

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

function fmtParams(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`
  return n.toString()
}

function testLabel(t: BenchTest): string {
  if (t.kind === 'pp') return `pp${t.nPrompt}`
  if (t.kind === 'tg') return `tg${t.nGen}`
  if (t.kind === 'mixed') return `pp${t.nPrompt}+tg${t.nGen}`
  return 'unknown'
}

export function BenchDetailsDialog({ open, job, onOpenChange }: Props) {
  return (
    <DialogPrimitive.Root open={open && !!job} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150"
        />
        <DialogPrimitive.Popup
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] flex flex-col',
            'rounded-xl border border-border bg-popover text-popover-foreground shadow-xl',
            'data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150'
          )}
        >
          {job && (
            <>
              <div className="flex items-start justify-between p-5 border-b border-border shrink-0">
                <div className="min-w-0">
                  <DialogPrimitive.Title className="text-base font-semibold truncate">
                    {job.displayName}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-xl" title={job.modelPath}>
                    {job.modelPath}
                  </DialogPrimitive.Description>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusPill
                    kind={job.state === 'done' ? 'ready' : job.state === 'failed' ? 'error' : job.state === 'running' ? 'running' : 'idle'}
                    label={job.state}
                  />
                  <DialogPrimitive.Close
                    render={
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <X className="h-4 w-4" aria-hidden />
                        <span className="sr-only">Close</span>
                      </Button>
                    }
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {job.errorMessage && (
                  <div className="rounded-md border border-status-error/30 bg-status-error/5 p-3 text-xs text-status-error">
                    {job.errorMessage}
                  </div>
                )}

                {job.result && (
                  <>
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Server className="h-3 w-3" aria-hidden /> Run context
                      </h3>
                      <KeyValueGrid
                        cols={2}
                        rows={[
                          { label: 'Model', value: job.result.context.modelType || '—' },
                          { label: 'Size', value: fmtBytes(job.result.context.modelSizeBytes) },
                          { label: 'Params', value: fmtParams(job.result.context.modelParamCount) },
                          { label: 'Backend', value: job.result.context.backends || '—' },
                          { label: 'CPU', value: job.result.context.cpuInfo || '—' },
                          { label: 'GPU', value: job.result.context.gpuInfo || '—' },
                          {
                            label: 'Build',
                            value: job.result.context.buildNumber
                              ? `b${job.result.context.buildNumber}${job.result.context.buildCommit ? ` (${job.result.context.buildCommit})` : ''}`
                              : '—'
                          },
                        ]}
                      />
                    </section>

                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Hash className="h-3 w-3" aria-hidden /> Tests ({job.result.tests.length})
                      </h3>
                      <div className="rounded-md border border-border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Test</th>
                              <th className="text-right px-3 py-2 font-medium">Tokens/sec</th>
                              <th className="text-right px-3 py-2 font-medium">σ</th>
                              <th className="text-right px-3 py-2 font-medium">Samples</th>
                              <th className="text-right px-3 py-2 font-medium">ngl</th>
                              <th className="text-right px-3 py-2 font-medium">FA</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {job.result.tests.map((t, i) => (
                              <tr key={i} className="hover:bg-muted/20">
                                <td className="px-3 py-2">
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      'font-mono text-[10px]',
                                      t.kind === 'pp' && 'text-brand',
                                      t.kind === 'tg' && 'text-status-ready'
                                    )}
                                  >
                                    {testLabel(t)}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {t.tokensPerSec.toFixed(2)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                                  {t.tokensPerSecStddev > 0 ? `±${t.tokensPerSecStddev.toFixed(2)}` : '—'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{t.sampleCount}</td>
                                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{t.nGpuLayers}</td>
                                <td className="px-3 py-2 text-right text-muted-foreground">{t.flashAttn ? '✓' : '·'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Cpu className="h-3 w-3" aria-hidden /> Log
                  </h3>
                  <pre className="text-[10px] font-mono bg-[oklch(0.12_0_0)] text-[oklch(0.72_0.13_150)] p-3 rounded-md max-h-72 overflow-auto whitespace-pre-wrap break-all">
                    {job.log || '(no output captured)'}
                  </pre>
                </section>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
