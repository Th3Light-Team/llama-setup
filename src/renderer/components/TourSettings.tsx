import { Check, RotateCcw, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useUiPrefsStore } from '@/lib/stores/ui-prefs'
import { startTourPart } from '@/lib/tour/manager'
import { TOUR_PARTS } from '@/lib/tour/parts'

/** Settings > Product tour: replay any part, reset progress, toggle automatic tours. */
export function TourSettings() {
  const { toast } = useToast()
  const completed = useUiPrefsStore(s => s.tourCompleted)
  const disabled = useUiPrefsStore(s => s.toursDisabled)
  const setToursDisabled = useUiPrefsStore(s => s.setToursDisabled)
  const resetTours = useUiPrefsStore(s => s.resetTours)

  async function replay(id: string) {
    const started = await startTourPart(id)
    if (!started) {
      toast({ title: 'Could not start the tour', description: 'The page is still loading. Try again.', variant: 'warning' })
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
      {TOUR_PARTS.map((part, i) => {
        const seen = completed.includes(part.id)
        return (
          <div key={part.id} className="flex items-center justify-between gap-6 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                {part.title}
                {seen ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-normal text-status-ready">
                    <Check className="h-3 w-3" aria-hidden /> Seen
                  </span>
                ) : (
                  <span className="text-[10px] font-normal text-muted-foreground">Not seen yet</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {part.summary} ({part.steps.length} steps)
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => replay(part.id)}>
              <Play className="h-3.5 w-3.5" aria-hidden /> Replay
              <span className="sr-only"> {part.title} tour</span>
            </Button>
          </div>
        )
      })}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/20">
        <p className="text-xs text-muted-foreground max-w-sm">
          {disabled
            ? 'Automatic tours are off. Replay any part above or from the ? button.'
            : 'Each part starts once, the first time you open its page.'}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setToursDisabled(!disabled)}
          >
            {disabled ? 'Turn on automatic tours' : 'Turn off automatic tours'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              resetTours()
              toast({ title: 'Tours reset', description: 'Each part will show again the next time you open its page.', variant: 'info' })
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset all
          </Button>
        </div>
      </div>
    </div>
  )
}
