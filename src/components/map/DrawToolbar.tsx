import { Type, Minus, Pentagon, ArrowRight, X, Check } from 'lucide-react'
import { useUiStore, type AnnotationDrawType } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

const TOOLS: { id: AnnotationDrawType; icon: typeof Type; label: string }[] = [
  { id: 'text', icon: Type, label: 'Texto' },
  { id: 'line', icon: Minus, label: 'Línea' },
  { id: 'polygon', icon: Pentagon, label: 'Polígono' },
  { id: 'arrow', icon: ArrowRight, label: 'Flecha' },
]

export default function DrawToolbar() {
  const drawMode = useUiStore((s) => s.drawMode)
  const drawPoints = useUiStore((s) => s.drawPoints)
  const setDrawMode = useUiStore((s) => s.setDrawMode)
  const clearDraw = useUiStore((s) => s.clearDraw)

  const current = drawMode?.kind === 'annotation' ? drawMode.annotationType : null
  const inSectorDraw = drawMode?.kind === 'sector-polygon'

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-[1000] flex flex-col gap-2">
      <div className="pointer-events-auto flex flex-col gap-1 rounded-md border border-border bg-background/95 p-1 shadow-md backdrop-blur">
        <span className="px-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Dibujar
        </span>
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          const active = current === tool.id
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() =>
                active
                  ? clearDraw()
                  : setDrawMode({ kind: 'annotation', annotationType: tool.id })
              }
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-md transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={active}
            >
              <Icon className="size-4" />
            </button>
          )
        })}
      </div>

      {drawMode && (
        <div className="pointer-events-auto flex max-w-[220px] flex-col gap-1 rounded-md border border-border bg-background/95 p-2 text-[11px] shadow-md backdrop-blur">
          <p className="font-medium leading-tight">
            {inSectorDraw
              ? 'Dibujando polígono del sector'
              : current === 'text'
                ? 'Click en el mapa para colocar texto'
                : current === 'arrow'
                  ? 'Click inicio y click final'
                  : current === 'polygon'
                    ? 'Click para vértices, doble click para cerrar'
                    : 'Click para vértices, doble click para terminar'}
          </p>
          <p className="text-muted-foreground">
            Puntos: {drawPoints.length} · Esc cancela · Enter finaliza
          </p>
          <div className="flex gap-1 pt-1">
            <button
              type="button"
              onClick={() => {
                const evt = new KeyboardEvent('keydown', { key: 'Enter' })
                window.dispatchEvent(evt)
              }}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] text-primary-foreground"
            >
              <Check className="size-3" /> Finalizar
            </button>
            <button
              type="button"
              onClick={clearDraw}
              className="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-[11px]"
              aria-label="Cancelar"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
