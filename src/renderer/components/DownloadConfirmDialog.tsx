import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertTriangle, ShieldQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PreflightResult {
  diskOk: boolean
  diskAvailableGB: number | null
  diskRequiredGB: number
  licenseOk: boolean
  licenseBlocked?: string
  compatibilityWarnings: string[]
  vramWarning?: string
  authorVerified: boolean
  sha256Available: boolean
}

export interface DownloadConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  sizeMB: number
  preflight: PreflightResult
  onConfirm: () => void
}

function formatGB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function Row({ ok, label, value }: { ok?: boolean; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-xs flex items-center gap-1', ok === false ? 'text-status-error' : ok === true ? 'text-status-ready' : 'text-foreground')}>
        {ok === true && <CheckCircle2 className="h-3 w-3" aria-hidden />}
        {ok === false && <AlertTriangle className="h-3 w-3" aria-hidden />}
        {value}
      </span>
    </div>
  )
}

export function DownloadConfirmDialog({ open, onOpenChange, title, subtitle, sizeMB, preflight, onConfirm }: DownloadConfirmProps) {
  const blocked = !preflight.diskOk || !preflight.licenseOk

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-0 shadow-xl">
          <div className="p-4 border-b border-border">
            <DialogPrimitive.Title className="font-heading text-base font-medium">Download {title}</DialogPrimitive.Title>
            {subtitle && <DialogPrimitive.Description className="text-xs text-muted-foreground mt-0.5">{subtitle}</DialogPrimitive.Description>}
          </div>

          <div className="p-4 flex flex-col">
            <Row label="Size" value={formatGB(sizeMB)} />
            <Row
              ok={preflight.diskOk}
              label="Disk space"
              value={preflight.diskAvailableGB !== null
                ? `${preflight.diskAvailableGB.toFixed(1)} GB free, ${preflight.diskRequiredGB.toFixed(1)} GB needed`
                : 'Unknown'}
            />
            <Row
              ok={preflight.licenseOk}
              label="License"
              value={preflight.licenseOk ? 'Allowed' : (preflight.licenseBlocked ?? 'Blocked')}
            />
            <Row
              label="Author"
              value={preflight.authorVerified
                ? <Badge variant="outline" className="h-4 text-[9px] px-1.5">Verified</Badge>
                : <span className="text-muted-foreground">Unverified</span>}
            />
            <Row
              label="Checksum"
              value={preflight.sha256Available
                ? 'Will verify SHA256 after download'
                : <span className="text-muted-foreground flex items-center gap-1"><ShieldQuestion className="h-3 w-3" aria-hidden /> Unverified (no SHA256 available)</span>}
            />
            {preflight.vramWarning && (
              <div className="mt-2 text-xs text-status-warning flex items-start gap-1.5">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
                <span>{preflight.vramWarning}</span>
              </div>
            )}
            {preflight.compatibilityWarnings.length > 0 && (
              <div className="mt-2 text-xs text-status-warning flex flex-col gap-1">
                {preflight.compatibilityWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-border flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="default"
              size="sm"
              disabled={blocked}
              onClick={() => { onConfirm(); onOpenChange(false) }}
            >
              Download
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
