import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cpu, Download, Library, Play, ArrowRight, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill, type StatusKind } from '@/components/ui/status-pill'
import { Button } from '@/components/ui/button'
import { useDetectorStore } from '@/lib/stores'
import { useBinariesStore } from '@/lib/stores'
import { useUiPrefsStore } from '@/lib/stores/ui-prefs'
import { cn } from '@/lib/utils'

interface SummaryCardProps {
  icon: React.ReactNode
  title: string
  summary: string
  status: StatusKind
  cta: string
  to: string
  warn?: string
}

function SummaryCard({ icon, title, summary, status, cta, to, warn }: SummaryCardProps) {
  const navigate = useNavigate()
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 hover:border-brand/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          {icon}
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        <StatusPill kind={status} size="sm" />
      </div>
      <p className="text-sm text-muted-foreground flex-1">{summary}</p>
      {warn ? (
        <div className="flex items-center gap-1.5 text-xs text-status-warning">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {warn}
        </div>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="self-start gap-1.5"
        onClick={() => navigate(to)}
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { result: hw, detect } = useDetectorStore()
  const { installed, fetchInstalled } = useBinariesStore()
  const { lastProfileId } = useUiPrefsStore()

  useEffect(() => {
    detect()
    fetchInstalled()
  }, [])

  const recommended = hw?.backends?.find(b => hw.recommendedAsset.toLowerCase().includes(b.id))
  const hwStatus: StatusKind = hw ? (recommended ? 'ready' : 'warning') : 'scanning'
  const binStatus: StatusKind = installed.length > 0 ? 'ready' : 'idle'

  return (
    <div className="h-full overflow-y-auto max-w-3xl">
      <PageHeader
        title="Welcome to llama-studio"
        subtitle="Your runtime manager for llama.cpp"
        actions={
          <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => navigate('/launch')}>
            Open Launch Pad
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4">
        <SummaryCard
          icon={<Cpu className="h-4 w-4" aria-hidden />}
          title="Hardware"
          status={hwStatus}
          summary={
            hw
              ? `${hw.vram?.gpus?.[0]?.name ?? hw.system?.cpu?.brand ?? 'System detected'} — ${recommended?.id ?? 'CPU'} recommended`
              : 'Scanning your system…'
          }
          cta="View details"
          to="/hardware"
        />
        <SummaryCard
          icon={<Download className="h-4 w-4" aria-hidden />}
          title="Binaries"
          status={binStatus}
          summary={
            installed.length > 0
              ? `${installed.length} install${installed.length > 1 ? 's' : ''} ready`
              : 'No llama.cpp binary installed yet'
          }
          cta={installed.length > 0 ? 'Manage' : 'Install now'}
          to="/binaries"
        />
        <SummaryCard
          icon={<Library className="h-4 w-4" aria-hidden />}
          title="Models"
          status="idle"
          summary="Browse your downloaded models or pull from Hugging Face"
          cta="Open library"
          to="/library"
        />
        <SummaryCard
          icon={<Play className="h-4 w-4" aria-hidden />}
          title="Launch Pad"
          status={lastProfileId ? 'ready' : 'idle'}
          summary={lastProfileId ? 'Resume your last profile' : 'Create a profile and start a server'}
          cta="Go to Launch"
          to="/launch"
        />
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-border bg-muted/30 px-5 py-4">
        <p className="text-xs text-muted-foreground">
          First time here?{' '}
          <button
            className={cn("underline underline-offset-4 hover:text-foreground transition-colors")}
            onClick={() => navigate('/onboarding')}
          >
            Run the guided setup
          </button>
          {' '}to detect your hardware, install a binary, and download a starter model.
        </p>
      </div>
    </div>
  )
}
