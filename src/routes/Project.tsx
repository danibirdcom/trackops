import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Menu, Moon, ArrowLeft, Share2, Layers, WifiOff, Cloud, Play, Lock, Shield, MoreVertical } from 'lucide-react'
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const syncEnabled = useSyncStore((s) => s.enabled)
  const syncStatus = useSyncStore((s) => s.status)
  const syncError = useSyncStore((s) => s.statusError)
  const subscribeProject = useSyncStore((s) => s.subscribeProject)
  const unsubscribeProject = useSyncStore((s) => s.unsubscribeProject)
  const listRemote = useSyncStore((s) => s.listRemote)
  const remoteList = useSyncStore((s) => s.remoteList)
  const getSessionToken = useSyncStore((s) => s.getSessionToken)
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

  useEffect(() => {
    if (!syncEnabled) return
    void listRemote()
  }, [syncEnabled, listRemote])

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

  const remoteMeta = remoteList.find((r) => r.id === id)
  const isProtected = Boolean(remoteMeta?.protected)
  const hasProjectAuth = Boolean(masterToken) || (id ? Boolean(getSessionToken(id)) : false)
  const needsAuth = syncEnabled && isProtected && !hasProjectAuth

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {masterToken && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1 text-[11px] text-destructive">
          <Shield className="size-3" />
          <span>Modo administrador activo en este dispositivo. Todas las acciones se ejecutan sin validación de contraseña.</span>
          <Link to="/admin" className="ml-auto underline hover:text-destructive/80">
            Panel admin
          </Link>
        </div>
      )}
      {needsAuth && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
          <Lock className="size-3.5" />
          <span className="flex-1 min-w-0">
            Este proyecto está protegido con contraseña y no has iniciado sesión en este dispositivo.
            Tus cambios <strong>no se guardarán en el servidor</strong> hasta que te autentiques.
          </span>
          <button
            type="button"
            onClick={() => setSecurityOpen(true)}
            className="rounded-md border border-amber-700/40 bg-background px-2 py-1 text-[11px] font-medium hover:bg-amber-500/10"
          >
            Iniciar sesión
          </button>
        </div>
      )}
      <header className="flex items-center gap-1 border-b border-border bg-background px-2 py-2 sm:gap-2 sm:px-3">
        <button
          type="button"
          onClick={toggleSidebar}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-accent"
          aria-label={t('project.toggleSidebar')}
        >
          <Menu className="size-4" />
        </button>
        <Link to="/" className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-accent" aria-label={t('project.back')}>
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{current.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {current.eventDate ? new Date(current.eventDate).toLocaleDateString('es-ES') : 'Sin fecha'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <div className="hidden lg:block">
            <AddressSearch />
          </div>
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
            onClick={() => setExportOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label={t('project.openExport')}
          >
            <Share2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={cycleBaseLayer}
            className="hidden size-9 items-center justify-center rounded-md hover:bg-accent sm:inline-flex"
            title={`Capa: ${current.mapState.baseLayer === 'osm' ? 'OSM' : 'Topo'}`}
            aria-label={t('project.cycleBaseLayer')}
          >
            <Layers className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setOfflineOpen(true)}
            className="hidden size-9 items-center justify-center rounded-md hover:bg-accent sm:inline-flex"
            aria-label={t('project.openOffline')}
            title={t('project.openOffline')}
          >
            <WifiOff className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setSecurityOpen(true)}
            className="hidden size-9 items-center justify-center rounded-md hover:bg-accent sm:inline-flex"
            aria-label="Seguridad del proyecto"
            title="Contraseña del proyecto"
          >
            <Lock className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setSyncOpen(true)}
            className="relative hidden size-9 items-center justify-center rounded-md hover:bg-accent sm:inline-flex"
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
            onClick={toggleDarkMode}
            className="hidden size-9 items-center justify-center rounded-md hover:bg-accent sm:inline-flex"
            aria-label={t('project.toggleDarkMode')}
          >
            <Moon className="size-4" />
          </button>
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
              aria-label="Más acciones"
            >
              <MoreVertical className="size-4" />
            </button>
            {moreMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMoreMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-border bg-background shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      cycleBaseLayer()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Layers className="size-4" /> Cambiar capa del mapa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      setOfflineOpen(true)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  >
                    <WifiOff className="size-4" /> {t('project.openOffline')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      setSecurityOpen(true)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Lock className="size-4" /> Contraseña del proyecto
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      setSyncOpen(true)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Cloud className="size-4" /> Sincronización
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false)
                      toggleDarkMode()
                    }}
                    className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                  >
                    <Moon className="size-4" /> {t('project.toggleDarkMode')}
                  </button>
                </div>
              </>
            )}
          </div>
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
