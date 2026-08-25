import { useEffect } from 'react'
import { useDetectorStore } from '@/lib/stores'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Cpu, HardDrive, MemoryStick, Monitor, RefreshCw,
  CheckCircle2, AlertTriangle, HelpCircle,
  Loader2, Shield, Zap
} from 'lucide-react'

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function ConfidenceIcon({ confidence }: { confidence: string }) {
  switch (confidence) {
    case 'confirmed': return <CheckCircle2 className="w-4 h-4 text-green-500" />
    case 'likely': return <HelpCircle className="w-4 h-4 text-yellow-500" />
    case 'uncertain': return <AlertTriangle className="w-4 h-4 text-orange-500" />
    default: return null
  }
}

export default function HardwarePage() {
  const { result, isLoading, error, detect } = useDetectorStore()

  useEffect(() => {
    if (!result) detect()
  }, [result, detect])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Scanning hardware...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => detect(true)}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    )
  }

  if (!result) return null

  const { system, backends, vram } = result

  return (
    <div className="h-full overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Hardware Detection</h2>
          <p className="text-sm text-muted-foreground mt-1">
            System profile for llama.cpp inference · Detected {new Date(result.detectedAt).toLocaleTimeString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => detect(true)} disabled={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" /> Re-detect
        </Button>
      </div>

      {/* Recommended Asset Banner */}
      <Card className="p-4 border-dashed bg-muted/30">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-yellow-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Recommended Binary</p>
            <p className="text-xs text-muted-foreground truncate font-mono">{result.recommendedAsset}</p>
          </div>
          <Badge variant="outline" className="shrink-0">{result.os} · {result.arch}</Badge>
        </div>
      </Card>

      {/* GPU / Backend Section */}
      <section>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Monitor className="w-5 h-5" /> Compute Backends
        </h3>
        <div className="grid gap-3">
          {backends.map((b) => (
            <Card key={b.id} className={`p-4 ${!b.available ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <ConfidenceIcon confidence={b.confidence} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{b.id.toUpperCase()}</span>
                      {b.version && <Badge variant="secondary" className="text-[10px] font-mono">{b.version}</Badge>}
                      <Badge variant={b.available ? 'default' : 'outline'} className="text-[10px]">
                        {b.available ? 'Available' : 'Unavailable'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.reason}</p>
                  </div>
                </div>
              </div>
              {b.warnings.length > 0 && (
                <div className="mt-3 pl-7 space-y-1">
                  {b.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-orange-500 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* GPU VRAM Table */}
      {vram && vram.gpus.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5" /> GPU Memory
          </h3>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium">Device</th>
                  <th className="text-left p-3 font-medium">Backend</th>
                  <th className="text-right p-3 font-medium">VRAM</th>
                </tr>
              </thead>
              <tbody>
                {vram.gpus.map((gpu, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-3 font-mono text-xs">{gpu.name}</td>
                    <td className="p-3"><Badge variant="outline" className="text-[10px]">{gpu.backend.toUpperCase()}</Badge></td>
                    <td className="p-3 text-right font-mono text-xs">{formatMB(gpu.vramMB)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30">
                  <td className="p-3 font-semibold" colSpan={2}>Total VRAM</td>
                  <td className="p-3 text-right font-semibold font-mono">{formatMB(vram.totalMB)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </section>
      )}

      {/* System Info - only renders if system probe succeeded */}
      {system && (
        <>
          {/* CPU Section */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Cpu className="w-5 h-5" /> Processor
            </h3>
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="p-3 text-muted-foreground w-1/3">Model</td>
                    <td className="p-3 font-mono text-xs">{system.cpu.manufacturer} {system.cpu.brand}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-muted-foreground">Cores / Threads</td>
                    <td className="p-3 font-mono text-xs">{system.cpu.cores}C / {system.cpu.threads}T</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-muted-foreground">Clock Speed</td>
                    <td className="p-3 font-mono text-xs">
                      {system.cpu.speedGHz} GHz
                      {system.cpu.speedMaxGHz ? ` (max ${system.cpu.speedMaxGHz} GHz)` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-muted-foreground">Instruction Sets</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {system.cpu.features.length > 0 ? (
                          system.cpu.features.map((f) => (
                            <Badge
                              key={f}
                              variant={f.includes('AVX2') || f.includes('AVX512') || f.includes('NEON') ? 'default' : 'secondary'}
                              className="text-[10px] font-mono"
                            >
                              {f}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No flags detected</span>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </section>

          {/* Memory Section */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <MemoryStick className="w-5 h-5" /> System Memory
            </h3>
            <Card className="p-4 space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">RAM Usage</span>
                  <span className="font-mono text-xs">{formatMB(system.memory.usedMB)} / {formatMB(system.memory.totalMB)}</span>
                </div>
                <Progress value={Math.round((system.memory.usedMB / system.memory.totalMB) * 100)} className="h-2" />
              </div>
              {system.memory.swapTotalMB > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">Swap Usage</span>
                    <span className="font-mono text-xs">{formatMB(system.memory.swapUsedMB)} / {formatMB(system.memory.swapTotalMB)}</span>
                  </div>
                  <Progress value={Math.round((system.memory.swapUsedMB / system.memory.swapTotalMB) * 100)} className="h-2" />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Free RAM: {formatMB(system.memory.freeMB)} — Models require RAM to load before GPU offloading
              </p>
            </Card>
          </section>

          {/* Disk Section */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <HardDrive className="w-5 h-5" /> Storage
            </h3>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium">Mount</th>
                    <th className="text-left p-3 font-medium">Type</th>
                    <th className="text-right p-3 font-medium">Total</th>
                    <th className="text-right p-3 font-medium">Available</th>
                    <th className="text-right p-3 font-medium w-32">Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {system.disks.map((disk, i) => {
                    const usagePercent = disk.sizeMB > 0 ? Math.round((disk.usedMB / disk.sizeMB) * 100) : 0
                    return (
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-3 font-mono text-xs">{disk.mount}</td>
                        <td className="p-3 text-xs">{disk.type}</td>
                        <td className="p-3 text-right font-mono text-xs">{formatMB(disk.sizeMB)}</td>
                        <td className="p-3 text-right font-mono text-xs">{formatMB(disk.availableMB)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={usagePercent} className="h-1.5 flex-1" />
                            <span className="text-[10px] text-muted-foreground w-8 text-right">{usagePercent}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
            <p className="text-xs text-muted-foreground mt-2">
              GGUF models typically range from 4 GB to 70 GB depending on quantization
            </p>
          </section>

          {/* OS Info */}
          <section>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Monitor className="w-5 h-5" /> Operating System
            </h3>
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b">
                    <td className="p-3 text-muted-foreground w-1/3">Distribution</td>
                    <td className="p-3 font-mono text-xs">{system.osInfo.distro} {system.osInfo.release}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 text-muted-foreground">Kernel</td>
                    <td className="p-3 font-mono text-xs">{system.osInfo.kernel}</td>
                  </tr>
                  <tr>
                    <td className="p-3 text-muted-foreground">Hostname</td>
                    <td className="p-3 font-mono text-xs">{system.osInfo.hostname}</td>
                  </tr>
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
