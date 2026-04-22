import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Flag,
  Shield,
  Sparkles,
  Play,
  Users,
  AlertTriangle,
} from 'lucide-react'
import MapCanvas from '@/components/map/MapCanvas'
import SimulationBar from '@/components/SimulationBar'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import { useSimulationStore } from '@/stores/simulationStore'
import { useSyncStore } from '@/stores/syncStore'
import { getProject, saveProject } from '@/lib/storage/dexie'
import {
  buildRoleDescriptionContext,
  describeVolunteerRole,
  type RoleDescriptionContext,
} from '@/lib/ai/describeVolunteer'
import { aggregateRaceWindow } from '@/lib/race/simulation'

export default function VolunteerView() {
  const { projectId, volunteerId } = useParams<{ projectId: string; volunteerId: string }>()
  const current = useProjectStore((s) => s.current)
  const setProject = useProjectStore((s) => s.setProject)
  const selectPoint = useProjectStore((s) => s.selectPoint)
  const setReadOnly = useUiStore((s) => s.setReadOnly)
  const requestFlyTo = useUiStore((s) => s.requestFlyTo)
  const simulationActive = useSimulationStore((s) => s.active)
  const setSimulationActive = useSimulationStore((s) => s.setActive)
  const setSimulationCurrentMs = useSimulationStore((s) => s.setCurrentMs)
  const syncEnabled = useSyncStore((s) => s.enabled)
  const pullNow = useSyncStore((s) => s.pullNow)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    setReadOnly(true)
    return () => {
      setReadOnly(false)
      setProject(null)
    }
  }, [setReadOnly, setProject])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      let p = (await getProject(projectId)) ?? null
      if (!p && syncEnabled) {
        p = await pullNow(projectId)
        if (p) await saveProject(p)
      }
      if (cancelled) return
      if (p) {
        setProject(p)
        setNotFound(false)
      } else {
        setNotFound(true)
      }
      setLoading(false)
    })()
  }, [projectId, setProject, syncEnabled, pullNow])

  const ctx = useMemo<RoleDescriptionContext | null>(() => {
    if (!current || !volunteerId) return null
    return buildRoleDescriptionContext(current, volunteerId)
  }, [current, volunteerId])

  useEffect(() => {
    if (!ctx) return
    const first = ctx.points[0]
    if (first) {
      selectPoint(first.id)
      requestFlyTo(first.coordinates, 16)
    }
  }, [ctx, selectPoint, requestFlyTo])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>
  }
  if (notFound || !current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="text-sm font-medium">Proyecto no encontrado.</p>
        <Link to="/" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          Volver al inicio
        </Link>
      </div>
    )
  }
  if (!ctx) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="text-sm font-medium">No te hemos encontrado en este evento.</p>
        <Link
          to={`/volunteer/${projectId}`}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Volver a buscar
        </Link>
      </div>
    )
  }

  const { volunteer, points, sectors, peers, chiefByVolunteer } = ctx
  const description = describeVolunteerRole(ctx)
  const window = aggregateRaceWindow(current.tracks)
  const canSimulate = Boolean(window)

  const toggleSim = () => {
    const next = !simulationActive
    setSimulationActive(next)
    if (next && window) setSimulationCurrentMs(window.startMs)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        <Link
          to={`/volunteer/${projectId}`}
          className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
          aria-label="Volver a búsqueda"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{volunteer.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {volunteer.role || 'Sin rol'} · {current.name}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleSim}
          disabled={!canSimulate}
          className={`ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40 ${
            simulationActive ? 'bg-accent' : ''
          }`}
          title={canSimulate ? 'Ver el recorrido en directo' : 'Sin datos de simulación configurados'}
        >
          <Play className="size-3.5" />
          <span className="hidden sm:inline">Ver en directo</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex max-h-[60vh] w-full shrink-0 flex-col gap-3 overflow-auto border-b border-border bg-background p-3 text-sm md:max-h-none md:w-96 md:border-b-0 md:border-r">
          <section className="rounded-md border border-border bg-muted/30 p-3">
            <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3" /> Tu cometido
            </p>
            <p className="text-[13px] leading-snug">{description}</p>
          </section>

          {points.length > 0 && (
            <section>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <MapPin className="size-3" /> Tu posición
              </p>
              <ul className="flex flex-col gap-1">
                {points
                  .slice()
                  .sort((a, b) => (a.kmMark ?? Infinity) - (b.kmMark ?? Infinity))
                  .map((p) => (
                    <li
                      key={p.id}
                      className="rounded-md border border-primary/30 bg-accent/50 p-2 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          selectPoint(p.id)
                          requestFlyTo(p.coordinates, 17)
                        }}
                        className="w-full text-left"
                      >
                        <p className="font-medium">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.kmMark !== null ? `km ${p.kmMark.toFixed(2)}` : 'Sin kilómetro'}
                        </p>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {sectors.length > 0 && (
            <section>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Flag className="size-3" /> Tu sector
              </p>
              <ul className="flex flex-col gap-2">
                {sectors.map((s) => {
                  const chief = chiefByVolunteer.get(s.id)
                  const isChief = s.chiefVolunteerId === volunteer.id
                  return (
                    <li key={s.id} className="rounded-md border border-border p-2 text-xs">
                      <p className="flex items-center gap-1 font-medium">
                        <span className="size-2 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                        {s.name}
                      </p>
                      {isChief ? (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          <Shield className="size-3" /> Eres el responsable de zona
                        </p>
                      ) : chief ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          <p className="inline-flex items-center gap-1">
                            <Shield className="size-3" /> Responsable: <strong className="font-medium">{chief.name}</strong>
                          </p>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            {chief.phone && (
                              <a
                                href={`tel:${chief.phone}`}
                                className="inline-flex items-center gap-1 hover:text-foreground"
                              >
                                <Phone className="size-3" /> {chief.phone}
                              </a>
                            )}
                            {chief.email && (
                              <a
                                href={`mailto:${chief.email}`}
                                className="inline-flex items-center gap-1 hover:text-foreground"
                              >
                                <Mail className="size-3" /> {chief.email}
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          No hay responsable asignado.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {peers.length > 0 && (
            <section>
              <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Users className="size-3" /> Contigo en la zona ({peers.length})
              </p>
              <ul className="flex flex-col gap-1">
                {peers
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
                  .map((p) => (
                    <li key={p.id} className="rounded-md border border-border p-2 text-xs">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{p.role || 'Sin rol'}</p>
                      {(p.phone || p.email) && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {p.phone && (
                            <a
                              href={`tel:${p.phone}`}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              <Phone className="size-3" /> {p.phone}
                            </a>
                          )}
                          {p.email && (
                            <a
                              href={`mailto:${p.email}`}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              <Mail className="size-3" /> {p.email}
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </aside>

        <main className="relative min-h-0 flex-1">
          <MapCanvas />
          <SimulationBar />
        </main>
      </div>
    </div>
  )
}
