import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Loader2, HardDrive, Package, Clock, Trash2, ArrowUp } from 'lucide-react'
import { humanizeTag, buildsBehind, BACKEND_LABELS, BACKEND_COLORS } from './helpers'
import type { InstallRecord } from '../../../core/binaries/types'

interface Props {
  installed: InstallRecord[]
  isLoading: boolean
  latestTag: string
  onUninstall: (id: string) => void
}

export function InstalledPanel({ installed, isLoading, latestTag, onUninstall }: Props) {
  return (
    <section className="flex flex-col min-h-0 border rounded-lg bg-muted/20">
      <div className="p-3 px-4 border-b bg-background rounded-t-lg shrink-0 flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <HardDrive className="w-4 h-4" /> Installed Engines
        </h3>
        {installed.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">{installed.length}</Badge>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && installed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : installed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center gap-3">
            <Package className="w-10 h-10 opacity-20" />
            <div>
              <p className="text-sm font-medium">No engines installed</p>
              <p className="text-xs mt-1">Use the &quot;Best for You&quot; card above<br />or browse releases on the left</p>
            </div>
          </div>
        ) : (
          installed.map(inst => {
            const colorClass = BACKEND_COLORS[inst.backend] || BACKEND_COLORS['cpu']
            const meta = BACKEND_LABELS[inst.backend] || { label: inst.backend, icon: 'cpu' as const }
            const behind = buildsBehind(inst.tag, latestTag)
            const hasUpdate = behind !== null && behind > 0

            return (
              <Card key={inst.id} className="p-3 group hover:ring-1 hover:ring-border transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm">{humanizeTag(inst.tag)}</span>
                      <Badge variant="outline" className={`${colorClass} text-[9px] font-mono`}>
                        {inst.backend.toUpperCase()}
                      </Badge>
                      {hasUpdate && (
                        <Badge variant="outline" className="text-[9px] gap-0.5 text-status-warning border-status-warning/40">
                          <ArrowUp className="w-2.5 h-2.5" /> {behind} behind
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-0.5">{meta.label}</p>
                    <div className="space-y-0.5 text-[10px] text-muted-foreground">
                      <p className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        Installed {new Date(inst.install_date).toLocaleDateString()}
                      </p>
                      <p className="font-mono truncate" title={inst.path}>{inst.path}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-8 w-8"
                    onClick={() => onUninstall(inst.id)}
                    title="Uninstall"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            )
          })
        )}
      </div>
    </section>
  )
}
