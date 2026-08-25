import { useMemo, useState } from 'react'
import { RotateCcw, Box, Monitor, AlignLeft, Dice3, Server, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLauncherStore, useDetectorStore } from '@/lib/stores'
import { estimateVram } from '../../../core/launcher/vram'
import type { FlagDef, FlagValues } from '../../../core/launcher/types'

const GROUP_ICONS: Record<string, React.ElementType> = {
  core: Box, gpu: Monitor, context: AlignLeft,
  sampling: Dice3, server: Server, experimental: FlaskConical,
}
const GROUP_LABELS: Record<string, string> = {
  core: 'Core', gpu: 'GPU Offload', context: 'Context',
  sampling: 'Sampling', server: 'Server', experimental: 'Experimental',
}

function FlagControl({ def, value, onChange }: { def: FlagDef; value: any; onChange: (v: any) => void }) {
  const isDefault = value === def.default

  if (def.type === 'boolean') {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
        <div className="min-w-0 flex-1 mr-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{def.label}</span>
            <code className="text-[9px] text-muted-foreground font-mono bg-muted px-1 rounded">{def.flag}</code>
            {!isDefault && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Modified" />}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{def.description}</p>
        </div>
        <button
          role="switch"
          aria-checked={!!value}
          className={`h-5 w-9 rounded-full transition-colors relative shrink-0 ${value ? 'bg-brand' : 'bg-muted-foreground/20'}`}
          onClick={() => onChange(!value)}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
    )
  }

  if (def.type === 'select') {
    return (
      <div className="py-2.5 border-b border-border/60 last:border-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{def.label}</span>
          <code className="text-[9px] text-muted-foreground font-mono bg-muted px-1 rounded">{def.flag}</code>
          {!isDefault && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Modified" />}
        </div>
        <p className="text-[11px] text-muted-foreground mb-1.5">{def.description}</p>
        <select
          className="w-full h-8 px-2 text-xs bg-muted border border-border rounded-md"
          value={value ?? def.default}
          onChange={e => onChange(e.target.value)}
        >
          {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    )
  }

  if (def.type === 'string') {
    return (
      <div className="py-2.5 border-b border-border/60 last:border-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{def.label}</span>
          <code className="text-[9px] text-muted-foreground font-mono bg-muted px-1 rounded">{def.flag}</code>
          {!isDefault && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Modified" />}
        </div>
        <p className="text-[11px] text-muted-foreground mb-1.5">{def.description}</p>
        <input
          type="text"
          className="w-full h-8 px-2 text-xs font-mono bg-muted border border-border rounded-md"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={String(def.default || '')}
        />
      </div>
    )
  }

  return (
    <div className="py-2.5 border-b border-border/60 last:border-0">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{def.label}</span>
          <code className="text-[9px] text-muted-foreground font-mono bg-muted px-1 rounded">{def.flag}</code>
          {!isDefault && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Modified" />}
        </div>
        <span className="text-xs font-mono tabular-nums">{value ?? def.default}{def.unit ? ` ${def.unit}` : ''}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-1.5">{def.description}</p>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="flex-1 h-1.5 accent-[--accent-brand]"
          min={def.min ?? 0} max={def.max ?? 100} step={def.step ?? 1}
          value={value ?? def.default}
          onChange={e => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          className="w-16 h-7 px-1.5 text-xs font-mono bg-muted border border-border rounded text-center"
          min={def.min} max={def.max} step={def.step}
          value={value ?? def.default}
          onChange={e => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  )
}

interface ConfigureTabProps {
  flagValues: FlagValues
  onFlagChange: (key: string, value: any) => void
  onReset: () => void
  onSave: () => void
  dirty: boolean
}

export function ConfigureTab({ flagValues, onFlagChange, onReset, onSave, dirty }: ConfigureTabProps) {
  const { flagCatalog } = useLauncherStore()
  const { result: hw } = useDetectorStore()
  const [activeGroup, setActiveGroup] = useState('core')

  const hasGpu = hw?.backends?.some(b => b.available && b.id !== 'cpu')
  const totalVramMB = hw?.vram?.totalMB ?? 0

  const groupFlags = useMemo(() =>
    flagCatalog.filter(f => f.group === activeGroup && (hasGpu || !f.gpuOnly)),
    [flagCatalog, activeGroup, hasGpu]
  )

  const vramEst = useMemo(() => estimateVram(4096, totalVramMB, flagValues), [flagValues, totalVramMB])
  const vramPct = vramEst.utilizationPercent
  const vramColor = vramPct > 100 ? 'text-status-error' : vramPct > 85 ? 'text-status-warning' : 'text-status-ready'
  const barColor = vramPct > 100 ? 'bg-status-error' : vramPct > 85 ? 'bg-status-warning' : 'bg-status-ready'

  return (
    <div className="flex h-full min-h-0">
      {/* Group nav */}
      <div className="w-36 shrink-0 border-r border-border p-2 space-y-0.5">
        {Object.entries(GROUP_LABELS).map(([id, label]) => {
          const Icon = GROUP_ICONS[id] ?? Box
          const modCount = flagCatalog.filter(f =>
            f.group === id && flagValues[f.key] !== undefined && flagValues[f.key] !== f.default
          ).length
          return (
            <button
              key={id}
              onClick={() => setActiveGroup(id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors text-left ${
                activeGroup === id ? 'bg-brand text-brand-foreground' : 'hover:bg-muted text-foreground/70'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {modCount > 0 && (
                <span className={`text-[9px] rounded-full px-1 ${activeGroup === id ? 'bg-brand-foreground/20' : 'bg-brand/10 text-brand'}`}>
                  {modCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Flags + VRAM panel */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* VRAM bar (when GPU present) */}
        {totalVramMB > 0 && (
          <div className="px-4 py-2.5 border-b border-border shrink-0 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">VRAM estimate</span>
              <span className={`font-mono font-semibold tabular-nums ${vramColor}`}>
                {vramEst.totalMB.toLocaleString()} / {totalVramMB.toLocaleString()} MB
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(vramPct, 100)}%` }} />
            </div>
          </div>
        )}

        {/* Flag list */}
        <div className="flex-1 overflow-y-auto px-4">
          <div className="flex items-center justify-between pt-3 pb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {GROUP_LABELS[activeGroup]}
            </span>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={onReset}>
              <RotateCcw className="h-3 w-3" aria-hidden /> Reset
            </Button>
          </div>
          {groupFlags.map(def => (
            <FlagControl
              key={def.key}
              def={def}
              value={flagValues[def.key]}
              onChange={v => onFlagChange(def.key, v)}
            />
          ))}
          {groupFlags.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {activeGroup === 'gpu' && !hasGpu ? 'No GPU detected — GPU flags are hidden' : 'No flags in this group'}
            </p>
          )}
        </div>

        {/* Save bar */}
        {dirty && (
          <div className="shrink-0 px-4 py-2 border-t border-border flex justify-end">
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={onSave}>
              Save changes
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
