import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Download, CheckCircle2, Loader2, ChevronDown, ChevronRight,
  Star, Package, Clock, TrendingUp, ExternalLink, Monitor, Cpu
} from 'lucide-react'
import {
  humanizeTag, formatBytes, formatDownloads, timeAgo,
  BACKEND_LABELS
} from './helpers'
import type { ReleaseWithAssets, ParsedAsset, InstallRecord } from '../../../core/binaries/types'
import type { DetectionResult } from '../../../core/types'

function BackendIcon({ type }: { type: 'gpu' | 'cpu' }) {
  return type === 'gpu' ? <Monitor className="w-3 h-3" /> : <Cpu className="w-3 h-3" />
}

interface Props {
  releases: ReleaseWithAssets[]
  installed: InstallRecord[]
  installProgress: Record<string, number>
  isLoading: boolean
  showAllPlatforms: boolean
  hostOs: string
  hostArch: string
  hardwareResult: DetectionResult | null
  onInstall: (tag: string, asset: ParsedAsset) => void
}

export function ReleasesPanel({
  releases, installed, installProgress, isLoading,
  showAllPlatforms, hostOs, hostArch, hardwareResult, onInstall
}: Props) {
  const [expandedRelease, setExpandedRelease] = useState<string | null>(
    releases.length > 0 ? releases[0].tag : null
  )

  const processedReleases = releases.map(r => ({
    ...r,
    displayAssets: showAllPlatforms
      ? r.assets
      : r.assets.filter(a => a.os === hostOs && a.arch === hostArch)
  }))

  return (
    <section className="flex flex-col min-h-0 border rounded-lg bg-muted/20">
      <div className="p-3 px-4 border-b bg-background rounded-t-lg shrink-0 flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Download className="w-4 h-4" /> All Releases
          {releases.length > 0 && (
            <span className="text-[10px] text-muted-foreground font-normal">({releases.length})</span>
          )}
        </h3>
        {!showAllPlatforms && (
          <Badge variant="outline" className="text-[10px] font-mono">{hostOs} · {hostArch}</Badge>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && releases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Fetching releases from GitHub...</span>
          </div>
        ) : processedReleases.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No releases found. Check your connection and try refreshing.
          </div>
        ) : (
          processedReleases.map((release, idx) => {
            const isExpanded = expandedRelease === release.tag
            const isLatest = idx === 0

            return (
              <Card key={release.tag} className={`overflow-hidden ${isLatest ? 'ring-1 ring-primary/20' : ''}`}>
                <button
                  className="w-full p-3 px-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                  onClick={() => setExpandedRelease(isExpanded ? null : release.tag)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 text-muted-foreground">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{humanizeTag(release.tag)}</span>
                        {isLatest && <Badge className="text-[9px] h-4 px-1.5">Latest</Badge>}
                        <span className="text-[10px] text-muted-foreground font-mono">{release.tag}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(release.publishedAt)}</span>
                        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {formatDownloads(release.totalDownloads)}</span>
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {release.displayAssets.length} {showAllPlatforms ? 'assets' : 'compatible'}</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href={release.htmlUrl} target="_blank" rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground p-1 shrink-0"
                    onClick={e => e.stopPropagation()} title="View on GitHub"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </button>

                {isExpanded && (
                  <div className="border-t">
                    {release.displayAssets.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No compatible assets for {hostOs} ({hostArch}).
                      </div>
                    ) : (
                      <div className="divide-y">
                        {release.displayAssets
                          .sort((a, b) => b.downloadCount - a.downloadCount)
                          .map(asset => {
                            const installId = `${release.tag}-${asset.backend}-${asset.arch}`
                            const isInstalled = installed.some(i => i.id === installId)
                            const progress = installProgress[installId]
                            const isInstalling = progress !== undefined
                            const isRecommended = hardwareResult?.recommendedAsset.includes(asset.backend)
                            const meta = BACKEND_LABELS[asset.backend] || { label: asset.backend, icon: 'cpu' as const }

                            return (
                              <div key={asset.url} className="p-3 px-4 flex items-center gap-3 hover:bg-muted/20 transition-colors">
                                <div className="shrink-0 text-muted-foreground"><BackendIcon type={meta.icon} /></div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium">{meta.label}</span>
                                    {isRecommended && (
                                      <Badge className="text-[8px] h-3.5 px-1 gap-0.5 shrink-0 bg-yellow-500/80 hover:bg-yellow-500">
                                        <Star className="w-2.5 h-2.5" /> Best Match
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                                    <span className="font-mono">{asset.backend}</span>
                                    <span>{formatBytes(asset.size)}</span>
                                    <span>{formatDownloads(asset.downloadCount)} ↓</span>
                                    {showAllPlatforms && (
                                      <Badge variant="outline" className="text-[9px] h-3.5 px-1 font-mono">{asset.os}/{asset.arch}</Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="shrink-0">
                                  {isInstalled ? (
                                    <Badge variant="outline" className="bg-green-50/50 text-green-600 dark:bg-green-950/50 dark:text-green-400 gap-1 border-green-200 dark:border-green-800 text-[10px]">
                                      <CheckCircle2 className="w-3 h-3" /> Installed
                                    </Badge>
                                  ) : isInstalling ? (
                                    <div className="flex items-center gap-2 w-28">
                                      <Progress value={progress} className="h-2 flex-1" />
                                      <span className="text-[10px] tabular-nums w-7 text-right">{progress}%</span>
                                    </div>
                                  ) : (
                                    <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" onClick={() => onInstall(release.tag, asset)}>
                                      <Download className="w-3 h-3" /> Install
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })
        )}
      </div>
    </section>
  )
}
