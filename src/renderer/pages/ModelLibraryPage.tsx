import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Play, Trash2, RefreshCw, Library, FolderPlus, Folders } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { MonoText } from '@/components/ui/mono-text'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { extractQuantization } from '../../core/registry/hf-client'
import { BenchMenuButton } from '@/components/BenchMenuButton'
import { useBinariesStore } from '@/lib/stores'

interface LocalModel {
  modelId: string
  filename: string
  path: string
  sizeMb: number
  downloadedAt: string | null
  meta: Record<string, unknown> | null
  folderPath: string
  isDefaultFolder: boolean
}

interface FolderInfo {
  path: string
  isDefault: boolean
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso))
}

/** Short, screen-friendly label for a folder path. Falls back to the full path
 *  if the basename is empty (e.g. drive root). */
function folderLabel(p: string): string {
  const segments = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return segments[segments.length - 1] || p
}

/** Sentinel for the "All" chip selection. */
const ALL = '__all__'

export default function ModelLibraryPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [models, setModels] = useState<LocalModel[]>([])
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string>(ALL)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fetchInstalled = useBinariesStore(s => s.fetchInstalled)

  // BenchMenuButton needs the installed binaries list to find llama-bench;
  // pull it in case the user lands on Library before visiting the Binaries page.
  useEffect(() => { fetchInstalled() }, [fetchInstalled])

  async function load() {
    setLoading(true)
    try {
      const [list, fs] = await Promise.all([
        window.electron.library.list(),
        window.electron.library.folders(),
      ])
      setModels(list)
      setFolders(fs)
      // If the previously-selected folder vanished (user removed it from
      // Settings), fall back to "All" so the view stays usable.
      if (selectedFolder !== ALL && !fs.some(f => f.path === selectedFolder)) {
        setSelectedFolder(ALL)
      }
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
  useEffect(() => { load() }, [])

  const visibleModels = useMemo(
    () => selectedFolder === ALL ? models : models.filter(m => m.folderPath === selectedFolder),
    [models, selectedFolder]
  )

  async function handleReveal(path: string) {
    await window.electron.library.reveal(path)
  }

  async function handleDelete(path: string, name: string) {
    setDeleting(path)
    try {
      await window.electron.library.delete(path)
      toast({ title: `Deleted ${name}`, variant: 'info' })
      await load()
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err?.message, variant: 'error' })
    } finally {
      setDeleting(null)
    }
  }

  function handleUseInLaunch(model: LocalModel) {
    navigate(`/launch?modelPath=${encodeURIComponent(model.path)}`)
  }

  async function handleAddFolder() {
    const picked = await window.electron.app.pickFolder({ title: 'Add a model folder' })
    if (!picked) return
    try {
      await window.electron.library.addFolder(picked)
      toast({ title: 'Folder added', description: picked, variant: 'success' })
      await load()
      setSelectedFolder(picked) // jump into the new folder so the user can see what's there
    } catch (err: any) {
      toast({ title: 'Could not add folder', description: err?.message, variant: 'error' })
    }
  }

  // Per-folder counts for the chip-bar.
  const countByFolder = useMemo(() => {
    const m = new Map<string, number>()
    for (const model of models) m.set(model.folderPath, (m.get(model.folderPath) ?? 0) + 1)
    return m
  }, [models])

  const showFolderChips = folders.length > 1 || (folders.length === 1 && !folders[0].isDefault)
  const showFolderBadgeOnRows = selectedFolder === ALL && folders.length > 1

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl pb-8">
      <PageHeader
        title="Model Library"
        subtitle="Downloaded models plus any extra folders you've added"
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={['h-3.5 w-3.5', loading ? 'animate-spin' : ''].join(' ')} aria-hidden />
            Refresh
          </Button>
        }
      />

      {/* Folder filter chip-bar.  Mirrors Registry's mode switcher pattern so
          the visual language across pages stays consistent. */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4" role="tablist" aria-label="Filter by folder">
        <FolderChip
          active={selectedFolder === ALL}
          onClick={() => setSelectedFolder(ALL)}
          icon={<Folders className="h-3 w-3" aria-hidden />}
          label="All"
          count={models.length}
        />

        {/* Always render the Default chip so users can isolate the download
            folder; hide the *extras* section when there are none. */}
        {folders.map(f => {
          const label = f.isDefault ? 'Default' : folderLabel(f.path)
          return (
            <FolderChip
              key={f.path}
              active={selectedFolder === f.path}
              onClick={() => setSelectedFolder(f.path)}
              label={label}
              count={countByFolder.get(f.path) ?? 0}
              title={f.path}
            />
          )
        })}

        <button
          onClick={handleAddFolder}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/40 transition-colors"
          title="Add a model folder"
        >
          <FolderPlus className="h-3 w-3" aria-hidden /> Add folder…
        </button>

        {/* Subtle hint when no extras are configured yet — shown once so users
            who haven't discovered the feature know it exists. */}
        {!showFolderChips && (
          <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">
            Add a folder to scan models from another drive
          </span>
        )}
      </div>

      {!loading && visibleModels.length === 0 ? (
        models.length === 0 ? (
          <EmptyState
            icon={<Library className="h-6 w-6" aria-hidden />}
            title="No models yet"
            body="Search Hugging Face for GGUF models, or add a folder you already have models in."
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => navigate('/registry')}>Browse Registry</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleAddFolder}>
                  <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Add folder
                </Button>
              </div>
            }
          />
        ) : (
          <EmptyState
            icon={<Library className="h-6 w-6" aria-hidden />}
            title="No models in this folder"
            body="Switch to All to see models from other folders."
            action={<Button size="sm" variant="outline" onClick={() => setSelectedFolder(ALL)}>Show all</Button>}
          />
        )
      ) : (
        <div className="space-y-2">
          {visibleModels.map(model => {
            const quant = extractQuantization(model.filename)
            return (
              <div
                key={model.path}
                className="rounded-lg border border-border bg-card px-4 py-3.5 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{model.modelId.split('/').pop()}</span>
                    {quant !== 'Unknown' ? <Badge variant="secondary">{quant}</Badge> : null}
                    {showFolderBadgeOnRows ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-normal gap-1',
                          model.isDefaultFolder ? 'border-brand/40 text-brand' : 'border-border text-muted-foreground'
                        )}
                        title={model.folderPath}
                      >
                        <Folders className="h-2.5 w-2.5" aria-hidden />
                        {model.isDefaultFolder ? 'default' : folderLabel(model.folderPath)}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">{model.sizeMb} MB</span>
                  </div>
                  <MonoText size="xs" dim wrap={false} className="block">{model.filename}</MonoText>
                  <p className="text-xs text-muted-foreground">Added {formatDate(model.downloadedAt)}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <BenchMenuButton modelPath={model.path} modelName={model.filename.replace(/\.gguf$/i, '')} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleReveal(model.path)}
                    title="Reveal in file explorer"
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">Reveal in explorer</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleUseInLaunch(model)}
                    title="Use in Launch Pad"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">Use in Launch Pad</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(model.path, model.filename)}
                    disabled={deleting === model.path}
                    title="Delete model file"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}

interface FolderChipProps {
  active: boolean
  onClick: () => void
  label: string
  count: number
  icon?: React.ReactNode
  title?: string
}

function FolderChip({ active, onClick, label, count, icon, title }: FolderChipProps) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors max-w-48',
        active
          ? 'bg-foreground text-background'
          : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className={cn('text-[10px] tabular-nums', active ? 'opacity-70' : 'opacity-60')}>{count}</span>
    </button>
  )
}
