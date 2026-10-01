import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, X, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { useLauncherStore, useBinariesStore, useDetectorStore } from '@/lib/stores'
import { useUiPrefsStore } from '@/lib/stores/ui-prefs'
import { useToast } from '@/components/ui/toast'
import { RunTab } from './launch/RunTab'
import { ConfigureTab } from './launch/ConfigureTab'
import { DetailsTab } from './launch/DetailsTab'
import { cn } from '@/lib/utils'
import type { Profile, FlagValues } from '../../core/launcher/types'

type Tab = 'run' | 'configure' | 'details'

const TABS: { id: Tab; label: string }[] = [
  { id: 'run', label: 'Run' },
  { id: 'configure', label: 'Configure' },
  { id: 'details', label: 'Details' },
]

const BACKEND_COLOR: Record<string, string> = {
  cuda: 'text-green-600 dark:text-green-400',
  metal: 'text-purple-600 dark:text-purple-400',
  vulkan: 'text-orange-600 dark:text-orange-400',
  cpu: 'text-muted-foreground',
}

export default function LaunchPage() {
  const profiles = useLauncherStore(s => s.profiles)
  const serverStatus = useLauncherStore(s => s.serverStatus)

  const { fetchInstalled } = useBinariesStore()
  const { detect } = useDetectorStore()
  const { lastProfileId, setLastProfileId } = useUiPrefsStore()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()

  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null)
  const [localFlags, setLocalFlags] = useState<FlagValues>({})
  const [dirty, setDirty] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('run')

  // Inline create state
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const newNameRef = useRef<HTMLInputElement>(null)

  // Boot
  useEffect(() => {
    useLauncherStore.getState().init()
    fetchInstalled()
    detect()
  }, [])

  useEffect(() => {
    if (isCreating) newNameRef.current?.focus()
  }, [isCreating])

  // Auto-select when profiles load
  useEffect(() => {
    if (profiles.length === 0 || selectedProfile) return
    const target = profiles.find(p => p.id === lastProfileId) ?? profiles[0]
    selectProfile(target)
  }, [profiles])

  // Pre-fill model from library navigation.  Re-applies whenever the active
  // profile changes so selectProfile() (which overwrites flag values) doesn't
  // wipe the path we were just handed in the URL.
  useEffect(() => {
    const modelPath = searchParams.get('modelPath')
    if (!modelPath || !selectedProfile) return
    useLauncherStore.getState().setFlagValue('model', modelPath)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- must re-apply URL model path after selectProfile() resets flags
    setLocalFlags(prev => ({ ...prev, model: modelPath }))
    setDirty(true)
    toast({
      title: 'Model loaded from Library',
      description: 'Save the profile to keep this model path.',
      variant: 'info',
    })
  }, [searchParams, selectedProfile?.id])

  function selectProfile(p: Profile) {
    setSelectedProfile(p)
    setLocalFlags({ ...p.flags })
    setDirty(false)
    setLastProfileId(p.id)
    useLauncherStore.getState().loadProfile(p)
  }

  function handleFlagChange(key: string, value: unknown) {
    setLocalFlags(prev => ({ ...prev, [key]: value }))
    useLauncherStore.getState().setFlagValue(key, value)
    setDirty(true)
  }

  async function handleReset() {
    await useLauncherStore.getState().resetFlags()
    if (selectedProfile) setLocalFlags({ ...selectedProfile.flags })
    setDirty(false)
  }

  async function handleSave() {
    if (!selectedProfile) return
    await useLauncherStore.getState().updateProfile(selectedProfile.id, localFlags)
    toast({ title: 'Profile saved', variant: 'success' })
    setDirty(false)
  }

  async function handleDelete() {
    if (!selectedProfile) return
    await useLauncherStore.getState().deleteProfile(selectedProfile.id)
    setSelectedProfile(null)
    setLocalFlags({})
    setDirty(false)
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const { installed } = useBinariesStore.getState()
    const backend = installed[0]?.backend ?? 'cpu'
    await useLauncherStore.getState().createProfile(name, '', backend)
    setNewName('')
    setIsCreating(false)
    const fresh = useLauncherStore.getState().profiles
    const newest = fresh[fresh.length - 1]
    if (newest) selectProfile(newest)
  }

  const isRunning = serverStatus.state === 'running' || serverStatus.state === 'starting'

  const statusKind = serverStatus.state === 'running' ? 'running'
    : serverStatus.state === 'starting' ? 'scanning'
    : serverStatus.state === 'error' ? 'error'
    : 'idle'

  return (
    <div className="h-full flex flex-col">
      {/* Page header */}
      <div className="shrink-0 pb-4">
        <PageHeader
          title="Launch Pad"
          subtitle="Configure flags, manage profiles, and start your llama.cpp server"
        />
      </div>

      {/* Profile strip */}
      <div className="shrink-0 flex items-center gap-1 pb-3 overflow-x-auto scrollbar-none">
        {profiles.map(p => {
          const isActive = p.id === selectedProfile?.id
          const backendColor = BACKEND_COLOR[p.backend?.toLowerCase() ?? ''] ?? 'text-muted-foreground'
          return (
            <button
              key={p.id}
              onClick={() => selectProfile(p)}
              className={cn(
                'relative flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all whitespace-nowrap shrink-0',
                isActive
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background text-foreground border-border hover:border-foreground/40 hover:bg-muted'
              )}
            >
              {isRunning && isActive ? (
                <span className="h-1.5 w-1.5 rounded-full bg-status-running animate-pulse shrink-0" aria-hidden />
              ) : null}
              <span>{p.name}</span>
              <span className={cn('text-[10px] font-normal uppercase', isActive ? 'opacity-60' : backendColor)}>
                {p.backend ?? 'cpu'}
              </span>
              {dirty && isActive ? (
                <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" aria-label="Unsaved changes" />
              ) : null}
            </button>
          )
        })}

        {/* Inline create */}
        {isCreating ? (
          <div className="flex items-center gap-1 shrink-0">
            <input
              ref={newNameRef}
              className="h-8 px-3 text-sm bg-muted border border-ring rounded-full focus:outline-none w-36"
              placeholder="Profile name…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setIsCreating(false); setNewName('') }
              }}
            />
            <Button
              size="sm"
              className="h-8 rounded-full px-3 bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={handleCreate}
            >
              Create
            </Button>
            <button
              onClick={() => { setIsCreating(false); setNewName('') }}
              className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCreating(true)}
            className="h-8 w-8 flex items-center justify-center rounded-full border border-dashed border-border hover:border-foreground/40 hover:bg-muted text-muted-foreground shrink-0 transition-colors"
            aria-label="New profile"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* Main content */}
      {selectedProfile ? (
        <div className="flex flex-1 min-h-0 rounded-xl border border-border overflow-hidden">
          {/* Left meta panel */}
          <div className="w-44 shrink-0 flex flex-col border-r border-border bg-muted/20">
            {/* Profile identity */}
            <div className="p-4 border-b border-border">
              <p className="text-sm font-semibold truncate leading-tight">{selectedProfile.name}</p>
              <p className={cn('text-xs mt-1 font-mono uppercase', BACKEND_COLOR[selectedProfile.backend?.toLowerCase() ?? ''] ?? 'text-muted-foreground')}>
                {selectedProfile.backend ?? 'cpu'}
              </p>
            </div>

            {/* Server status */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Status</p>
              <StatusPill kind={statusKind} label={
                serverStatus.state === 'running' ? `Port ${serverStatus.port}` :
                serverStatus.state === 'starting' ? 'Starting…' :
                serverStatus.state === 'error' ? 'Error' :
                'Stopped'
              } />
            </div>

            {/* Tab nav */}
            <nav className="flex flex-col p-2 gap-0.5 flex-1">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left',
                    activeTab === tab.id
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <span>{tab.label}</span>
                  <span className="flex items-center gap-1">
                    {tab.id === 'configure' && dirty ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Unsaved" />
                    ) : null}
                    {activeTab === tab.id ? (
                      <ChevronRight className="h-3 w-3 opacity-50" aria-hidden />
                    ) : null}
                  </span>
                </button>
              ))}
            </nav>

            {/* Unsaved hint */}
            {dirty ? (
              <div className="px-4 py-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground leading-snug">Unsaved changes</p>
              </div>
            ) : null}
          </div>

          {/* Right content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === 'run' && (
              <RunTab key={selectedProfile.id} profile={selectedProfile} />
            )}
            {activeTab === 'configure' && (
              <ConfigureTab
                key={selectedProfile.id}
                flagValues={localFlags}
                onFlagChange={handleFlagChange}
                onReset={handleReset}
                onSave={handleSave}
                dirty={dirty}
              />
            )}
            {activeTab === 'details' && (
              <DetailsTab
                key={selectedProfile.id}
                profile={selectedProfile}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-border">
          <div className="text-center space-y-4 max-w-xs">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Plus className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold">No profile yet</p>
              <p className="text-sm text-muted-foreground">
                Create a profile to save your flag configuration and launch your server.
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => setIsCreating(true)}
            >
              <Plus className="h-4 w-4" aria-hidden /> New profile
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
