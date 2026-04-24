import { useMemo, useState } from 'react'
import { X, Trash2, Plus, Search, Timer, RotateCcw, MapPin, Flag, ArrowRight, Sparkles } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { POINT_TYPES, POINT_TYPE_LABELS } from '@/lib/pointTypes'
import type {
  PassageTime,
  Point,
  PointType,
  Sector,
  Track,
  Volunteer,
  VolunteerAction,
} from '@/lib/types'
import {
  timeAtKm,
  formatClock,
  isoToTimeInput,
  mergeTimeIntoDate,
} from '@/lib/race/simulation'
import { detectSectorForPoint } from '@/lib/geo/sectorMatch'
import { cn } from '@/lib/utils'

export default function PointDetails() {
  const current = useProjectStore((s) => s.current)
  const selectedId = useProjectStore((s) => s.selectedPointId)
  const select = useProjectStore((s) => s.selectPoint)
  const updatePoint = useProjectStore((s) => s.updatePoint)
  const removePoint = useProjectStore((s) => s.removePoint)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState('')

  if (!current || !selectedId) return null
  const point = current.points.find((p) => p.id === selectedId)
  if (!point) return null

  const assignedVolunteers = point.volunteerIds
    .map((id) => current.volunteers.find((v) => v.id === id))
    .filter((v): v is Volunteer => Boolean(v))

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-border bg-background md:w-80">
      <header className="flex items-center gap-2 border-b border-border p-2">
        <p className="flex-1 text-sm font-semibold">Detalle del punto</p>
        <button
          type="button"
          onClick={() => select(null)}
          className="rounded-md p-1 hover:bg-accent"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-auto p-3 text-xs">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Nombre</span>
          <input
            className={inputCls}
            value={point.name}
            onChange={(e) => updatePoint(point.id, { name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Tipo</span>
          <select
            className={inputCls}
            value={point.type}
            onChange={(e) => updatePoint(point.id, { type: e.target.value as PointType })}
          >
            {POINT_TYPES.map((t) => (
              <option key={t} value={t}>
                {POINT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {point.kmMark !== null && (
          <p className="text-muted-foreground">km {point.kmMark.toFixed(2)}</p>
        )}

        <SectorPicker
          point={point}
          sectors={current.sectors}
          onChange={(sectorId) => updatePoint(point.id, { sectorId })}
        />

        {point.kmMark !== null && current.tracks.some((t) => t.race?.startTime) && (
          <PassageTimes
            point={point}
            tracks={current.tracks.filter(
              (t) => t.race?.startTime && t.race.leaderPaceMinPerKm && t.race.trailerPaceMinPerKm,
            )}
            allPoints={current.points}
            onChange={(trackId, patch) => {
              const prev = point.passageTimes ?? {}
              const curr = prev[trackId] ?? { leaderAt: null, trailerAt: null }
              const next = { ...curr, ...patch }
              const stillHasValue = next.leaderAt !== null || next.trailerAt !== null
              const nextAll = { ...prev }
              if (stillHasValue) nextAll[trackId] = next
              else delete nextAll[trackId]
              updatePoint(point.id, { passageTimes: nextAll })
            }}
          />
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Descripción</span>
          <textarea
            className={cn(inputCls, 'min-h-[4rem] resize-y')}
            value={point.description}
            onChange={(e) => updatePoint(point.id, { description: e.target.value })}
          />
        </label>

        <VolunteerPicker
          allVolunteers={current.volunteers}
          assigned={assignedVolunteers}
          tracks={current.tracks}
          allPoints={current.points}
          originPoint={point}
          actions={point.volunteerActions ?? {}}
          pickerOpen={pickerOpen}
          query={query}
          onOpen={() => {
            setPickerOpen(true)
            setQuery('')
          }}
          onClose={() => setPickerOpen(false)}
          onQuery={setQuery}
          onAdd={(v) => {
            if (point.volunteerIds.includes(v.id)) return
            updatePoint(point.id, { volunteerIds: [...point.volunteerIds, v.id] })
          }}
          onRemove={(v) => {
            const actions = { ...(point.volunteerActions ?? {}) }
            delete actions[v.id]
            updatePoint(point.id, {
              volunteerIds: point.volunteerIds.filter((id) => id !== v.id),
              volunteerActions: actions,
            })
          }}
          onActionChange={(vId, action) => {
            const actions = { ...(point.volunteerActions ?? {}) }
            if (action.type === 'stay') delete actions[vId]
            else actions[vId] = action
            updatePoint(point.id, { volunteerActions: actions })
          }}
        />

        <button
          type="button"
          onClick={() => {
            if (confirm('¿Eliminar este punto?')) {
              removePoint(point.id)
              select(null)
            }
          }}
          className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-destructive/30 px-3 py-1.5 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-3.5" /> Eliminar punto
        </button>
      </div>
    </aside>
  )
}

type PickerProps = {
  allVolunteers: Volunteer[]
  assigned: Volunteer[]
  tracks: Track[]
  allPoints: Point[]
  originPoint: Point
  actions: Record<string, VolunteerAction>
  pickerOpen: boolean
  query: string
  onOpen: () => void
  onClose: () => void
  onQuery: (q: string) => void
  onAdd: (v: Volunteer) => void
  onRemove: (v: Volunteer) => void
  onActionChange: (volunteerId: string, action: VolunteerAction) => void
}

function VolunteerPicker({
  allVolunteers,
  assigned,
  tracks,
  allPoints,
  originPoint,
  actions,
  pickerOpen,
  query,
  onOpen,
  onClose,
  onQuery,
  onAdd,
  onRemove,
  onActionChange,
}: PickerProps) {
  const assignedIds = useMemo(() => new Set(assigned.map((v) => v.id)), [assigned])
  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allVolunteers
      .filter((v) => !assignedIds.has(v.id))
      .filter((v) => {
        if (!q) return true
        return (
          v.name.toLowerCase().includes(q) ||
          v.role.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
  }, [allVolunteers, assignedIds, query])

  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
        Voluntarios asignados ({assigned.length})
      </p>

      {assigned.length === 0 ? (
        <p className="mb-2 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
          Sin voluntarios asignados.
        </p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {assigned
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
            .map((v) => (
              <AssignedVolunteerRow
                key={v.id}
                volunteer={v}
                action={actions[v.id] ?? { type: 'stay' }}
                originPoint={originPoint}
                tracks={tracks}
                allPoints={allPoints}
                onRemove={() => onRemove(v)}
                onActionChange={(a) => onActionChange(v.id, a)}
              />
            ))}
        </ul>
      )}

      {allVolunteers.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Crea voluntarios en la pestaña correspondiente para poder asignarlos.
        </p>
      ) : !pickerOpen ? (
        <button
          type="button"
          onClick={onOpen}
          disabled={available.length === 0 && allVolunteers.length === assigned.length}
          className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] hover:bg-accent disabled:opacity-50"
        >
          <Plus className="size-3" />
          {assigned.length === allVolunteers.length
            ? 'Todos los voluntarios ya están asignados'
            : 'Añadir voluntario'}
        </button>
      ) : (
        <div className="flex flex-col gap-1 rounded-md border border-border p-1.5">
          <div className="flex items-center gap-1 rounded-sm border border-border bg-background px-1.5">
            <Search className="size-3 text-muted-foreground" />
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-1 text-[11px] outline-none"
              placeholder="Buscar por nombre o rol…"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose()
              }}
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent"
              aria-label="Cerrar selector"
            >
              <X className="size-3" />
            </button>
          </div>
          <ul className="max-h-48 overflow-auto">
            {available.length === 0 ? (
              <li className="px-2 py-1 text-[11px] text-muted-foreground">
                Sin coincidencias.
              </li>
            ) : (
              available.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(v)}
                    className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-[11px] hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {v.role || '—'}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary'

function SectorPicker({
  point,
  sectors,
  onChange,
}: {
  point: Point
  sectors: Sector[]
  onChange: (sectorId: string | null) => void
}) {
  const suggested = useMemo(
    () => detectSectorForPoint(point, sectors),
    [point, sectors],
  )
  const currentSector = sectors.find((s) => s.id === point.sectorId)
  const suggestedSector = suggested ? sectors.find((s) => s.id === suggested) : null
  const suggestionDiffers = suggested !== null && suggested !== point.sectorId

  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
        Sector
      </span>
      <select
        className={inputCls}
        value={point.sectorId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">— Sin sector —</option>
        {sectors.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.id === suggested ? ' (detectado)' : ''}
          </option>
        ))}
      </select>
      {currentSector && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <span
            className="size-2 rounded-sm"
            style={{ background: currentSector.color }}
            aria-hidden
          />
          {currentSector.definition.type === 'range'
            ? `km ${currentSector.definition.startKm.toFixed(1)} – ${currentSector.definition.endKm.toFixed(1)}`
            : 'Polígono libre'}
        </p>
      )}
      {suggestionDiffers && suggestedSector && (
        <button
          type="button"
          onClick={() => onChange(suggested)}
          className="mt-1 inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20"
          title="Aplicar la sugerencia del sistema"
        >
          <Sparkles className="size-3" />
          Sugerido: {suggestedSector.name}
        </button>
      )}
      {point.sectorId && suggested === point.sectorId && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
          <Sparkles className="size-3" /> Auto-detectado
        </p>
      )}
      {sectors.length === 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Crea un sector en la pestaña "Sectores" para poder asignarlo aquí.
        </p>
      )}
    </label>
  )
}

type AssignedRowProps = {
  volunteer: Volunteer
  action: VolunteerAction
  originPoint: Point
  tracks: Track[]
  allPoints: Point[]
  onRemove: () => void
  onActionChange: (action: VolunteerAction) => void
}

function AssignedVolunteerRow({
  volunteer,
  action,
  originPoint,
  tracks,
  allPoints,
  onRemove,
  onActionChange,
}: AssignedRowProps) {
  const [expanded, setExpanded] = useState(action.type !== 'stay')
  const otherPoints = allPoints.filter((p) => p.id !== originPoint.id)
  const targetPoint =
    action.type === 'moveTo' ? allPoints.find((p) => p.id === action.targetPointId) ?? null : null
  const sweeperTrack =
    action.type === 'sweeper' ? tracks.find((t) => t.id === action.trackId) ?? null : null

  const actionLabel = () => {
    if (action.type === 'stay') return 'Se queda en este punto'
    if (action.type === 'moveTo') {
      return targetPoint ? `Va a ${targetPoint.name}` : 'Va a otro punto (sin destino)'
    }
    return sweeperTrack
      ? `Acompaña al último en ${sweeperTrack.name}`
      : 'Acompaña al último (sin track)'
  }

  const actionIcon = () => {
    if (action.type === 'stay') return <MapPin className="size-3" />
    if (action.type === 'moveTo') return <ArrowRight className="size-3" />
    return <Flag className="size-3" />
  }

  const set = (next: VolunteerAction) => onActionChange(next)

  return (
    <li className="rounded-md border border-primary/40 bg-accent/50 p-2 text-[11px]">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate font-medium">{volunteer.name}</span>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
          aria-label={`Quitar ${volunteer.name}`}
          title="Quitar del punto"
        >
          <X className="size-3" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'mt-1 inline-flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left text-[10px] hover:bg-background/60',
          action.type !== 'stay' && 'text-foreground',
          action.type === 'stay' && 'text-muted-foreground',
        )}
      >
        {actionIcon()}
        <span className="min-w-0 flex-1 truncate">
          Al pasar el último: <strong className="font-medium">{actionLabel()}</strong>
        </span>
      </button>

      {expanded && (
        <div className="mt-1 flex flex-col gap-1 rounded-sm border border-border bg-background p-1.5 text-[10px]">
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`action-${volunteer.id}`}
              checked={action.type === 'stay'}
              onChange={() => set({ type: 'stay' })}
            />
            <MapPin className="size-3" /> Quedarse en este punto
          </label>
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`action-${volunteer.id}`}
              checked={action.type === 'moveTo'}
              onChange={() => {
                const firstTarget = otherPoints[0]
                if (!firstTarget) return
                set({ type: 'moveTo', targetPointId: firstTarget.id })
              }}
              disabled={otherPoints.length === 0}
            />
            <ArrowRight className="size-3" /> Desplazarse a otro punto
          </label>
          {action.type === 'moveTo' && (
            <select
              className="ml-4 rounded-md border border-border bg-background px-1 py-0.5 text-[10px] outline-none focus:border-primary"
              value={action.targetPointId}
              onChange={(e) => set({ type: 'moveTo', targetPointId: e.target.value })}
            >
              {otherPoints.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.kmMark !== null ? ` · km ${p.kmMark.toFixed(1)}` : ''}
                </option>
              ))}
            </select>
          )}
          <label className="inline-flex items-center gap-1">
            <input
              type="radio"
              name={`action-${volunteer.id}`}
              checked={action.type === 'sweeper'}
              onChange={() => {
                const firstTrack = tracks[0]
                if (!firstTrack) return
                set({ type: 'sweeper', trackId: firstTrack.id })
              }}
              disabled={tracks.length === 0}
            />
            <Flag className="size-3" /> Acompañar al último hasta meta
          </label>
          {action.type === 'sweeper' && (
            <select
              className="ml-4 rounded-md border border-border bg-background px-1 py-0.5 text-[10px] outline-none focus:border-primary"
              value={action.trackId}
              onChange={(e) => set({ type: 'sweeper', trackId: e.target.value })}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </li>
  )
}

type PassageTimesProps = {
  point: Point
  tracks: Track[]
  allPoints: Point[]
  onChange: (trackId: string, patch: Partial<PassageTime>) => void
}

function PassageTimes({ point, tracks, allPoints, onChange }: PassageTimesProps) {
  if (point.kmMark === null || tracks.length === 0) return null
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Timer className="size-3" /> Paso por este punto (km {point.kmMark.toFixed(2)})
      </p>
      <ul className="flex flex-col gap-2">
        {tracks.map((t) => (
          <PassageRow
            key={t.id}
            track={t}
            point={point}
            allPoints={allPoints}
            override={point.passageTimes?.[t.id]}
            onChange={(patch) => onChange(t.id, patch)}
          />
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Los tiempos por defecto se calculan con el ritmo medio del track. Introduce una hora para anclar este
        punto como referencia y el resto se recalcula con interpolación lineal.
      </p>
    </div>
  )
}

type PassageRowProps = {
  track: Track
  point: Point
  allPoints: Point[]
  override: PassageTime | undefined
  onChange: (patch: Partial<PassageTime>) => void
}

function PassageRow({ track, point, allPoints, override, onChange }: PassageRowProps) {
  if (point.kmMark === null) return null

  const autoLeader = useMemo(
    () => timeAtKm(track, point.kmMark!, 'leader'),
    [track, point.kmMark, allPoints],
  )
  const autoTrailer = useMemo(
    () => timeAtKm(track, point.kmMark!, 'trailer'),
    [track, point.kmMark, allPoints],
  )
  const effectiveLeader = useMemo(
    () => timeAtKm(track, point.kmMark!, 'leader', allPoints),
    [track, point.kmMark, allPoints],
  )
  const effectiveTrailer = useMemo(
    () => timeAtKm(track, point.kmMark!, 'trailer', allPoints),
    [track, point.kmMark, allPoints],
  )

  const startDateIso = track.race?.startTime ?? null

  const commitTime = (which: 'leader' | 'trailer', hhmm: string) => {
    if (!startDateIso) return
    if (hhmm === '') {
      onChange(which === 'leader' ? { leaderAt: null } : { trailerAt: null })
      return
    }
    const iso = mergeTimeIntoDate(startDateIso, hhmm)
    if (!iso) return
    onChange(which === 'leader' ? { leaderAt: iso } : { trailerAt: iso })
  }

  const overriddenLeader = Boolean(override?.leaderAt)
  const overriddenTrailer = Boolean(override?.trailerAt)

  return (
    <li className="rounded-md border border-border bg-muted/30 p-2 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: track.color }} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{track.name}</span>
        {(overriddenLeader || overriddenTrailer) && (
          <button
            type="button"
            onClick={() => onChange({ leaderAt: null, trailerAt: null })}
            className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
            title="Volver al valor calculado"
          >
            <RotateCcw className="size-3" /> Auto
          </button>
        )}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">1º corredor</span>
          <input
            type="time"
            step={60}
            className={cn(
              'rounded-md border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary',
              overriddenLeader ? 'border-primary' : 'border-border',
            )}
            value={isoToTimeInput(override?.leaderAt ?? null)}
            placeholder={autoLeader !== null ? formatClock(autoLeader) : ''}
            onChange={(e) => commitTime('leader', e.target.value)}
          />
          <span className="tabular-nums text-muted-foreground">
            {overriddenLeader
              ? `auto: ${autoLeader !== null ? formatClock(autoLeader) : '—'}`
              : `efectiva: ${effectiveLeader !== null ? formatClock(effectiveLeader) : '—'}`}
          </span>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Último corredor</span>
          <input
            type="time"
            step={60}
            className={cn(
              'rounded-md border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary',
              overriddenTrailer ? 'border-primary' : 'border-border',
            )}
            value={isoToTimeInput(override?.trailerAt ?? null)}
            placeholder={autoTrailer !== null ? formatClock(autoTrailer) : ''}
            onChange={(e) => commitTime('trailer', e.target.value)}
          />
          <span className="tabular-nums text-muted-foreground">
            {overriddenTrailer
              ? `auto: ${autoTrailer !== null ? formatClock(autoTrailer) : '—'}`
              : `efectiva: ${effectiveTrailer !== null ? formatClock(effectiveTrailer) : '—'}`}
          </span>
        </label>
      </div>
    </li>
  )
}
