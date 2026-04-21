import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Layers, Moon, Menu, AlertTriangle } from 'lucide-react'
import MapCanvas from '@/components/map/MapCanvas'
import LegendPanel from '@/components/sidebar/LegendPanel'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import { decodeProjectFromPayload, readPayloadFromLocationHash } from '@/lib/export/shareUrl'
import type { Project } from '@/lib/types'

export default function SharedView() {
  const setProject = useProjectStore((s) => s.setProject)
  const setReadOnly = useUiStore((s) => s.setReadOnly)
  const setMapState = useProjectStore((s) => s.setMapState)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Project | null>(null)

  useEffect(() => {
    setReadOnly(true)
    return () => {
      setReadOnly(false)
      setProject(null)
    }
  }, [setReadOnly, setProject])

  useEffect(() => {
    try {
      const payload = readPayloadFromLocationHash(window.location.hash)
      if (!payload) {
        setError('El enlace no contiene datos del proyecto.')
        return
      }
      const project = decodeProjectFromPayload(payload)
      setLoaded(project)
      setProject(project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido leer el proyecto.')
    }
  }, [setProject])

  const current = useProjectStore((s) => s.current)
  const info = useMemo(() => {
    if (!current) return null
    return {
      tracks: current.tracks.length,
      sectors: current.sectors.length,
      points: current.points.length,
      volunteers: current.volunteers.length,
    }
  }, [current])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="text-sm font-medium">{error}</p>
        <Link to="/" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          Volver al inicio
        </Link>
      </div>
    )
  }

  if (!loaded || !current) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Cargando enlace compartido…
      </div>
    )
  }

  const cycleBaseLayer = () => {
    setMapState({ baseLayer: current.mapState.baseLayer === 'osm' ? 'topo' : 'osm' })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        <button
          type="button"
          onClick={toggleSidebar}
          className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent md:hidden"
          aria-label="Mostrar u ocultar panel"
        >
          <Menu className="size-4" />
        </button>
        <Link to="/" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent" aria-label="Inicio">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex min-w-0 flex-col leading-tight">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{current.name}</span>
            <span className="inline-flex items-center rounded-full border border-border bg-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Solo lectura
            </span>
          </div>
          {info && (
            <span className="text-[11px] text-muted-foreground">
              {info.tracks} track{info.tracks === 1 ? '' : 's'} · {info.sectors} sector{info.sectors === 1 ? '' : 'es'} ·{' '}
              {info.points} punto{info.points === 1 ? '' : 's'} · {info.volunteers} voluntario{info.volunteers === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={cycleBaseLayer}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            title={`Capa: ${current.mapState.baseLayer === 'osm' ? 'OSM' : 'Topo'}`}
            aria-label="Cambiar capa base"
          >
            <Layers className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Modo oscuro"
          >
            <Moon className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <aside className="hidden h-full w-80 shrink-0 flex-col border-r border-border bg-background md:flex">
            <div className="flex-1 overflow-auto p-3">
              <LegendPanel />
            </div>
          </aside>
        )}
        <main className="relative flex-1">
          <MapCanvas />
        </main>
      </div>
    </div>
  )
}
