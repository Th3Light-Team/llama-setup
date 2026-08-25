import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import logoMark from '@/assets/brand/logo-mark.svg'
import Step1Welcome from './Step1Welcome'
import Step2SystemCheck from './Step2SystemCheck'
import Step3FindInstalls from './Step3FindInstalls'
import Step4PickBinary from './Step4PickBinary'
import Step5PickModel from './Step5PickModel'
import Step6Done from './Step6Done'

const STEPS = [
  { id: '1', label: 'Welcome' },
  { id: '2', label: 'System check' },
  { id: '3', label: 'Find installs' },
  { id: '4', label: 'Install binary' },
  { id: '5', label: 'Starter model' },
  { id: '6', label: 'Ready' },
]

export default function OnboardingShell() {
  const { step } = useParams()
  const navigate = useNavigate()
  const [skipped, setSkipped] = useState<string[]>([])

  const current = parseInt(step ?? '1', 10)

  useEffect(() => {
    if (!step) navigate('/onboarding/1', { replace: true })
  }, [step])

  function goNext() {
    if (current < STEPS.length) navigate(`/onboarding/${current + 1}`)
  }

  function goBack() {
    if (current > 1) navigate(`/onboarding/${current - 1}`)
  }

  function skipStep() {
    setSkipped(s => [...s, String(current)])
    goNext()
  }

  async function finish() {
    await window.electron.app.setOnboardingState({
      completedAt: new Date().toISOString(),
      skippedSteps: skipped,
      version: '1',
    })
    // Step 6's "Open Launch Pad" button calls this — land users in /launch
    // when they're completing the wizard.  Earlier steps' close-X also calls
    // this but the destination is just where to drop them; /launch is the
    // sensible next-action page for both.
    navigate('/launch', { replace: true })
  }

  const stepProps = { onNext: goNext, onSkip: skipStep, onFinish: finish }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <img src={logoMark} alt="llama-studio" className="h-7 w-7" />
          <span className="text-sm font-semibold text-foreground">Setup wizard</span>
        </div>
        <div className="flex items-center gap-6">
          <ol className="hidden sm:flex items-center gap-1" aria-label="Setup steps">
            {STEPS.map((s, i) => {
              const idx = i + 1
              const done = idx < current
              const active = idx === current
              return (
                <li key={s.id} className="flex items-center gap-1">
                  <span
                    className={[
                      "h-5 w-5 rounded-full text-[10px] font-semibold flex items-center justify-center transition-colors",
                      done ? "bg-brand text-brand-foreground" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
                    ].join(' ')}
                    aria-current={active ? 'step' : undefined}
                  >
                    {done ? '✓' : idx}
                  </span>
                  {i < STEPS.length - 1 ? (
                    <span className="h-px w-4 bg-border" aria-hidden />
                  ) : null}
                </li>
              )
            })}
          </ol>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={finish} aria-label="Exit setup">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 max-w-2xl mx-auto w-full">
        {current === 1 && <Step1Welcome {...stepProps} />}
        {current === 2 && <Step2SystemCheck {...stepProps} />}
        {current === 3 && <Step3FindInstalls {...stepProps} />}
        {current === 4 && <Step4PickBinary {...stepProps} />}
        {current === 5 && <Step5PickModel {...stepProps} />}
        {current === 6 && <Step6Done {...stepProps} />}
      </main>

      <footer className="flex items-center justify-between px-8 py-4 border-t border-border">
        {current > 1 ? (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={goBack}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back
          </Button>
        ) : <span />}
        <span className="text-xs text-muted-foreground">
          Step {current} of {STEPS.length}
        </span>
      </footer>
    </div>
  )
}
