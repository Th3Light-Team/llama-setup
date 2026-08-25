import { Cpu, MessageSquare, Code2, Layers, ChevronRight, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  CURATED_MODELS, CURATED_AUTHORS,
  CATEGORY_LABELS, CATEGORY_ORDER,
  type CuratedModel, type ModelCategory,
} from '@/data/curated-models'

const CATEGORY_ICONS: Record<ModelCategory, React.ElementType> = {
  small:   Zap,
  chat:    MessageSquare,
  code:    Code2,
  general: Layers,
}

function vramLabel(gb: number): string {
  if (gb < 2) return '< 2 GB'
  if (gb < 4) return '~2 GB'
  if (gb < 6) return '~4 GB'
  if (gb < 10) return '~6–8 GB'
  if (gb < 16) return '~10 GB'
  if (gb < 24) return '~16 GB'
  return '24 GB+'
}

interface ModelCardProps {
  model: CuratedModel
  onClick: (id: string) => void
}

function ModelCard({ model, onClick }: ModelCardProps) {
  return (
    <button
      onClick={() => onClick(model.id)}
      className="group text-left w-full rounded-xl border border-border bg-card hover:border-brand/50 hover:bg-brand-muted/30 transition-all p-4 flex flex-col gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate group-hover:text-brand transition-colors">
            {model.family}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{model.author}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-brand transition-colors shrink-0 mt-0.5" aria-hidden />
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
        {model.description}
      </p>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[9px] font-mono text-brand border-brand/30 px-1.5">
          {model.recQuant}
        </Badge>
        <Badge variant="secondary" className="text-[9px] px-1.5">
          {model.contextK}k ctx
        </Badge>
        <Badge variant="secondary" className="text-[9px] px-1.5 flex items-center gap-0.5">
          <Cpu className="h-2.5 w-2.5" aria-hidden />
          {vramLabel(model.minVramGB)}
        </Badge>
        {model.tags.slice(0, 2).map(tag => (
          <Badge key={tag} variant="outline" className="text-[9px] px-1.5 text-muted-foreground">
            {tag}
          </Badge>
        ))}
      </div>
    </button>
  )
}

interface FeaturedViewProps {
  onSelectModel: (id: string) => void
  onBrowseAuthor: (authorId: string) => void
}

export function FeaturedView({ onSelectModel, onBrowseAuthor }: FeaturedViewProps) {
  const byCategory = CATEGORY_ORDER.reduce<Record<ModelCategory, CuratedModel[]>>((acc, cat) => {
    acc[cat] = CURATED_MODELS.filter(m => m.category === cat)
    return acc
  }, {} as Record<ModelCategory, CuratedModel[]>)

  return (
    <div className="space-y-10">
      {/* Model sections */}
      {CATEGORY_ORDER.map(cat => {
        const models = byCategory[cat]
        if (models.length === 0) return null
        const Icon = CATEGORY_ICONS[cat]
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <div className="flex items-center gap-2 mb-4">
              <Icon className="h-4 w-4 text-brand" aria-hidden />
              <h2 id={`cat-${cat}`} className="text-sm font-semibold text-foreground">
                {CATEGORY_LABELS[cat]}
              </h2>
              <span className="text-xs text-muted-foreground">({models.length})</span>
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {models.map(m => (
                <ModelCard key={m.id} model={m} onClick={onSelectModel} />
              ))}
            </div>
          </section>
        )
      })}

      {/* Authors section */}
      <section aria-labelledby="authors-heading">
        <div className="flex items-center gap-2 mb-4">
          <h2 id="authors-heading" className="text-sm font-semibold text-foreground">Browse by author</h2>
          <span className="text-xs text-muted-foreground">— switches to Search</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CURATED_AUTHORS.map(author => (
            <button
              key={author.id}
              onClick={() => onBrowseAuthor(author.id)}
              title={author.note}
              className={cn(
                'group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2',
                'hover:border-brand/50 hover:bg-brand-muted/20 transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left'
              )}
            >
              <div>
                <p className="text-xs font-medium text-foreground group-hover:text-brand transition-colors">
                  {author.label}
                </p>
                <p className="text-[10px] text-muted-foreground">{author.note}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
