import { cn } from "@/lib/utils"

interface MonoTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode
  size?: "xs" | "sm" | "base"
  dim?: boolean
  wrap?: boolean
}

export function MonoText({ children, size = "sm", dim, wrap, className, ...props }: MonoTextProps) {
  return (
    <span
      className={cn(
        "font-mono",
        size === "xs" && "text-xs",
        size === "sm" && "text-sm",
        size === "base" && "text-base",
        dim && "text-muted-foreground",
        !wrap && "truncate",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
