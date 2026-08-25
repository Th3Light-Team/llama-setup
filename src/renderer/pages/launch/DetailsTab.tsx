import { useEffect, useState } from 'react'
import { Trash2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KeyValueGrid } from '@/components/ui/key-value-grid'
import { MonoText } from '@/components/ui/mono-text'
import type { Profile } from '../../../core/launcher/types'

interface ProfileRun {
  id: string
  profile_id: string
  started_at: string
  stopped_at: string | null
  exit_code: number | null
}

interface DetailsTabProps {
  profile: Profile
  onDelete: () => void
}

function formatDuration(startedAt: string, stoppedAt: string | null): string {
  if (!stoppedAt) return 'Running'
  const ms = new Date(stoppedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60000)}m`
}

export function DetailsTab({ profile, onDelete }: DetailsTabProps) {
  const [runs, setRuns] = useState<ProfileRun[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    window.electron.launcher.listRuns(profile.id).then(setRuns).catch(() => setRuns([]))
  }, [profile.id])

  const modifiedFlagCount = Object.entries(profile.flags ?? {}).filter(([, v]) => {
    return v !== undefined && v !== null
  }).length

  return (
    <div className="p-4 space-y-6">
      {/* Profile metadata */}
      <KeyValueGrid
        cols={2}
        rows={[
          { label: 'Name', value: profile.name },
          { label: 'Backend', value: profile.backend ?? 'cpu' },
          { label: 'Created', value: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(profile.created_at)) },
          { label: 'Flags configured', value: String(modifiedFlagCount) },
        ]}
      />

      {profile.description ? (
        <p className="text-sm text-muted-foreground">{profile.description}</p>
      ) : null}

      {/* Recent runs */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent runs</p>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
        ) : (
          <ul className="space-y-1.5" role="list">
            {runs.map(run => (
              <li key={run.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                <MonoText size="xs" dim className="shrink-0">
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(run.started_at))}
                </MonoText>
                <span className="text-muted-foreground">
                  {formatDuration(run.started_at, run.stopped_at)}
                </span>
                {run.exit_code !== null && run.exit_code !== 0 ? (
                  <span className="ml-auto text-status-error">exit {run.exit_code}</span>
                ) : run.stopped_at ? (
                  <span className="ml-auto text-status-ready">ok</span>
                ) : (
                  <span className="ml-auto text-status-running">active</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete */}
      <div className="pt-2 border-t border-border">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground flex-1">Delete &ldquo;{profile.name}&rdquo;? This cannot be undone.</p>
            <Button size="sm" variant="destructive" onClick={onDelete}>Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete profile
          </Button>
        )}
      </div>
    </div>
  )
}
