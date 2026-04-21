import { useMemo, useState } from 'react'
import { Search, X, Phone, Mail, MapPin, Shield } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import { POINT_TYPE_LABELS } from '@/lib/pointTypes'
import { pointTypeMeta } from '@/components/map/PointsLayer'
import type { Point, Sector, Volunteer } from '@/lib/types'
import { cn } from '@/lib/utils'

type View = 'byVolunteer' | 'byPoint'

function matchesQuery(text: string | null | undefined, q: string): boolean {
  if (!q) return true
  if (!text) return false
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .includes(q)
}

function normaliseQuery(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function LegendPanel() {
  const current = useProjectStore((s) => s.current)
  const selectPoint = useProjectStore((s) => s.selectPoint)
  const requestFlyTo = useUiStore((s) => s.requestFlyTo)
  const setActiveTab = useUiStore((s) => s.setActiveTab)
  const [view, setView] = useState<View>('byVolunteer')
  const [query, setQuery] = useState('')

  if (!current) return null

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-1 rounded-md border border-border bg-background">
        <Search className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs outline-none"
          placeholder="Buscar voluntario, punto o km…"
          aria-label="Buscar en la leyenda"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="mr-1 rounded-sm p-1 text-muted-foreground hover:bg-accent"
            aria-label="Limpiar búsqueda"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      <div className="flex rounded-md border border-border p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setView('byVolunteer')}
          className={cn(
            'flex-1 rounded-sm px-2 py-1',
            view === 'byVolunteer' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          Por voluntario
        </button>
        <button
          type="button"
          onClick={() => setView('byPoint')}
          className={cn(
            'flex-1 rounded-sm px-2 py-1',
            view === 'byPoint' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
          )}
        >
          Por punto
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {view === 'byVolunteer' ? (
          <ByVolunteerList
            query={query}
            onFlyTo={(pt) => {
              selectPoint(pt.id)
              setActiveTab('points')
              requestFlyTo(pt.coordinates, 16)
            }}
          />
        ) : (
          <ByPointList
            query={query}
            onFlyTo={(pt) => {
              selectPoint(pt.id)
              requestFlyTo(pt.coordinates, 16)
            }}
          />
        )}
      </div>
    </div>
  )
}

type ByVolunteerProps = {
  query: string
  onFlyTo: (pt: Point) => void
}

function ByVolunteerList({ query, onFlyTo }: ByVolunteerProps) {
  const current = useProjectStore((s) => s.current)!
  const q = normaliseQuery(query)

  const { pointsByVolunteer, sectorsByVolunteer } = useMemo(() => {
    const byVol = new Map<string, Point[]>()
    for (const v of current.volunteers) byVol.set(v.id, [])
    for (const pt of current.points) {
      for (const vid of pt.volunteerIds) byVol.get(vid)?.push(pt)
    }
    const sectorsByVol = new Map<string, Sector[]>()
    for (const v of current.volunteers) {
      const sectorIds = new Set<string>()
      for (const pt of byVol.get(v.id) ?? []) {
        if (pt.sectorId) sectorIds.add(pt.sectorId)
      }
      for (const sector of current.sectors) {
        if (sector.chiefVolunteerId === v.id) sectorIds.add(sector.id)
      }
      sectorsByVol.set(
        v.id,
        [...sectorIds]
          .map((id) => current.sectors.find((s) => s.id === id))
          .filter((s): s is Sector => Boolean(s)),
      )
    }
    return { pointsByVolunteer: byVol, sectorsByVolunteer: sectorsByVol }
  }, [current.volunteers, current.points, current.sectors])

  const volunteers = [...current.volunteers]
    .filter((v) => {
      if (!q) return true
      if (matchesQuery(v.name, q) || matchesQuery(v.role, q)) return true
      const pts = pointsByVolunteer.get(v.id) ?? []
      if (pts.some((pt) => matchesQuery(pt.name, q))) return true
      const sectors = sectorsByVolunteer.get(v.id) ?? []
      if (sectors.some((s) => matchesQuery(s.name, q))) return true
      return false
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))

  if (current.volunteers.length === 0) {
    return <p className="text-xs text-muted-foreground">Aún no hay voluntarios.</p>
  }
  if (volunteers.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin coincidencias para "{query}".</p>
  }

  return (
    <ul className="flex flex-col gap-2 text-xs">
      {volunteers.map((v) => (
        <VolunteerCard
          key={v.id}
          volunteer={v}
          points={pointsByVolunteer.get(v.id) ?? []}
          sectors={sectorsByVolunteer.get(v.id) ?? []}
          onFlyTo={onFlyTo}
        />
      ))}
    </ul>
  )
}

type VolunteerCardProps = {
  volunteer: Volunteer
  points: Point[]
  sectors: Sector[]
  onFlyTo: (pt: Point) => void
}

function VolunteerCard({ volunteer, points, sectors, onFlyTo }: VolunteerCardProps) {
  const current = useProjectStore((s) => s.current)!
  const isChiefOf = sectors.filter((s) => s.chiefVolunteerId === volunteer.id)
  const sortedPoints = [...points].sort(
    (a, b) => (a.kmMark ?? Infinity) - (b.kmMark ?? Infinity),
  )

  return (
    <li className="rounded-md border border-border bg-background p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-medium">{volunteer.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {volunteer.role || 'Sin rol'}
          </p>
          {(volunteer.phone || volunteer.email) && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {volunteer.phone && (
                <a href={`tel:${volunteer.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Phone className="size-3" /> {volunteer.phone}
                </a>
              )}
              {volunteer.email && (
                <a href={`mailto:${volunteer.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                  <Mail className="size-3" /> {volunteer.email}
                </a>
              )}
            </div>
          )}
        </div>
        {isChiefOf.length > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
            title="Jefe o jefa de sector"
          >
            <Shield className="size-3" /> Jefe
          </span>
        )}
      </div>

      {sectors.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
          {sectors.map((sector) => {
            const chief =
              sector.chiefVolunteerId && sector.chiefVolunteerId !== volunteer.id
                ? current.volunteers.find((v) => v.id === sector.chiefVolunteerId)
                : null
            return (
              <div key={sector.id} className="flex flex-col gap-0.5">
                <p className="flex items-center gap-1 font-medium">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: sector.color }} aria-hidden />
                  <span className="truncate">{sector.name}</span>
                </p>
                {chief ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Shield className="size-3" /> Responsable: {chief.name}
                    </span>
                    {chief.phone && (
                      <a href={`tel:${chief.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Phone className="size-3" /> {chief.phone}
                      </a>
                    )}
                    {chief.email && (
                      <a href={`mailto:${chief.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                        <Mail className="size-3" /> {chief.email}
                      </a>
                    )}
                  </div>
                ) : sector.chiefVolunteerId === volunteer.id ? (
                  <p className="pl-3 text-[11px] text-muted-foreground">Eres la persona responsable de este sector.</p>
                ) : (
                  <p className="pl-3 text-[11px] text-muted-foreground">Sin jefe asignado.</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-2 border-t border-border pt-2">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          Puntos asignados ({sortedPoints.length})
        </p>
        {sortedPoints.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Sin asignación.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {sortedPoints.map((pt) => {
              const meta = pointTypeMeta(pt.type)
              return (
                <li key={pt.id}>
                  <button
                    type="button"
                    onClick={() => onFlyTo(pt)}
                    className="flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left hover:bg-accent"
                  >
                    <span
                      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] text-white"
                      style={{ background: meta.color }}
                    >
                      {meta.emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{pt.name}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MapPin className="size-2.5" />
                      {pt.kmMark !== null ? `km ${pt.kmMark.toFixed(1)}` : POINT_TYPE_LABELS[pt.type]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </li>
  )
}

type ByPointProps = {
  query: string
  onFlyTo: (pt: Point) => void
}

function ByPointList({ query, onFlyTo }: ByPointProps) {
  const current = useProjectStore((s) => s.current)!
  const q = normaliseQuery(query)
  const volunteerById = useMemo(
    () => new Map(current.volunteers.map((v) => [v.id, v])),
    [current.volunteers],
  )

  const filtered = current.points
    .filter((pt) => {
      if (!q) return true
      if (matchesQuery(pt.name, q) || matchesQuery(POINT_TYPE_LABELS[pt.type], q)) return true
      if (pt.kmMark !== null && matchesQuery(`km ${pt.kmMark.toFixed(1)}`, q)) return true
      for (const vid of pt.volunteerIds) {
        const v = volunteerById.get(vid)
        if (v && matchesQuery(v.name, q)) return true
      }
      return false
    })
    .sort((a, b) => {
      if (a.kmMark === null && b.kmMark === null) return 0
      if (a.kmMark === null) return 1
      if (b.kmMark === null) return -1
      return a.kmMark - b.kmMark
    })

  if (current.points.length === 0) {
    return <p className="text-xs text-muted-foreground">Aún no hay puntos.</p>
  }
  if (filtered.length === 0) {
    return <p className="text-xs text-muted-foreground">Sin coincidencias para "{query}".</p>
  }

  return (
    <ul className="flex flex-col gap-1 text-xs">
      {filtered.map((pt) => {
        const meta = pointTypeMeta(pt.type)
        return (
          <li key={pt.id} className="rounded-md border border-border p-2">
            <button
              type="button"
              onClick={() => onFlyTo(pt)}
              className="flex w-full items-center gap-2 text-left"
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] text-white"
                style={{ background: meta.color }}
              >
                {meta.emoji}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate font-medium">{pt.name}</span>
                <span className="block truncate text-muted-foreground">
                  {POINT_TYPE_LABELS[pt.type]}
                  {pt.kmMark !== null ? ` · km ${pt.kmMark.toFixed(2)}` : ''}
                </span>
              </span>
            </button>
            {pt.volunteerIds.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1">
                {pt.volunteerIds.map((vid) => {
                  const v = volunteerById.get(vid)
                  if (!v) return null
                  return (
                    <li
                      key={vid}
                      className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px]"
                    >
                      {v.name}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
