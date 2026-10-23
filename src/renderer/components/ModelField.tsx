import { useEffect, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { ChevronDown, FolderOpen, Maximize2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FlagDef } from '../../core/launcher/types'

export interface LibraryModel {
  modelId: string
  filename: string
  path: string
  sizeMb: number
  folderPath: string
  isDefaultFolder: boolean
}

/** How many rows the inline dropdown shows before pointing at the expanded dialog. */
const INLINE_LIMIT = 8

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

function formatSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`
}

/** Every whitespace-separated term must appear somewhere in filename, repo or folder. */
function filterModels(models: LibraryModel[], query: string): LibraryModel[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return models
  return models.filter(m => {
    const haystack = `${m.filename} ${m.modelId} ${m.folderPath}`.toLowerCase()
    return terms.every(t => haystack.includes(t))
  })
}

function ModelList({ models, selected, onPick, className }: {
  models: LibraryModel[]
  selected: string
  onPick: (path: string) => void
  className?: string
}) {
  return (
    <ul role="listbox" aria-label="Models" className={cn('divide-y divide-border/60 overflow-y-auto', className)}>
      {models.map(m => (
        <li key={m.path}>
          <button
            type="button"
            role="option"
            aria-selected={m.path === selected}
            onClick={() => onPick(m.path)}
            title={m.path}
            className={cn(
              'w-full text-left px-3 py-2 outline-none hover:bg-muted/60 focus-visible:bg-muted/60',
              m.path === selected && 'bg-brand/10'
            )}
          >
            <div className="text-xs font-mono font-medium truncate">{m.filename}</div>
            <div className="text-[10px] text-muted-foreground truncate">
              {m.modelId} · {formatSize(m.sizeMb)} · {basename(m.folderPath)}
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Model Path picker for the `-m` flag. Replaces the bare text input: choose from
 * the library with a filter, expand to a larger dialog when there are many models,
 * browse for a file outside the library, or type a path as a last resort.
 */
export function ModelField({ def, value, onChange, isDefault }: {
  def: FlagDef
  value: string
  onChange: (v: string) => void
  isDefault: boolean
}) {
  const [models, setModels] = useState<LibraryModel[]>([])
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [manual, setManual] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  function refresh() {
    window.electron.library.list().then(setModels).catch(() => setModels([]))
  }

  useEffect(() => { refresh() }, [])

  // Close the inline dropdown on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggleOpen() {
    if (!open) { refresh(); setQuery('') }
    setOpen(!open)
  }

  function expand() {
    setOpen(false)
    refresh()
    setExpanded(true)
  }

  function pick(path: string) {
    onChange(path)
    setOpen(false)
    setExpanded(false)
  }

  async function browse() {
    const picked = await window.electron.library.pickFile()
    if (picked) pick(picked)
  }

  const filtered = filterModels(models, query)
  const inlineRows = filtered.slice(0, INLINE_LIMIT)
  const hiddenCount = filtered.length - inlineRows.length

  return (
    <div className="py-2.5 border-b border-border/60 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium">{def.label}</span>
        <code className="text-[9px] text-muted-foreground font-mono bg-muted px-1 rounded">{def.flag}</code>
        {!isDefault && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-label="Modified" />}
      </div>
      <p className="text-[11px] text-muted-foreground mb-1.5">{def.description}</p>

      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={toggleOpen}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={value || undefined}
          className="w-full h-8 px-2 flex items-center justify-between gap-2 text-xs font-mono bg-muted border border-border rounded-md hover:border-brand/50"
        >
          <span className="truncate">
            {value ? basename(value) : <span className="text-muted-foreground">Choose a model…</span>}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center gap-1.5 p-2 border-b border-border">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && filtered[0]) pick(filtered[0].path) }}
                  placeholder={`Filter ${models.length} model${models.length === 1 ? '' : 's'}…`}
                  aria-label="Filter models"
                  className="w-full h-7 pl-7 pr-2 text-xs bg-muted border border-border rounded-md"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={expand} aria-label="Expand list">
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>

            {inlineRows.length > 0 ? (
              <ModelList models={inlineRows} selected={value} onPick={pick} className="max-h-64" />
            ) : (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                {models.length === 0 ? 'No models in your library yet.' : 'No model matches that filter.'}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 p-2 border-t border-border text-[11px] text-muted-foreground">
              <button type="button" onClick={browse} className="flex items-center gap-1 hover:text-foreground">
                <FolderOpen className="h-3 w-3" aria-hidden /> Browse file…
              </button>
              {hiddenCount > 0 ? (
                <button type="button" onClick={expand} className="hover:text-foreground">
                  +{hiddenCount} more — expand
                </button>
              ) : (
                <span>{filtered.length} of {models.length}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <DialogPrimitive.Root open={expanded} onOpenChange={setExpanded}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 supports-backdrop-filter:backdrop-blur-xs data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150" />
          <DialogPrimitive.Popup
            className={cn(
              'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[80vh] flex flex-col',
              'rounded-xl border border-border bg-popover text-popover-foreground shadow-xl',
              'data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150'
            )}
          >
            <div className="flex items-start justify-between p-5 border-b border-border">
              <div>
                <DialogPrimitive.Title className="text-base font-semibold">Choose a model</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted-foreground mt-0.5">
                  {models.length} in your library · the path goes into {def.flag}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                render={
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <X className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Close</span>
                  </Button>
                }
              />
            </div>

            <div className="p-4 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && filtered[0]) pick(filtered[0].path) }}
                  placeholder="Filter by name, repo or folder…"
                  aria-label="Filter models"
                  className="w-full h-9 pl-8 pr-2 text-sm bg-muted border border-border rounded-md"
                />
              </div>
            </div>

            {filtered.length > 0 ? (
              <ModelList models={filtered} selected={value} onPick={pick} className="flex-1 min-h-[160px] border-y border-border" />
            ) : (
              <p className="px-5 py-10 text-sm text-muted-foreground text-center">
                {models.length === 0 ? 'No models in your library yet. Download one from the Registry or browse a file below.' : 'No model matches that filter.'}
              </p>
            )}

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manual}
                  onChange={e => setManual(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && manual.trim()) pick(manual.trim()) }}
                  placeholder="…or paste a full path to a .gguf"
                  aria-label="Model path"
                  className="flex-1 h-8 px-2 text-xs font-mono bg-muted border border-border rounded-md"
                />
                <Button size="sm" variant="secondary" disabled={!manual.trim()} onClick={() => pick(manual.trim())}>
                  Use path
                </Button>
              </div>
              <div className="flex justify-between">
                <Button size="sm" variant="ghost" onClick={browse} className="gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Browse file…
                </Button>
                {value && (
                  <Button size="sm" variant="ghost" onClick={() => pick('')}>Clear</Button>
                )}
              </div>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  )
}
