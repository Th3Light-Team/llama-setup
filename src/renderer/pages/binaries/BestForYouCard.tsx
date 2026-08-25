import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Download, CheckCircle2, Zap } from 'lucide-react'
import { humanizeTag, formatBytes, formatDownloads, BACKEND_LABELS } from './helpers'
import type { ParsedAsset } from '../../../core/binaries/types'

interface Props {
  tag: string
  asset: ParsedAsset
  reasonText: string
  isInstalled: boolean
  progress: number | undefined
  onInstall: () => void
}

export function BestForYouCard({ tag, asset, reasonText, isInstalled, progress, onInstall }: Props) {
  const meta = BACKEND_LABELS[asset.backend] || { label: asset.backend.toUpperCase(), icon: 'cpu' as const }

  return (
    <Card className="p-4 border-primary/20 bg-primary/[0.03] shrink-0">
      <div className="flex items-center gap-4">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm">Best for You</span>
            <Badge variant="secondary" className="text-[9px] font-mono">{humanizeTag(tag)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{reasonText}</p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
            <span>{meta.label}</span>
            <span>·</span>
            <span>{formatBytes(asset.size)}</span>
            <span>·</span>
            <span>{formatDownloads(asset.downloadCount)} downloads</span>
          </div>
        </div>
        <div className="shrink-0">
          {isInstalled ? (
            <Badge variant="outline" className="bg-green-50/50 text-green-600 dark:bg-green-950/50 dark:text-green-400 gap-1 border-green-200 dark:border-green-800">
              <CheckCircle2 className="w-3 h-3" /> Installed
            </Badge>
          ) : progress !== undefined ? (
            <div className="flex items-center gap-2 w-28">
              <Progress value={progress} className="h-2 flex-1" />
              <span className="text-[10px] tabular-nums">{progress}%</span>
            </div>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={onInstall}>
              <Download className="w-3.5 h-3.5" /> Install
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
