import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useDetectorStore } from '@/lib/stores'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export default function HardwareBadge() {
  const { result, isLoading, error, detect } = useDetectorStore()

  useEffect(() => {
    detect()
  }, [detect])

  if (isLoading) {
    return (
      <Badge variant="outline" className="w-full justify-center text-xs py-1.5 flex gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
      </Badge>
    )
  }

  if (error) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="destructive" className="w-full justify-center text-xs py-1.5 flex gap-1 cursor-pointer">
              <AlertTriangle className="w-3 h-3" /> Error
            </Badge>
          </TooltipTrigger>
          <TooltipContent><p>{error}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  if (!result || !result.backends) return null

  const bestBackend = result.backends.find(b => b.available)
  if (!bestBackend) return null

  const vramText = result.vram ? `· ${Math.round(result.vram.totalMB / 1024)} GB VRAM` : '· VRAM Unknown'
  
  const icon = bestBackend.confidence === 'confirmed' ? <CheckCircle2 className="w-3 h-3 text-status-ready" /> :
               bestBackend.confidence === 'likely' ? <HelpCircle className="w-3 h-3 text-status-warning" /> :
               <AlertTriangle className="w-3 h-3 text-status-warning" />

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className="w-full justify-center text-xs py-1.5 flex gap-1.5 cursor-pointer">
            {icon}
            <span className="truncate max-w-[150px]">
              {bestBackend.id.toUpperCase()} {bestBackend.version ? bestBackend.version : ''} {bestBackend.id !== 'cpu' ? vramText : ''}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[250px]">
          <div className="space-y-2">
            <p className="font-semibold">{bestBackend.id.toUpperCase()} Backend</p>
            <p className="text-xs text-muted-foreground">{bestBackend.reason}</p>
            {bestBackend.warnings.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-status-warning mb-1">Warnings:</p>
                <ul className="text-xs space-y-1 list-disc list-inside text-muted-foreground">
                  {bestBackend.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            <div className="pt-2 border-t border-border/50 text-[10px] text-muted-foreground flex justify-between">
              <span>{result.os} {result.arch}</span>
              <button onClick={() => detect(true)} className="hover:text-foreground underline">Re-detect</button>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
