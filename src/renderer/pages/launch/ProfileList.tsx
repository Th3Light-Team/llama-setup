import { useState, useRef, useEffect } from 'react'
import { Plus, Upload, Download, Copy, Trash2, Search, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import { Badge } from '@/components/ui/badge'
import { useLauncherStore } from '@/lib/stores'
import { useUiPrefsStore } from '@/lib/stores/ui-prefs'
import { cn } from '@/lib/utils'
import type { Profile } from '../../../core/launcher/types'
import { useToast } from '@/components/ui/toast'

const BACKEND_LABEL: Record<string, string> = {
  cuda: 'CUDA', metal: 'Metal', vulkan: 'Vulkan', opencl: 'OpenCL', cpu: 'CPU',
}

interface ProfileListProps {
  selectedId: string | null
  onSelect: (p: Profile) => void
  onNewProfile: () => void
  serverRunning: boolean
}

export function ProfileList({ selectedId, onSelect, onNewProfile, serverRunning }: ProfileListProps) {
  const { profiles, loadProfiles, deleteProfile } = useLauncherStore()
  const { setLastProfileId } = useUiPrefsStore()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) renameRef.current?.focus()
  }, [renaming])

  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase())
  )

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await deleteProfile(id)
    if (selectedId === id) onSelect(profiles.find(p => p.id !== id) ?? profiles[0])
  }

  async function handleDuplicate(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await window.electron.launcher.duplicateProfile(id)
    await loadProfiles()
    toast({ title: 'Profile duplicated', variant: 'success' })
  }

  async function handleExport(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const path = await window.electron.launcher.exportProfile(id)
    if (path) toast({ title: 'Profile exported', description: path, variant: 'success' })
  }

  async function handleImport() {
    const profile = await window.electron.launcher.importProfile()
    if (profile) {
      await loadProfiles()
      onSelect(profile)
      toast({ title: 'Profile imported', description: profile.name, variant: 'success' })
    }
  }

  async function commitRename(id: string) {
    const val = renameVal.trim()
    if (val) await window.electron.launcher.updateProfile(id, { name: val })
    await loadProfiles()
    setRenaming(null)
  }

  function handleSelect(p: Profile) {
    onSelect(p)
    setLastProfileId(p.id)
  }

  return (
    <div className="flex flex-col h-full border-r border-border">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Profiles</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleImport} title="Import profile">
              <Upload className="h-3 w-3" aria-hidden />
              <span className="sr-only">Import</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNewProfile} title="New profile">
              <Plus className="h-3 w-3" aria-hidden />
              <span className="sr-only">New profile</span>
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" aria-hidden />
          <input
            className="w-full h-7 pl-6 pr-2 text-xs bg-muted border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Filter profiles…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Filter profiles"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-1.5">
        {profiles.length === 0 ? (
          <EmptyState
            icon={<Play className="h-5 w-5" aria-hidden />}
            title="No profiles yet"
            body="Create one to save your flag configuration."
            action={<Button size="sm" onClick={onNewProfile}>New profile</Button>}
            className="m-2 py-8"
          />
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No matches</p>
        ) : (
          <ul role="list" className="space-y-0.5">
            {filtered.map(p => {
              const isActive = p.id === selectedId
              const backendLabel = BACKEND_LABEL[p.backend?.toLowerCase() ?? ''] ?? p.backend ?? 'CPU'
              return (
                <li key={p.id}>
                  {renaming === p.id ? (
                    <input
                      ref={renameRef}
                      className="w-full h-8 px-2 text-xs bg-muted border border-ring rounded-md focus:outline-none"
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={() => commitRename(p.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(p.id)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(p)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleSelect(p) }}
                      onDoubleClick={() => { setRenaming(p.id); setRenameVal(p.name) }}
                      className={cn(
                        'group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer select-none transition-colors text-xs',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'hover:bg-muted text-foreground/80'
                      )}
                    >
                      {serverRunning && isActive ? (
                        <StatusPill kind="running" size="sm" label=" " className="w-2 px-0 border-0 bg-transparent" />
                      ) : null}
                      <span className="flex-1 truncate font-medium">{p.name}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{backendLabel}</Badge>
                      <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={e => handleDuplicate(e, p.id)}
                          className="p-0.5 rounded hover:bg-muted-foreground/20"
                          title="Duplicate"
                        >
                          <Copy className="h-2.5 w-2.5" aria-hidden />
                          <span className="sr-only">Duplicate</span>
                        </button>
                        <button
                          onClick={e => handleExport(e, p.id)}
                          className="p-0.5 rounded hover:bg-muted-foreground/20"
                          title="Export"
                        >
                          <Download className="h-2.5 w-2.5" aria-hidden />
                          <span className="sr-only">Export</span>
                        </button>
                        <button
                          onClick={e => handleDelete(e, p.id)}
                          className="p-0.5 rounded hover:bg-destructive/10 text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="h-2.5 w-2.5" aria-hidden />
                          <span className="sr-only">Delete</span>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
