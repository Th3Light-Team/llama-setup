import { cn } from "@/lib/utils"

export type StatusKind =
  | "idle"
  | "scanning"
  | "ready"
  | "downloading"
  | "running"
  | "warning"
  | "error"

const KIND_LABELS: Record<StatusKind, string> = {
  idle: "Idle",
  scanning: "Scanning",
  ready: "Ready",
  downloading: "Downloading",
  running: "Running",
  warning: "Attention",
  error: "Error",
}

const DOT_COLOR: Record<StatusKind, string> = {
  idle: "bg-status-idle",
  scanning: "bg-status-scanning",
  ready: "bg-status-ready",
  downloading: "bg-status-downloading",
  running: "bg-status-running",
  warning: "bg-status-warning",
  error: "bg-status-error",
}

const PULSING: Record<StatusKind, boolean> = {
  idle: false,
  scanning: true,
  ready: false,
  downloading: true,
  running: true,
  warning: false,
  error: false,
}

interface StatusPillProps {
  kind: StatusKind
  label?: string
  className?: string
  size?: "sm" | "md"
}

export function StatusPill({ kind, label, className, size = "md" }: StatusPillProps) {
  return (
    <span
      role="status"
      aria-label={label ?? KIND_LABELS[kind]}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card text-foreground/80 font-medium",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        className
      )}
    >
      <span className="relative inline-flex">
        <span className={cn("inline-block rounded-full", size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2", DOT_COLOR[kind])} />
        {PULSING[kind] ? (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full animate-ping opacity-60",
              DOT_COLOR[kind]
            )}
          />
        ) : null}
      </span>
      {label ?? KIND_LABELS[kind]}
    </span>
  )
}
