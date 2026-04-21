import { Trash2, Plus, Target, XCircle } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import { POINT_TYPES, POINT_TYPE_LABELS } from '@/lib/pointTypes'
import { pointTypeMeta } from '@/components/map/PointsLayer'
import { cn } from '@/lib/utils'

export default function PointsPanel() {
  const current = useProjectStore((s) => s.current)
  const selectPoint = useProjectStore((s) => s.selectPoint)
  const removePoint = useProjectStore((s) => s.removePoint)
  const selectedId = useProjectStore((s) => s.selectedPointId)
  const addPointMode = useUiStore((s) => s.addPointMode)
  const setAddPointMode = useUiStore((s) => s.setAddPointMode)
  const requestFlyTo = useUiStore((s) => s.requestFlyTo)

  if (!current) return null

  const sorted = [...current.points].sort((a, b) => {
    if (a.kmMark === null && b.kmMark === null) return 0
    if (a.kmMark === null) return 1
    if (b.kmMark === null) return -1
    return a.kmMark - b.kmMark
  })

  return (
    <div className="flex h-full flex-col gap-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium">Añadir punto</p>
          {addPointMode && (
            <button
              type="button"
              onClick={() => setAddPointMode(null)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <XCircle className="size-3" />
              Cancelar
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {POINT_TYPES.map((type) => {
            const meta = pointTypeMeta(type)
            const active = addPointMode === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => setAddPointMode(active ? null : type)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] transition-colors',
                  active
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-border hover:bg-accent',
                )}
                title={POINT_TYPE_LABELS[type]}
              >
                <span
                  className="flex size-6 items-center justify-center rounded-full text-sm text-white"
                  style={{ background: meta.color }}
                >
                  {meta.emoji}
                </span>
                <span className="leading-tight">{POINT_TYPE_LABELS[type]}</span>
              </button>
            )
          })}
        </div>
        {addPointMode && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Haz click en el mapa para colocar el punto.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <p className="mb-1 text-xs font-medium">Puntos ({current.points.length})</p>
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay puntos.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sorted.map((pt) => {
              const meta = pointTypeMeta(pt.type)
              const active = selectedId === pt.id
              return (
                <li
                  key={pt.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-1.5 text-xs',
                    active ? 'border-primary bg-accent' : 'border-border',
                  )}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] text-white"
                    style={{ background: meta.color }}
                  >
                    {meta.emoji}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      selectPoint(pt.id)
                      requestFlyTo(pt.coordinates, 16)
                    }}
                    className="flex min-w-0 flex-1 flex-col items-start leading-tight"
                  >
                    <span className="truncate font-medium">{pt.name}</span>
                    <span className="text-muted-foreground">
                      {POINT_TYPE_LABELS[pt.type]}
                      {pt.kmMark !== null ? ` · km ${pt.kmMark.toFixed(2)}` : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('¿Eliminar este punto?')) removePoint(pt.id)
                    }}
                    className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAddPointMode('paso')}
        className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus className="size-3.5" /> Nuevo punto (paso)
      </button>
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Target className="size-3" /> Pincha sobre la traza para anclar el km automáticamente.
      </p>
    </div>
  )
}
