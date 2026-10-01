import { useLocation, useNavigate } from 'react-router-dom'
import { Check, CircleHelp, Compass, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useUiPrefsStore } from '@/lib/stores/ui-prefs'
import { startTourPart } from '@/lib/tour/manager'
import { partForPageMenu } from '@/lib/tour/logic'
import { TOUR_PARTS } from '@/lib/tour/parts'

/** The `?` button in the sidebar header: replay the tour for this page or pick any tour. */
export function TourHelpMenu() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const completed = useUiPrefsStore(s => s.tourCompleted)
  const { part: pagePart, exact } = partForPageMenu(pathname)

  async function run(id: string) {
    const started = await startTourPart(id)
    if (!started) {
      toast({
        title: 'Could not start the tour',
        description: 'This page is still loading. Try again in a moment.',
        variant: 'warning',
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            data-tour="help-button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            title="Help and product tours"
          >
            <CircleHelp className="h-4 w-4" aria-hidden />
            <span className="sr-only">Help and product tours</span>
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => run(pagePart.id)}>
          <Compass className="h-3.5 w-3.5 text-brand" aria-hidden />
          <div className="flex flex-col">
            <span>Tour this page</span>
            <span className="text-[10px] text-muted-foreground">
              {exact ? pagePart.title : 'No page tour here: app overview'}
            </span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>All tours</DropdownMenuLabel>
        {TOUR_PARTS.map((part, i) => (
          <DropdownMenuItem key={part.id} onClick={() => run(part.id)}>
            <span className="w-3.5 shrink-0">
              {completed.includes(part.id) ? <Check className="h-3.5 w-3.5 text-status-ready" aria-label="Seen" /> : null}
            </span>
            <span>{i + 1}. {part.title}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/settings')}>
          <Settings className="h-3.5 w-3.5" aria-hidden />
          <span>Tour settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
