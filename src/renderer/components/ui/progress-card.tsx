import { X, RotateCcw, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

type ProgressCardState = "active" | "error" | "done"

interface ProgressCardProps {
  title: string
  subtitle?: string
  percent?: number
  state?: ProgressCardState
  errorMessage?: string
  onCancel?: () => void
  onRetry?: () => void
  className?: string
}

export function ProgressCard({
  title,
  subtitle,
  percent = 0,
  state = "active",
  errorMessage,
  onCancel,
  onRetry,
  className,
}: ProgressCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4",
        state === "error" && "border-destructive/40 bg-destructive/5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-card-foreground truncate">{title}</p>
          {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground truncate">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {state === "error" && onRetry ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onRetry}
              aria-label="Retry"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {state === "active" && onCancel ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={onCancel}
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {state === "error" ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{errorMessage ?? "An error occurred"}</span>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <Progress
            value={state === "done" ? 100 : percent}
            className="h-1.5"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{state === "done" ? "Complete" : `${Math.round(percent)}%`}</span>
          </div>
        </div>
      )}
    </div>
  )
}
