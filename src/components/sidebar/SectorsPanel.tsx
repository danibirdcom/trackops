import { useMemo } from 'react'
import { nanoid } from 'nanoid'
import { Plus, Trash2, Pencil, X, Target, Route, ArrowRightCircle, Eye, EyeOff } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import type { Sector, SectorDefinition, Track } from '@/lib/types'
import { totalDistanceKm } from '@/lib/geo/distance'
import { trackLatLngs } from '@/lib/geo/kmAlongTrack'
import { polygonOverlapWithTrack, type TrackPolygonOverlap } from '@/lib/geo/polygonOnTrack'
import { cn } from '@/lib/utils'

const SECTOR_COLORS = ['#f97316', '#14b8a6', '#a855f7', '#ec4899', '#22c55e', '#0ea5e9', '#eab308']

export default function SectorsPanel() {
  const current = useProjectStore((s) => s.current)
  const addSector = useProjectStore((s) => s.addSector)
  const updateSector = useProjectStore((s) => s.updateSector)
  const removeSector = useProjectStore((s) => s.removeSector)
  const selectedId = useUiStore((s) => s.selectedSectorId)
  const selectSector = useUiStore((s) => s.selectSector)
  const setDrawMode = useUiStore((s) => s.setDrawMode)
  const drawMode = useUiStore((s) => s.drawMode)

  const trackLengths = useMemo(() => {
    if (!current) return new Map<string, number>()
    const m = new Map<string, number>()
    for (const t of current.tracks) {
      m.set(t.id, totalDistanceKm(trackLatLngs(t.geojson)))
    }
    return m
  }, [current])

  if (!current) return null

  const sectors = current.sectors
  const editingSector = selectedId ? sectors.find((s) => s.id === selectedId) : null

  const createSector = () => {
    const idx = sectors.length
    const color = SECTOR_COLORS[idx % SECTOR_COLORS.length] ?? '#f97316'
    const firstTrack = current.tracks[0]
    const defaultDef: SectorDefinition = firstTrack
      ? { type: 'range', startKm: 0, endKm: Math.min(5, trackLengths.get(firstTrack.id) ?? 5) }
      : { type: 'polygon', geojson: { type: 'Polygon', coordinates: [[]] } }
    const sector: Sector = {
      id: nanoid(10),
      name: `Sector ${idx + 1}`,
      color,
      trackId: firstTrack?.id ?? null,
      definition: defaultDef,
      chiefVolunteerId: null,
      notes: '',
      visible: true,
    }
    addSector(sector)
    selectSector(sector.id)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <button
        type="button"
        onClick={createSector}
        className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        <Plus className="size-3.5" /> Nuevo sector
      </button>

      {editingSector && (
        <SectorEditor
          key={editingSector.id}
          sector={editingSector}
          trackLengthKm={editingSector.trackId ? trackLengths.get(editingSector.trackId) ?? null : null}
          project={current}
          onChange={(patch) => updateSector(editingSector.id, patch)}
          onClose={() => selectSector(null)}
          onRemove={() => {
            if (confirm(`¿Eliminar ${editingSector.name}?`)) {
              removeSector(editingSector.id)
              selectSector(null)
            }
          }}
          onStartPolygonDraw={() =>
            setDrawMode({ kind: 'sector-polygon', sectorId: editingSector.id })
          }
          drawingThis={
            drawMode?.kind === 'sector-polygon' && drawMode.sectorId === editingSector.id
          }
        />
      )}

      <div className="flex-1 overflow-auto">
        <p className="mb-1 text-xs font-medium">Sectores ({sectors.length})</p>
        {sectors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay sectores.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sectors.map((s) => {
              const chief = current.volunteers.find((v) => v.id === s.chiefVolunteerId)
              const active = selectedId === s.id
              const visible = s.visible !== false
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md border p-2 text-xs',
                    active ? 'border-primary bg-accent' : 'border-border',
                    !visible && 'opacity-60',
                  )}
                >
                  <span
                    className="size-4 shrink-0 rounded-sm"
                    style={{ background: s.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {s.definition.type === 'range'
                        ? `km ${s.definition.startKm.toFixed(1)} – ${s.definition.endKm.toFixed(1)}`
                        : 'Polígono libre'}
                      {chief ? ` · ${chief.name}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSector(s.id, { visible: !visible })}
                    className="rounded-md p-1 hover:bg-accent"
                    aria-label={visible ? 'Ocultar en el mapa' : 'Mostrar en el mapa'}
                    title={visible ? 'Ocultar en el mapa' : 'Mostrar en el mapa'}
                  >
                    {visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => selectSector(active ? null : s.id)}
                    className="rounded-md p-1 hover:bg-accent"
                    aria-label="Editar"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

type EditorProps = {
  sector: Sector
  trackLengthKm: number | null
  project: NonNullable<ReturnType<typeof useProjectStore.getState>['current']>
  onChange: (patch: Partial<Sector>) => void
  onClose: () => void
  onRemove: () => void
  onStartPolygonDraw: () => void
  drawingThis: boolean
}

function SectorEditor({
  sector,
  trackLengthKm,
  project,
  onChange,
  onClose,
  onRemove,
  onStartPolygonDraw,
  drawingThis,
}: EditorProps) {
  const maxKm = trackLengthKm ?? 999

  const setRangeMode = () => {
    const firstTrackId = sector.trackId ?? project.tracks[0]?.id ?? null
    if (!firstTrackId) return
    onChange({
      trackId: firstTrackId,
      definition: { type: 'range', startKm: 0, endKm: Math.min(5, maxKm) },
    })
  }

  const setPolygonMode = () => {
    onChange({
      trackId: null,
      definition: { type: 'polygon', geojson: { type: 'Polygon', coordinates: [[]] } },
    })
  }

  const pointsInSector = project.points.filter((p) => p.sectorId === sector.id)

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2 text-xs">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={sector.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="size-6 cursor-pointer rounded border border-border bg-transparent"
          aria-label="Color del sector"
        />
        <input
          className="min-w-0 flex-1 rounded-sm bg-transparent text-sm font-medium outline-none focus:bg-muted"
          value={sector.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 hover:bg-accent"
          aria-label="Cerrar"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex rounded-md border border-border p-0.5 text-[11px]">
        <button
          type="button"
          onClick={setRangeMode}
          disabled={project.tracks.length === 0}
          className={cn(
            'flex-1 rounded-sm px-2 py-1 disabled:opacity-40',
            sector.definition.type === 'range' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          Rango km
        </button>
        <button
          type="button"
          onClick={setPolygonMode}
          className={cn(
            'flex-1 rounded-sm px-2 py-1',
            sector.definition.type === 'polygon' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          Polígono
        </button>
      </div>

      {sector.definition.type === 'range' && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-muted-foreground">Track</span>
            <select
              className={inputCls}
              value={sector.trackId ?? ''}
              onChange={(e) => onChange({ trackId: e.target.value || null })}
            >
              {project.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">
                Desde km {trackLengthKm !== null ? `(máx ${trackLengthKm.toFixed(1)})` : ''}
              </span>
              <input
                type="number"
                step={0.1}
                min={0}
                max={maxKm}
                className={inputCls}
                value={sector.definition.startKm}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(Number(e.target.value) || 0, maxKm))
                  if (sector.definition.type === 'range') {
                    onChange({
                      definition: { ...sector.definition, startKm: v },
                    })
                  }
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Hasta km</span>
              <input
                type="number"
                step={0.1}
                min={0}
                max={maxKm}
                className={inputCls}
                value={sector.definition.endKm}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(Number(e.target.value) || 0, maxKm))
                  if (sector.definition.type === 'range') {
                    onChange({ definition: { ...sector.definition, endKm: v } })
                  }
                }}
              />
            </label>
          </div>
        </>
      )}

      {sector.definition.type === 'polygon' && (
        <>
          <button
            type="button"
            onClick={onStartPolygonDraw}
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5',
              drawingThis
                ? 'bg-accent text-accent-foreground'
                : 'border border-border hover:bg-accent',
            )}
          >
            <Target className="size-3.5" />
            {drawingThis
              ? 'Dibujando… (click en el mapa)'
              : sector.definition.geojson.coordinates[0]?.length
                ? 'Redibujar polígono'
                : 'Dibujar polígono'}
          </button>
          <PolygonTrackOverlaps
            polygon={sector.definition.geojson}
            tracks={project.tracks}
            onConvertToRange={(trackId, startKm, endKm) =>
              onChange({
                trackId,
                definition: { type: 'range', startKm, endKm },
              })
            }
          />
        </>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Jefe de sector</span>
        <select
          className={inputCls}
          value={sector.chiefVolunteerId ?? ''}
          onChange={(e) => onChange({ chiefVolunteerId: e.target.value || null })}
        >
          <option value="">—</option>
          {project.volunteers.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">Notas</span>
        <textarea
          className={cn(inputCls, 'min-h-[3rem] resize-y')}
          value={sector.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </label>

      {pointsInSector.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {pointsInSector.length} punto{pointsInSector.length === 1 ? '' : 's'} asignado{pointsInSector.length === 1 ? '' : 's'}
        </p>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center justify-center gap-1 rounded-md border border-destructive/30 px-2 py-1.5 text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-3.5" /> Eliminar sector
      </button>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary'

type OverlapsProps = {
  polygon: { type: 'Polygon'; coordinates: number[][][] }
  tracks: Track[]
  onConvertToRange: (trackId: string, startKm: number, endKm: number) => void
}

function PolygonTrackOverlaps({ polygon, tracks, onConvertToRange }: OverlapsProps) {
  const overlaps = useMemo(() => {
    const ring = polygon.coordinates[0]
    if (!ring || ring.length < 4) return [] as Array<{ track: Track; overlap: TrackPolygonOverlap }>
    const out: Array<{ track: Track; overlap: TrackPolygonOverlap }> = []
    for (const track of tracks) {
      const overlap = polygonOverlapWithTrack(track.geojson, polygon)
      if (overlap.segments.length > 0) out.push({ track, overlap })
    }
    return out
  }, [polygon, tracks])

  const hasValidPolygon = (polygon.coordinates[0]?.length ?? 0) >= 4

  if (!hasValidPolygon) {
    return (
      <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
        Dibuja el polígono para detectar qué tramo del track cubre.
      </p>
    )
  }

  if (overlaps.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
        El polígono no intersecta con ningún track.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2">
      <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <Route className="size-3" />
        Tramo detectado en {overlaps.length} track{overlaps.length === 1 ? '' : 's'}
      </p>
      <ul className="flex flex-col gap-1">
        {overlaps.map(({ track, overlap }) => {
          const firstStart = overlap.segments[0]?.startKm ?? 0
          const lastEnd = overlap.segments[overlap.segments.length - 1]?.endKm ?? 0
          return (
            <li
              key={track.id}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-[11px]"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: track.color }} aria-hidden />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate font-medium">{track.name}</p>
                <p className="tabular-nums text-muted-foreground">
                  {overlap.segments
                    .map((s) => `km ${s.startKm.toFixed(2)}–${s.endKm.toFixed(2)}`)
                    .join(' · ')}
                  {overlap.segments.length > 1 && (
                    <span> · total {overlap.totalKm.toFixed(2)} km</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onConvertToRange(track.id, firstStart, lastEnd)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
                title="Convertir este sector a rango km sobre este track"
              >
                <ArrowRightCircle className="size-3" /> Usar
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        "Usar" convierte el sector a tipo "rango km" entre el inicio del primer tramo y el final del último.
      </p>
    </div>
  )
}
