import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Search, Download, Heart, ArrowLeft,
  Loader2, FileArchive, Brain, Hash, Scale, ExternalLink, X, Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HfModelSummary, HfModelDetail, GgufVariant } from '../../core/registry/types'
import { FeaturedView } from './registry/FeaturedView'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/components/ui/toast'
import { useDownloadsStore } from '@/lib/stores/downloads'
import { DownloadConfirmDialog } from '@/components/DownloadConfirmDialog'
import { preflightCheck } from '@/lib/preflight'
import type { PreflightResult } from '@/components/DownloadConfirmDialog'
import { useTourPart } from '@/lib/tour/useTourPart'

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBytes(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function quantColor(q: string): string {
  if (q.startsWith('Q2') || q.startsWith('IQ2')) return 'text-status-error'
  if (q.startsWith('Q3') || q.startsWith('IQ3')) return 'text-status-warning'
  if (q.startsWith('Q4') || q.startsWith('IQ4')) return 'text-brand'
  if (q.startsWith('Q5')) return 'text-status-ready'
  if (q.startsWith('Q6') || q.startsWith('Q8')) return 'text-status-ready'
  if (q === 'F16' || q === 'BF16') return 'text-status-downloading'
  if (q === 'F32') return 'text-status-scanning'
  return 'text-muted-foreground'
}

type RegistryMode = 'featured' | 'search'

const SORT_OPTIONS = [
  { value: 'downloads', label: 'Downloads' },
  { value: 'likes', label: 'Likes' },
  { value: 'lastModified', label: 'Recent' },
]

// ─── detail view ──────────────────────────────────────────────────────────────

interface DetailViewProps {
  model: HfModelDetail
  downloadProgress: Record<string, { percent: number; downloadedMB: number; totalMB: number }>
  onBack: () => void
  onDownload: (variant: GgufVariant) => void
  onCancelDownload: (modelId: string, filename: string) => void
}

function DetailView({ model, downloadProgress, onBack, onDownload, onCancelDownload }: DetailViewProps) {
  const navigate = useNavigate()
  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label="Back to registry">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold tracking-tight truncate">{model.id}</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            {model.architecture && (
              <span className="flex items-center gap-1"><Brain className="h-3 w-3" aria-hidden /> {model.architecture}</span>
            )}
            {model.contextLength && (
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" aria-hidden /> {model.contextLength.toLocaleString()} ctx</span>
            )}
            {model.license && (
              <span className="flex items-center gap-1"><Scale className="h-3 w-3" aria-hidden /> {model.license}</span>
            )}
            <span className="flex items-center gap-1"><Download className="h-3 w-3" aria-hidden /> {formatNumber(model.downloads)}</span>
            <span className="flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden /> {formatNumber(model.likes)}</span>
          </div>
        </div>
        <a
          href={`https://huggingface.co/${model.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Open on HuggingFace"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>

      <Card data-tour="reg-variants" className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="p-3 px-4 border-b bg-muted/30 shrink-0 flex items-center justify-between">
          <h3 className="text-sm font-semibold">GGUF variants ({model.variants.length})</h3>
          <span className="text-[10px] text-muted-foreground">Sorted by size · smallest first</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {model.variants.length === 0 ? (
            <EmptyState
              icon={<FileArchive className="h-6 w-6" aria-hidden />}
              title="No GGUF files found"
              body="This repository doesn't appear to contain .gguf model files."
              className="m-4 py-8"
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-xs">Quantization</th>
                  <th className="text-left p-3 font-medium text-xs">Filename</th>
                  <th className="text-right p-3 font-medium text-xs">Size</th>
                  <th className="text-right p-3 font-medium text-xs w-40">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {model.variants.map(v => {
                  const dlKey = `${model.id}/${v.filename}`
                  const progress = downloadProgress[dlKey]
                  const isDownloading = progress !== undefined
                  const isDone = progress?.percent === 100

                  return (
                    <tr key={v.filename} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3">
                        <span className={`font-mono font-bold text-xs ${quantColor(v.quantization)}`}>
                          {v.quantization}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-[11px] text-muted-foreground truncate block max-w-xs" title={v.filename}>
                          {v.filename}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-xs">{formatBytes(v.sizeMB)}</td>
                      <td className="p-3 text-right">
                        {isDownloading ? (
                          <div className="flex items-center gap-2 justify-end">
                            <div className="w-20">
                              <Progress value={progress.percent} className="h-1.5" />
                            </div>
                            <span className="text-[10px] tabular-nums w-8 text-right">{progress.percent}%</span>
                            {!isDone && (
                              <Button
                                variant="ghost" size="icon" className="h-5 w-5 text-destructive"
                                onClick={() => onCancelDownload(model.id, v.filename)}
                                aria-label="Cancel download"
                              >
                                <X className="h-3 w-3" aria-hidden />
                              </Button>
                            )}
                            {isDone && (
                              <Button
                                variant="ghost" size="sm" className="h-5 text-[10px] text-status-ready px-1.5"
                                onClick={() => navigate(`/launch?modelPath=${encodeURIComponent('')}`)}
                              >
                                Use
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button
                            variant="secondary" size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => onDownload(v)}
                          >
                            <Download className="h-3 w-3" aria-hidden /> Download
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}

// ─── search view ──────────────────────────────────────────────────────────────

interface SearchViewProps {
  onSelectModel: (id: string) => void
  initialQuery?: string
}

function SearchView({ onSelectModel, initialQuery = '' }: SearchViewProps) {
  const [query, setQuery] = useState(initialQuery)
  const [sort, setSort] = useState('downloads')
  const [results, setResults] = useState<HfModelSummary[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const doSearch = useCallback(async (q: string, s: string) => {
    setIsSearching(true)
    setError(null)
    setHasSearched(true)
    try {
      const data = await window.electron.registry.search(q, s)
      setResults(data)
    } catch (err: any) {
      setError(err.message || 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial search on mount
    if (initialQuery) doSearch(initialQuery, sort)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Search bar */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
          <input
            className="w-full h-9 pl-9 pr-3 text-sm bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search HuggingFace (e.g. llama, mistral, gemma)…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch(query, sort)}
            aria-label="Search HuggingFace models"
          />
        </div>
        <div className="flex items-center gap-1">
          {SORT_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              variant={sort === opt.value ? 'default' : 'outline'}
              size="sm" className="h-9 text-xs"
              onClick={() => { setSort(opt.value); if (hasSearched) doSearch(query, opt.value) }}
            >
              {opt.value === 'downloads' ? <Download className="h-3 w-3 mr-1" aria-hidden /> : null}
              {opt.value === 'likes' ? <Heart className="h-3 w-3 mr-1" aria-hidden /> : null}
              {opt.label}
            </Button>
          ))}
        </div>
        <Button
          size="sm" className="h-9 gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
          onClick={() => doSearch(query, sort)} disabled={isSearching}
        >
          {isSearching
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            : <Search className="h-3.5 w-3.5" aria-hidden />
          }
          Search
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-status-error">{error}</p>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isSearching && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <span className="text-sm">Searching HuggingFace…</span>
          </div>
        ) : !hasSearched ? (
          <EmptyState
            icon={<Search className="h-6 w-6" aria-hidden />}
            title="Type to search"
            body="Search across all GGUF-tagged models on HuggingFace. Use the sort buttons to order by downloads, likes, or recency."
          />
        ) : results.length === 0 ? (
          <EmptyState
            icon={<Brain className="h-6 w-6" aria-hidden />}
            title="No results"
            body="Try a different search term or sort order."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {results.map(model => (
              <Card
                key={model.id}
                className="p-4 cursor-pointer hover:border-brand/40 hover:bg-brand-muted/20 transition-all group"
                onClick={() => onSelectModel(model.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-sm truncate group-hover:text-brand transition-colors">
                      {model.id}
                    </h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">by {model.author}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Download className="h-3 w-3" aria-hidden /> {formatNumber(model.downloads)}</span>
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden /> {formatNumber(model.likes)}</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{model.pipelineTag}</Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {model.tags
                    .filter(t => !t.startsWith('base_model:') && !t.startsWith('license:') && t !== 'gguf' && t !== 'endpoints_compatible' && !t.startsWith('region:'))
                    .slice(0, 5)
                    .map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[9px] h-4 px-1.5">{tag}</Badge>
                    ))
                  }
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── page root ────────────────────────────────────────────────────────────────

export default function RegistryPage() {
  const { addToast } = useToast()
  useTourPart('registry')
  const [mode, setMode] = useState<RegistryMode>('featured')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState<HfModelDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [pendingVariant, setPendingVariant] = useState<GgufVariant | null>(null)
  const [pendingPreflight, setPendingPreflight] = useState<PreflightResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const downloadJobs = useDownloadsStore(s => s.jobs)
  const cancelDownload = useDownloadsStore(s => s.cancel)
  const openDrawer = useDownloadsStore(s => s.openDrawer)

  // Derive a per-(modelId/filename) progress map from active model downloads
  const downloadProgress: Record<string, { percent: number; downloadedMB: number; totalMB: number }> = {}
  for (const job of Object.values(downloadJobs)) {
    if (job.kind !== 'model') continue
    if (job.state === 'failed' || job.state === 'cancelled') continue
    const extra = job.extra as { modelId?: string; filename?: string } | null
    if (!extra?.modelId || !extra.filename) continue
    const key = `${extra.modelId}/${extra.filename}`
    const total = job.bytesTotal ?? 0
    const percent = total > 0 ? Math.round((job.bytesDone / total) * 100) : (job.state === 'done' ? 100 : 0)
    downloadProgress[key] = {
      percent,
      downloadedMB: Math.round(job.bytesDone / (1024 * 1024)),
      totalMB: total > 0 ? Math.round(total / (1024 * 1024)) : 0,
    }
  }

  async function handleSelectModel(id: string) {
    setIsLoadingDetail(true)
    try {
      const detail = await window.electron.registry.detail(id)
      setSelectedModel(detail)
    } catch (err: any) {
      addToast({ title: 'Failed to load model', description: err?.message, variant: 'error' })
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function handleDownload(variant: GgufVariant) {
    if (!selectedModel) return
    const pf = await preflightCheck({ sizeMB: variant.sizeMB, license: selectedModel.license ?? null })
    setPendingVariant(variant)
    setPendingPreflight(pf)
    setConfirmOpen(true)
  }

  async function confirmAndDownload() {
    if (!selectedModel || !pendingVariant) return
    try {
      await window.electron.registry.download(
        selectedModel.id,
        pendingVariant.filename,
        pendingVariant.downloadUrl,
        pendingVariant.sha256,
        pendingVariant.shards
      )
      const shardSuffix = pendingVariant.shards.length > 0
        ? ` (+ ${pendingVariant.shards.length} shard${pendingVariant.shards.length === 1 ? '' : 's'})`
        : ''
      addToast({
        title: 'Added to download queue',
        description: `${pendingVariant.filename}${shardSuffix} — view progress in the downloads drawer.`,
        variant: 'info'
      })
      openDrawer()
    } catch (err: any) {
      addToast({ title: 'Download failed', description: err?.message, variant: 'error' })
    }
  }

  function handleCancelDownload(modelId: string, filename: string) {
    const baseName = filename.split('/').pop() || filename
    const id = `model:${modelId}/${baseName}`
    cancelDownload(id)
  }

  function handleBrowseAuthor(authorId: string) {
    setSearchQuery(authorId)
    setMode('search')
  }

  // Loading skeleton
  if (isLoadingDetail) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-3">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm">Loading model…</span>
      </div>
    )
  }

  // Detail overlay — no mode switcher shown
  if (selectedModel) {
    return (
      <>
        <DetailView
          model={selectedModel}
          downloadProgress={downloadProgress}
          onBack={() => setSelectedModel(null)}
          onDownload={handleDownload}
          onCancelDownload={handleCancelDownload}
        />
        {pendingVariant && pendingPreflight && (
          <DownloadConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={pendingVariant.filename}
            subtitle={selectedModel.id}
            sizeMB={pendingVariant.sizeMB}
            preflight={pendingPreflight}
            onConfirm={confirmAndDownload}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col h-full gap-5">
      <PageHeader
        title="Model Registry"
        subtitle="Browse hand-picked models or search all of HuggingFace"
      />

      {/* Mode switcher — the primary navigation element */}
      <div data-tour="reg-modes" className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1 w-fit shrink-0" role="tablist" aria-label="Registry mode">
        <button
          role="tab"
          aria-selected={mode === 'featured'}
          onClick={() => setMode('featured')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            mode === 'featured'
              ? 'bg-background border border-border shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Featured
        </button>
        <button
          role="tab"
          aria-selected={mode === 'search'}
          onClick={() => setMode('search')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            mode === 'search'
              ? 'bg-background border border-border shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          Search
        </button>
      </div>

      {/* Panel */}
      <div data-tour="reg-panel" className="flex-1 min-h-0 overflow-y-auto">
        {mode === 'featured' ? (
          <FeaturedView
            onSelectModel={handleSelectModel}
            onBrowseAuthor={handleBrowseAuthor}
          />
        ) : (
          <SearchView
            key={searchQuery}
            initialQuery={searchQuery}
            onSelectModel={handleSelectModel}
          />
        )}
      </div>
    </div>
  )
}
