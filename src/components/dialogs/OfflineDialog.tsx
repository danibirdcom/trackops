import { useEffect, useMemo, useState } from 'react'
import { X, Download, Trash2, AlertTriangle, WifiOff, Check } from 'lucide-react'
import type { Project } from '@/lib/types'
import { boundsOf } from '@/lib/geo/bounds'
import { tilesForBoundsRange, tileUrl, fetchTilesWithProgress } from '@/lib/geo/tiles'
import { clearTileCache, getTileCacheStats } from '@/lib/sw'
import { useUiStore } from '@/stores/uiStore'

type Props = { project: Project; onClose: () => void }

const EXTRA_LEVELS = 2
const AVG_TILE_KB = 20

function buildTileUrl(tile: { z: number; x: number; y: number }, darkMode: boolean, layer: 'osm' | 'topo'): string {
  if (layer === 'topo') {
    return tileUrl('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', tile)
  }
  if (darkMode) {
    return tileUrl('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', tile, ['a', 'b', 'c', 'd'])
  }
  return tileUrl('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', tile)
}

export default function OfflineDialog({ project, onClose }: Props) {
  const darkMode = useUiStore((s) => s.darkMode)
  const [baseZoom, setBaseZoom] = useState(project.mapState.zoom)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ done: number; errors: number } | null>(null)
  const [cacheCount, setCacheCount] = useState<number | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const bounds = useMemo(
    () => boundsOf(project.tracks.map((t) => t.geojson)),
    [project.tracks],
  )

  const tiles = useMemo(() => {
    if (!bounds) return []
    return tilesForBoundsRange(bounds, baseZoom, EXTRA_LEVELS)
  }, [bounds, baseZoom])

  const estimatedKb = tiles.length * AVG_TILE_KB

  useEffect(() => {
    void refreshStats()
  }, [])

  const refreshStats = async () => {
    const count = await getTileCacheStats()
    setCacheCount(count)
  }

  const start = async () => {
    setError(null)
    setResult(null)
    if (!bounds) {
      setError('El proyecto no tiene tracks con coordenadas.')
      return
    }
    const ac = new AbortController()
    setAbortController(ac)
    setProgress({ done: 0, total: tiles.length })

    const urls = tiles.map((t) => buildTileUrl(t, darkMode, project.mapState.baseLayer))
    try {
      const res = await fetchTilesWithProgress(urls, {
        concurrency: 6,
        signal: ac.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(res)
      await refreshStats()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error descargando tiles')
    } finally {
      setAbortController(null)
    }
  }

  const stop = () => {
    abortController?.abort()
  }

  const clear = async () => {
    if (!confirm('¿Vaciar la caché de tiles?')) return
    clearTileCache()
    setTimeout(() => void refreshStats(), 300)
    setResult(null)
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <header className="flex items-center gap-2 border-b border-border p-3">
          <WifiOff className="size-4 text-muted-foreground" />
          <p className="flex-1 text-sm font-semibold">Preparar offline</p>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-accent" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
          <p className="text-muted-foreground">
            Descarga los tiles del mapa dentro del área del track para poder consultarlo sin conexión durante el evento.
            El service worker cacheará cada tesela en el navegador.
          </p>

          {!bounds ? (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-500">
              <AlertTriangle className="size-3.5" />
              Importa primero un track para calcular el área a descargar.
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Zoom base (se descargarán {EXTRA_LEVELS} niveles adicionales hacia dentro)</span>
                <input
                  type="range"
                  min={8}
                  max={17}
                  value={baseZoom}
                  onChange={(e) => setBaseZoom(Number(e.target.value))}
                  disabled={progress !== null && progress.done < progress.total}
                />
                <span className="tabular-nums">
                  Zoom {baseZoom} – {baseZoom + EXTRA_LEVELS}
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-border bg-muted/40 p-2">
                  <p className="text-muted-foreground">Teselas</p>
                  <p className="text-base font-semibold tabular-nums">{tiles.length.toLocaleString('es-ES')}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/40 p-2">
                  <p className="text-muted-foreground">Tamaño estimado</p>
                  <p className="text-base font-semibold tabular-nums">{(estimatedKb / 1024).toFixed(1)} MB</p>
                </div>
              </div>

              {tiles.length > 4000 && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  Son muchas teselas. Considera reducir el zoom base o descargar solo en WiFi.
                </div>
              )}

              {progress && (
                <div className="space-y-1 text-xs">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                    />
                  </div>
                  <p className="tabular-nums text-muted-foreground">
                    {progress.done.toLocaleString('es-ES')} / {progress.total.toLocaleString('es-ES')}
                  </p>
                </div>
              )}

              {result && (
                <p className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-500">
                  <Check className="size-3.5" />
                  Descarga completada: {result.done - result.errors} tiles nuevos · {result.errors} errores
                </p>
              )}

              {error && (
                <p className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" /> {error}
                </p>
              )}

              <div className="flex gap-2">
                {abortController ? (
                  <button
                    type="button"
                    onClick={stop}
                    className="flex-1 rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive"
                  >
                    Detener
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={start}
                    disabled={tiles.length === 0}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <Download className="size-3.5" /> Descargar teselas
                  </button>
                )}
              </div>
            </>
          )}

          <div className="border-t border-border pt-3 text-xs">
            <p className="mb-1 text-muted-foreground">Caché actual</p>
            <div className="flex items-center gap-2">
              <p className="tabular-nums">
                {cacheCount === null ? 'No disponible (service worker no activo)' : `${cacheCount.toLocaleString('es-ES')} teselas almacenadas`}
              </p>
              {cacheCount !== null && cacheCount > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent"
                >
                  <Trash2 className="size-3" /> Vaciar
                </button>
              )}
            </div>
            {cacheCount === null && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                El service worker solo se activa en el build de producción (`npm run build` + servidor HTTPS).
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
