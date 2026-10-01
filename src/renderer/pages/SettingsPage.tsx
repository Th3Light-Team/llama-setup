import { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, Monitor, Sun, Moon, AlignJustify, AlignCenter, FolderPlus, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { MonoText } from '@/components/ui/mono-text'
import { useUiPrefsStore, type DensityMode, type ThemeMode } from '@/lib/stores/ui-prefs'
import { useToast } from '@/components/ui/toast'
import { TourSettings } from '@/components/TourSettings'
import { cn } from '@/lib/utils'

type LicensePolicy = 'unrestricted' | 'standard' | 'strict'

interface AppSettings {
  modelsDir: string
  extraModelsDirs: string[]
  binariesDir: string
  licensePolicy: LicensePolicy
  telemetry: boolean
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3.5 border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function IconToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; icon: React.ReactNode; label: string }[]
}) {
  return (
    <div className="flex items-center rounded-lg border border-border overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          title={opt.label}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors',
            value === opt.value
              ? 'bg-foreground text-background'
              : 'bg-background text-muted-foreground hover:text-foreground hover:bg-muted'
          )}
        >
          {opt.icon}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const { toast } = useToast()
  const { theme, density, setTheme, setDensity } = useUiPrefsStore()
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    window.electron.app.getSettings().then(setSettings)
  }, [])

  async function patchSettings(patch: Partial<AppSettings>) {
    try {
      await window.electron.app.setSettings(patch)
      setSettings(prev => prev ? { ...prev, ...patch } : null)
      toast({ title: 'Settings saved', variant: 'success' })
    } catch {
      toast({ title: 'Failed to save settings', variant: 'error' })
    }
  }

  async function handleReveal(path: string) {
    await window.electron.library.reveal(path)
  }

  async function handleResetOnboarding() {
    await window.electron.app.resetOnboarding()
    toast({ title: 'Onboarding reset', description: 'Restart the app to run the setup wizard again.', variant: 'info' })
  }

  async function handleAddFolder() {
    const picked = await window.electron.app.pickFolder({ title: 'Add a model folder' })
    if (!picked) return
    try {
      await window.electron.library.addFolder(picked)
      const fresh = await window.electron.app.getSettings()
      setSettings(fresh as AppSettings)
      toast({ title: 'Folder added', description: picked, variant: 'success' })
    } catch (err: any) {
      toast({ title: 'Could not add folder', description: err?.message, variant: 'error' })
    }
  }

  async function handleRemoveFolder(folderPath: string) {
    try {
      await window.electron.library.removeFolder(folderPath)
      const fresh = await window.electron.app.getSettings()
      setSettings(fresh as AppSettings)
      toast({ title: 'Folder removed', variant: 'info' })
    } catch (err: any) {
      toast({ title: 'Could not remove folder', description: err?.message, variant: 'error' })
    }
  }

  const LICENSE_OPTIONS: { value: LicensePolicy; label: string; description: string }[] = [
    { value: 'unrestricted', label: 'Unrestricted', description: 'Allow any license' },
    { value: 'standard', label: 'Standard', description: 'MIT, Apache, BSD, GPL — blocks proprietary' },
    { value: 'strict', label: 'Strict', description: 'MIT, Apache, BSD only — enterprise-safe' },
  ]

  return (
    // Scroll the full pane width — the scrollbar belongs at the right edge of
    // the main area, not at the right edge of the max-w-2xl content column.
    // Inner wrapper handles the readable width constraint.
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl space-y-10 pb-8">
      <PageHeader title="Settings" subtitle="Appearance, paths, compliance, and advanced options" />

      {/* Appearance */}
      <section>
        <SectionHeading title="Appearance" />
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <SettingRow label="Theme" description="Choose light, dark, or follow system preference.">
            <IconToggleGroup
              value={theme}
              onChange={(v: ThemeMode) => setTheme(v)}
              options={[
                { value: 'system', icon: <Monitor className="h-3.5 w-3.5" aria-hidden />, label: 'System' },
                { value: 'light', icon: <Sun className="h-3.5 w-3.5" aria-hidden />, label: 'Light' },
                { value: 'dark', icon: <Moon className="h-3.5 w-3.5" aria-hidden />, label: 'Dark' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Density" description="Comfortable for more breathing room; compact for denser information.">
            <IconToggleGroup
              value={density}
              onChange={(v: DensityMode) => setDensity(v)}
              options={[
                { value: 'comfortable', icon: <AlignCenter className="h-3.5 w-3.5" aria-hidden />, label: 'Comfortable' },
                { value: 'compact', icon: <AlignJustify className="h-3.5 w-3.5" aria-hidden />, label: 'Compact' },
              ]}
            />
          </SettingRow>
        </div>
      </section>

      {/* Paths */}
      <section>
        <SectionHeading title="Paths" description="Where llama-studio stores models and binaries on your machine." />
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <SettingRow label="Default models folder" description="New downloads from the Registry are saved here. Also scanned by the Library.">
            <div className="flex items-center gap-2">
              <MonoText size="xs" dim className="max-w-48 truncate block">{settings?.modelsDir ?? '…'}</MonoText>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => settings && handleReveal(settings.modelsDir)} title="Reveal in explorer">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Reveal in explorer</span>
              </Button>
            </div>
          </SettingRow>

          <div className="py-3.5 border-b border-border last:border-0 space-y-2.5">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Additional model folders</p>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                  Read-only sources the Library also scans. Useful for models stored on another drive.
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleAddFolder}>
                <FolderPlus className="h-3.5 w-3.5" aria-hidden /> Add folder…
              </Button>
            </div>

            {(settings?.extraModelsDirs?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground italic pl-0.5">No extra folders configured.</p>
            ) : (
              <ul className="space-y-1.5" role="list">
                {settings!.extraModelsDirs.map(path => (
                  <li
                    key={path}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 pl-2.5 pr-1 py-1.5"
                  >
                    <MonoText size="xs" dim className="flex-1 truncate block" title={path}>{path}</MonoText>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleReveal(path)} title="Reveal in explorer">
                      <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">Reveal</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveFolder(path)}
                      title="Remove from scan list"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <SettingRow label="Binaries directory" description="Installed llama.cpp builds are stored here.">
            <div className="flex items-center gap-2">
              <MonoText size="xs" dim className="max-w-48 truncate block">{settings?.binariesDir ?? '…'}</MonoText>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => settings && handleReveal(settings.binariesDir)} title="Reveal in explorer">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Reveal in explorer</span>
              </Button>
            </div>
          </SettingRow>
        </div>
      </section>

      {/* Compliance */}
      <section>
        <SectionHeading title="License compliance" description="Controls which model licenses are allowed when downloading from the Registry." />
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          {LICENSE_OPTIONS.map(opt => (
            <label
              key={opt.value}
              className={cn(
                'flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors',
                settings?.licensePolicy === opt.value ? 'bg-brand-muted' : 'hover:bg-muted/40'
              )}
            >
              <input
                type="radio"
                name="licensePolicy"
                value={opt.value}
                checked={settings?.licensePolicy === opt.value}
                onChange={() => patchSettings({ licensePolicy: opt.value })}
                className="mt-0.5 accent-[--accent-brand]"
              />
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Privacy */}
      <section>
        <SectionHeading title="Privacy" />
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <SettingRow label="Usage telemetry" description="Share anonymous usage data to help improve llama-studio. Off by default.">
            <button
              role="switch"
              aria-checked={!!settings?.telemetry}
              onClick={() => settings && patchSettings({ telemetry: !settings.telemetry })}
              className={cn(
                'h-5 w-9 rounded-full transition-colors relative',
                settings?.telemetry ? 'bg-brand' : 'bg-muted-foreground/20'
              )}
            >
              <span className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                settings?.telemetry ? 'translate-x-4' : 'translate-x-0.5'
              )} />
            </button>
          </SettingRow>
        </div>
      </section>

      {/* Product tour */}
      <section id="product-tour">
        <SectionHeading title="Product tour" description="Short guided tours, one per page. Replay any of them whenever you like." />
        <TourSettings />
      </section>

      {/* Advanced */}
      <section>
        <SectionHeading title="Advanced" />
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <SettingRow label="Setup wizard" description="Re-run the first-time onboarding experience.">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleResetOnboarding}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Reset onboarding
            </Button>
          </SettingRow>
        </div>
      </section>

      </div>
    </div>
  )
}
