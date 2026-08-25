import { cn } from "@/lib/utils"

interface KVRow {
  label: string
  value: React.ReactNode
  mono?: boolean
}

interface KeyValueGridProps {
  rows: KVRow[]
  cols?: 1 | 2 | 3
  className?: string
}

export function KeyValueGrid({ rows, cols = 2, className }: KeyValueGridProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-8 gap-y-3 text-sm",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-3",
        className
      )}
    >
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{row.label}</dt>
          <dd className={cn("text-foreground", row.mono && "font-mono text-xs")}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
