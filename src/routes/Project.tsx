import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Menu, Moon, ArrowLeft, Share2, Layers, WifiOff, Cloud, Play, Lock, Shield } from 'lucide-react'
import MapCanvas from '@/components/map/MapCanvas'
import Sidebar from '@/components/sidebar/Sidebar'
import PointDetails from '@/components/sidebar/PointDetails'
import ExportDialog from '@/components/dialogs/ExportDialog'
import OfflineDialog from '@/components/dialogs/OfflineDialog'
import SyncDialog from '@/components/dialogs/SyncDialog'
import SecurityDialog from '@/components/dialogs/SecurityDialog'
import SimulationBar from '@/components/SimulationBar'
import AddressSearch from '@/components/map/AddressSearch'
import { useUiStore } from '@/stores/uiStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSyncStore } from '@/stores/syncStore'
import { useSimulationStore } from '@/stores/simulationStore'
import { getProject } from '@/lib/storage/dexie'
import { aggregateRaceWindow } from '@/lib/race/simulation'

export default function Project() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode)
  const current = useProjectStore((s) => s.current)
  const setProject = useProjectStore((s) => s.setProject)
  const setMapState = useProjectStore((s) => s.setMapState)
  const selectedPointId = useProjectStore((s) => s.selectedPointId)
  const selectPoint = useProjectStore((s) => s.selectPoint)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [securityOpen, setSecurityOpen] = useState(false)
  const syncEnabled = useSyncStore((s) => s.enabled)
  const syncStatus = useSyncStore((s) => s.status)
  const syncError = useSyncStore((s) => s.statusError)
  const subscribeProject = useSyncStore((s) => s.subscribeProject)
  const unsubscribeProject = useSyncStore((s) => s.unsubscribeProject)
  const simulationActive = useSimulationStore((s) => s.active)
  const setSimulationActive = useSimulationStore((s) => s.setActive)
  const setSimulationCurrentMs = useSimulationStore((s) => s.setCurrentMs)
  const masterToken = useSyncStore((s) => s.masterToken)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const p = await getProject(id)
      if (cancelled) return
      if (p) {
        setProject(p)
        setNotFound(false)
      } else {
        setNotFound(true)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
      setProject(null)
    }
  }, [id, setProject])

  useEffect(() => {
    if (!id || !syncEnabled) return
    subscribeProject(id)
    return () => {
      unsubscribeProject()
    }
  }, [id, syncEnabled, subscribeProject, unsubscribeProject])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    )
  }

  if (notFound || !current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Proyecto no encontrado.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          Volver al inicio
        </button>
      </div>
    )
  }

  const cycleBaseLayer = () => {
    setMapState({ baseLayer: current.mapState.baseLayer === 'osm' ? 'topo' : 'osm' })
  }

  return (
    <div className="flex h-full flex-col">
      {masterToken && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1 text-[11px] text-destructive">
          <Shield className="size-3" />
          <span>Modo administrador activo en este dispositivo. Todas las acciones se ejecutan sin validación de contraseña.</span>
          <Link to="/admin" className="ml-auto underline hover:text-destructive/80">
            Panel admin
          </Link>
        </div>
      )}
      <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        <button
          type="button"
          onClick={toggleSidebar}
          className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
          aria-label={t('project.toggleSidebar')}
        >
          <Menu className="size-4" />
        </button>
        <Link to="/" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent" aria-label={t('project.back')}>
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{current.name}</span>
          <span className="text-[11px] text-muted-foreground">
            {current.eventDate ? new Date(current.eventDate).toLocaleDateString('es-ES') : 'Sin fecha'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden sm:block">
            <AddressSearch />
          </div>
          <button
            type="button"
            onClick={cycleBaseLayer}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            title={`Capa: ${current.mapState.baseLayer === 'osm' ? 'OSM' : 'Topo'}`}
            aria-label={t('project.cycleBaseLayer')}
          >
            <Layers className="size-4" />
          </button>
          {(() => {
            const window = aggregateRaceWindow(current.tracks)
            const canSimulate = Boolean(window)
            return (
              <button
                type="button"
                onClick={() => {
                  const next = !simulationActive
                  setSimulationActive(next)
                  if (next && window) setSimulationCurrentMs(window.startMs)
                }}
                disabled={!canSimulate}
                className={`inline-flex size-9 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40 ${
                  simulationActive ? 'bg-accent text-accent-foreground' : ''
                }`}
                aria-label="Simulación de carrera"
                title={
                  canSimulate
                    ? simulationActive
                      ? 'Cerrar simulación'
                      : 'Simular carrera'
                    : 'Configura hora y ritmo en al menos un track'
                }
              >
                <Play className="size-4" />
              </button>
            )
          })()}
          <button
            type="button"
            onClick={() => setOfflineOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label={t('project.openOffline')}
            title={t('project.openOffline')}
          >
            <WifiOff className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setSecurityOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Seguridad del proyecto"
            title="Contraseña del proyecto"
          >
            <Lock className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setSyncOpen(true)}
            className="relative inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Sincronización"
            title="Sincronización"
          >
            <Cloud className="size-4" />
            {syncEnabled && (
              <span
                className={`absolute right-1.5 top-1.5 size-1.5 rounded-full ${
                  syncError
                    ? 'bg-destructive'
                    : syncStatus === 'connected'
                      ? 'bg-emerald-500'
                      : syncStatus === 'connecting'
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-muted-foreground/50'
                }`}
                aria-hidden
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label={t('project.openExport')}
          >
            <Share2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label={t('project.toggleDarkMode')}
          >
            <Moon className="size-4" />
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && (
          <>
            <div
              className="absolute inset-0 z-30 bg-black/40 md:hidden"
              onClick={toggleSidebar}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 z-40 w-[85%] max-w-sm shadow-xl md:relative md:inset-auto md:z-auto md:w-auto md:max-w-none md:shadow-none">
              <Sidebar />
            </div>
          </>
        )}
        <main className="relative min-w-0 flex-1">
          <MapCanvas />
          <SimulationBar />
        </main>
        {selectedPointId && (
          <>
            <div
              className="absolute inset-0 z-30 bg-black/40 lg:hidden"
              onClick={() => selectPoint(null)}
              aria-hidden
            />
            <div className="absolute inset-y-0 right-0 z-40 w-[90%] max-w-sm shadow-xl lg:relative lg:inset-auto lg:z-auto lg:w-auto lg:max-w-none lg:shadow-none">
              <PointDetails />
            </div>
          </>
        )}
      </div>
      {exportOpen && <ExportDialog project={current} onClose={() => setExportOpen(false)} />}
      {offlineOpen && <OfflineDialog project={current} onClose={() => setOfflineOpen(false)} />}
      {syncOpen && <SyncDialog onClose={() => setSyncOpen(false)} />}
      {securityOpen && <SecurityDialog project={current} onClose={() => setSecurityOpen(false)} />}
    </div>
  )
}
