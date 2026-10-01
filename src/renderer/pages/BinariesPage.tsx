import { useEffect, useState, useCallback, useMemo } from 'react'
import { useBinariesStore, useDetectorStore, useDiscoveryStore } from '@/lib/stores'
import { useEnginesStore } from '@/lib/stores/engines'
import { useDownloadsStore } from '@/lib/stores/downloads'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
  RefreshCw, Server, Cpu, ShieldCheck, ShieldAlert, ShieldX, Shield,
  Star, ArrowUp, Trash2, Import, ChevronRight, ChevronDown, Lightbulb,
  Monitor,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { DownloadConfirmDialog } from '@/components/DownloadConfirmDialog'
import { preflightCheck } from '@/lib/preflight'
import type { PreflightResult } from '@/components/DownloadConfirmDialog'
import { cn } from '@/lib/utils'
import { useTourPart } from '@/lib/tour/useTourPart'

import { BestForYouCard } from './binaries/BestForYouCard'
import { ReleasesPanel } from './binaries/ReleasesPanel'
import { humanizeTag, getHealthColor, getHealthLabel, BACKEND_LABELS } from './binaries/helpers'
import type { ParsedAsset } from '../../core/binaries/types'
import type { EngineRow } from '../../core/engines/types'

function HealthIcon({ status }: { status: string }) {
  switch (status) {
    case 'healthy': return <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
    case 'degraded': return <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
    case 'broken': return <ShieldX className="w-3.5 h-3.5" aria-hidden />
    default: return <Shield className="w-3.5 h-3.5" aria-hidden />
  }
}

function backendFamily(b: string): string {
  return (b || '').toLowerCase().split('-')[0]
}

function fmtSize(bytes: number | null): string | null {
  if (!bytes) return null
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
  return `${Math.round(bytes / 1048576)} MB`
}

export default function BinariesPage() {
  const { releases, installed, isLoadingReleases, error, fetchReleases, fetchInstalled, install, uninstall } = useBinariesStore()
  const { engines, loading: enginesLoading, load: loadEngines, setDefault, verify } = useEnginesStore()
  const { result: hardwareResult, detect } = useDetectorStore()
  const { scan, runScan } = useDiscoveryStore()
  const downloadJobs = useDownloadsStore(s => s.jobs)
  const openDrawer = useDownloadsStore(s => s.openDrawer)
  const { addToast } = useToast()
  useTourPart('binaries')

  const [showAllPlatforms, setShowAllPlatforms] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [envOpen, setEnvOpen] = useState(false)
  const [verifyingPath, setVerifyingPath] = useState<string | null>(null)
  const [pendingInstall, setPendingInstall] = useState<{ tag: string; asset: ParsedAsset } | null>(null)
  const [pendingPreflight, setPendingPreflight] = useState<PreflightResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    detect()
    fetchReleases()
    fetchInstalled()
    runScan({ quickScan: true }).finally(() => loadEngines(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh the engine list whenever a binary download finishes.
  useEffect(() => {
    const off = window.electron.downloads.onDone(() => { fetchInstalled(); loadEngines(true) })
    return off
  }, [fetchInstalled, loadEngines])

  const installProgress: Record<string, number> = {}
  for (const job of Object.values(downloadJobs)) {
    if (job.kind !== 'binary') continue
    const extra = job.extra as { installId?: string } | null
    if (!extra?.installId) continue
    if (job.state === 'done' || job.state === 'failed' || job.state === 'cancelled') continue
    installProgress[extra.installId] = job.bytesTotal && job.bytesTotal > 0
      ? Math.round((job.bytesDone / job.bytesTotal) * 100) : 0
  }

  const hostOs = hardwareResult?.os || 'unknown'
  const hostArch = hardwareResult?.arch || 'unknown'
  const latestRelease = releases[0]
  const latestBuild = latestRelease ? parseInt(latestRelease.tag.replace(/^b/i, ''), 10) : null
  const compatibleAssets = latestRelease?.assets.filter(a => a.os === hostOs && a.arch === hostArch) ?? []
  const recommendedAsset = compatibleAssets.find(a => hardwareResult?.recommendedAsset.includes(a.backend)) || compatibleAssets[0]
  const bestForYouId = latestRelease && recommendedAsset ? `${latestRelease.tag}-${recommendedAsset.backend}-${recommendedAsset.arch}` : null
  const isBestInstalled = bestForYouId ? installed.some(i => i.id === bestForYouId) : false
  const bestProgress = bestForYouId ? installProgress[bestForYouId] : undefined

  const bestGpu = hardwareResult?.vram?.gpus[0]
  const reasonText = bestGpu
    ? `Based on your ${bestGpu.name}`
    : hostOs !== 'unknown' ? `Best option for ${hostOs} (${hostArch})` : 'Recommended for your system'

  const recommendedBackendLabel = recommendedAsset
    ? (BACKEND_LABELS[recommendedAsset.backend]?.label ?? recommendedAsset.backend)
    : null

  const updateCount = useMemo(() => engines.filter(e => {
    if (e.build == null || latestBuild == null) return false
    return latestBuild - e.build > 0 && backendFamily(e.backend) !== 'unknown'
  }).length, [engines, latestBuild])

  async function handleInstall(tag: string, asset: ParsedAsset) {
    const sizeMB = Math.round(asset.size / (1024 * 1024))
    const pf = await preflightCheck({ sizeMB })
    setPendingInstall({ tag, asset })
    setPendingPreflight(pf)
    setConfirmOpen(true)
  }

  const confirmAndInstall = useCallback(async () => {
    if (!pendingInstall) return
    const { tag, asset } = pendingInstall
    try {
      await install(tag, asset)
      addToast({ variant: 'info', title: 'Added to download queue', description: `${humanizeTag(tag)} · ${asset.backend}` })
      openDrawer()
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Install failed', description: err?.message })
    }
  }, [pendingInstall, install, addToast, openDrawer])

  function handleUpdate(engine: EngineRow) {
    // Install the latest release asset whose backend family matches this engine,
    // for the host platform. Falls back to the recommended asset.
    if (!latestRelease) return
    const fam = backendFamily(engine.backend)
    const match = latestRelease.assets.find(a => a.os === hostOs && a.arch === hostArch && backendFamily(a.backend) === fam)
      ?? recommendedAsset
    if (match) handleInstall(latestRelease.tag, match)
  }

  async function handleVerify(engine: EngineRow) {
    setVerifyingPath(engine.path)
    try {
      await verify(engine.path)
      addToast({ variant: 'success', title: 'Re-checked', description: engine.path })
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Verify failed', description: err?.message })
    } finally {
      setVerifyingPath(null)
    }
  }

  async function handleImport(engine: EngineRow) {
    if (!engine.binaryPath) return
    try {
      await window.electron.discovery.importBinary(engine.binaryPath, engine.backend)
      await fetchInstalled()
      await loadEngines(true)
      addToast({ variant: 'success', title: 'Imported', description: 'Added to managed installs.' })
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Import failed', description: err?.message })
    }
  }

  async function handleUninstall(engine: EngineRow) {
    try {
      await uninstall(engine.id)
      await loadEngines(true)
      addToast({ variant: 'success', title: 'Uninstalled' })
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Uninstall failed', description: err?.message })
    }
  }

  async function handleRefresh() {
    await Promise.all([fetchReleases(true), runScan({ forceRescan: true, quickScan: true })])
    await loadEngines(true)
  }

  const issues = scan?.issues ?? []

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl pb-10">
        <PageHeader
          title="Binary management"
          subtitle="Your llama.cpp engines and where they run"
          actions={
            <div className="flex items-center gap-2">
              {error && <Badge variant="destructive" className="text-xs">{error}</Badge>}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh} disabled={enginesLoading || isLoadingReleases}>
                <RefreshCw className={cn('h-3.5 w-3.5', (enginesLoading || isLoadingReleases) && 'animate-spin')} aria-hidden />
                Refresh
              </Button>
            </div>
          }
        />

        {/* Status strip */}
        <div className="flex items-center gap-3 flex-wrap text-xs bg-muted/40 rounded-md px-3 py-2 mt-1">
          <span className="flex items-center gap-1.5"><Server className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> <b className="font-medium">{engines.length}</b> engine{engines.length === 1 ? '' : 's'}</span>
          {recommendedBackendLabel && <><span className="text-muted-foreground">·</span><span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> {recommendedBackendLabel} recommended</span></>}
          {updateCount > 0 && <><span className="text-muted-foreground">·</span><span className="flex items-center gap-1.5 text-status-warning"><ArrowUp className="h-3.5 w-3.5" aria-hidden /> {updateCount} update{updateCount === 1 ? '' : 's'} available</span></>}
        </div>

        {/* Your engines */}
        <h2 className="text-sm font-semibold text-muted-foreground mt-6 mb-2">Your engines</h2>
        {engines.length === 0 ? (
          <div data-tour="bin-engines" className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {enginesLoading ? 'Scanning for engines…' : 'No engines yet. Install one below to get started.'}
          </div>
        ) : (
          <div data-tour="bin-engines" className="space-y-2">
            {engines.map(engine => {
              const behind = engine.build != null && latestBuild != null ? latestBuild - engine.build : null
              const canUpdate = behind != null && behind > 0 && backendFamily(engine.backend) !== 'unknown'
              return (
                <EngineCard
                  key={engine.id}
                  engine={engine}
                  behind={canUpdate ? behind : null}
                  verifying={verifyingPath === engine.path}
                  onSetDefault={() => setDefault(engine.path)}
                  onVerify={() => handleVerify(engine)}
                  onUpdate={() => handleUpdate(engine)}
                  onImport={() => handleImport(engine)}
                  onUninstall={() => handleUninstall(engine)}
                />
              )
            })}
          </div>
        )}

        {/* Get a new build */}
        <div data-tour="bin-get">
        <h2 className="text-sm font-semibold text-muted-foreground mt-7 mb-2">Get a new build</h2>
        {recommendedAsset && latestRelease && (
          <BestForYouCard
            tag={latestRelease.tag}
            asset={recommendedAsset}
            reasonText={reasonText}
            isInstalled={isBestInstalled}
            progress={bestProgress}
            onInstall={() => handleInstall(latestRelease.tag, recommendedAsset)}
          />
        )}
        {engines.some(e => backendFamily(e.backend) === 'cuda') && !engines.some(e => backendFamily(e.backend) === 'vulkan') && (
          <p className="text-xs text-status-warning mt-2 flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" aria-hidden /> You have CUDA. Install Vulkan to compare on your other GPUs.
          </p>
        )}

        <button
          onClick={() => setBrowseOpen(o => !o)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mt-3"
        >
          {browseOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          Browse all releases ({releases.length})
        </button>
        </div>
        {browseOpen && (
          <div className="mt-2 h-[420px]">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={() => setShowAllPlatforms(v => !v)}>
                {showAllPlatforms ? 'My platform' : 'All platforms'}
              </Button>
            </div>
            <ReleasesPanel
              releases={releases}
              installed={installed}
              installProgress={installProgress}
              isLoading={isLoadingReleases}
              showAllPlatforms={showAllPlatforms}
              hostOs={hostOs}
              hostArch={hostArch}
              hardwareResult={hardwareResult}
              onInstall={handleInstall}
            />
          </div>
        )}

        {/* Environment */}
        <button
          onClick={() => setEnvOpen(o => !o)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mt-7"
        >
          {envOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          Environment{issues.length > 0 ? ` (${issues.length} warning${issues.length === 1 ? '' : 's'})` : ''}
        </button>
        {envOpen && (
          <div className="mt-2 space-y-1.5">
            {issues.length === 0 ? (
              <p className="text-xs text-muted-foreground">No environment warnings.</p>
            ) : issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5">{issue.severity}</Badge>
                <div className="min-w-0">
                  <p className="text-muted-foreground">{issue.message}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">{issue.suggestion}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingInstall && pendingPreflight && (
        <DownloadConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`${humanizeTag(pendingInstall.tag)} · ${pendingInstall.asset.backend}`}
          subtitle={pendingInstall.asset.filename}
          sizeMB={Math.round(pendingInstall.asset.size / (1024 * 1024))}
          preflight={pendingPreflight}
          onConfirm={confirmAndInstall}
        />
      )}
    </div>
  )
}

interface EngineCardProps {
  engine: EngineRow
  behind: number | null
  verifying: boolean
  onSetDefault: () => void
  onVerify: () => void
  onUpdate: () => void
  onImport: () => void
  onUninstall: () => void
}

function EngineCard({ engine, behind, verifying, onSetDefault, onVerify, onUpdate, onImport, onUninstall }: EngineCardProps) {
  const size = fmtSize(engine.sizeBytes)
  return (
    <div data-tour="bin-engine-card" className={cn('rounded-lg border bg-card px-4 py-3', engine.isDefault ? 'border-2 border-brand' : 'border-border')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {engine.isDefault && <Star className="h-3.5 w-3.5 text-brand shrink-0" aria-hidden />}
            <span className="font-medium text-sm">{humanizeTag(engine.tag)}</span>
            <Badge variant="outline" className="text-[9px] font-mono">{engine.backend.toUpperCase()}</Badge>
            <Badge variant="outline" className={cn(getHealthColor(engine.health), 'text-[9px] gap-0.5')}>
              <HealthIcon status={engine.health} /> {getHealthLabel(engine.health)}
            </Badge>
            {engine.isDefault && <Badge className="text-[9px]">Default</Badge>}
            {behind != null && (
              <Badge variant="outline" className="text-[9px] gap-0.5 text-status-warning border-status-warning/40">
                <ArrowUp className="h-2.5 w-2.5" aria-hidden /> {behind} behind
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-[11px] text-muted-foreground">
            <span>{engine.source}</span>
            {engine.build != null && <><span>·</span><span>build {engine.build}</span></>}
            {size && <><span>·</span><span>{size}</span></>}
            {engine.devices.map(d => (
              <span key={d} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                {d === 'CPU' ? <Cpu className="h-2.5 w-2.5" aria-hidden /> : <Monitor className="h-2.5 w-2.5" aria-hidden />}{d}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/70 font-mono truncate mt-1" title={engine.path}>{engine.path}</p>
        </div>

        <div data-tour="bin-engine-actions" className="flex items-center gap-1.5 shrink-0">
          {!engine.isDefault && engine.health !== 'broken' && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSetDefault}>Set default</Button>
          )}
          {behind != null && (
            <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" onClick={onUpdate}>
              <ArrowUp className="h-3 w-3" aria-hidden /> Update
            </Button>
          )}
          {!engine.managed && engine.health !== 'broken' && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onImport}>
              <Import className="h-3 w-3" aria-hidden /> Import
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onVerify} disabled={verifying}>
            <RefreshCw className={cn('h-3 w-3', verifying && 'animate-spin')} aria-hidden /> Verify
          </Button>
          {engine.managed && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onUninstall} title="Uninstall">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Uninstall</span>
            </Button>
          )}
        </div>
      </div>

      {/* Per-binary detail when an install ships several llama-* tools */}
      {engine.binaries.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-border/60">
          {engine.binaries.map(b => (
            <span key={b.path} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title={`${b.name}: ${b.health}`}>
              {b.health === 'healthy'
                ? <ShieldCheck className="h-2.5 w-2.5 text-status-ready" aria-hidden />
                : b.health === 'broken'
                  ? <ShieldX className="h-2.5 w-2.5 text-status-error" aria-hidden />
                  : <ShieldAlert className="h-2.5 w-2.5 text-status-warning" aria-hidden />}
              {b.name.replace('llama-', '')}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
