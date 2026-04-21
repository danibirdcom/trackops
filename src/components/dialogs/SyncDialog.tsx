import { useEffect, useState } from 'react'
import {
  X,
  Cloud,
  CloudOff,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Users,
  Check,
} from 'lucide-react'
import { useSyncStore } from '@/stores/syncStore'
import { useProjectStore } from '@/stores/projectStore'
import { saveProject } from '@/lib/storage/dexie'
import { cn } from '@/lib/utils'

type Props = { onClose: () => void }

export default function SyncDialog({ onClose }: Props) {
  const enabled = useSyncStore((s) => s.enabled)
  const config = useSyncStore((s) => s.config)
  const status = useSyncStore((s) => s.status)
  const statusError = useSyncStore((s) => s.statusError)
  const presence = useSyncStore((s) => s.presence)
  const lastPushAt = useSyncStore((s) => s.lastPushAt)
  const lastPullAt = useSyncStore((s) => s.lastPullAt)
  const pending = useSyncStore((s) => s.pending)
  const remoteList = useSyncStore((s) => s.remoteList)

  const enable = useSyncStore((s) => s.enable)
  const disable = useSyncStore((s) => s.disable)
  const pushNow = useSyncStore((s) => s.pushNow)
  const pullNow = useSyncStore((s) => s.pullNow)
  const listRemote = useSyncStore((s) => s.listRemote)
  const removeRemote = useSyncStore((s) => s.removeRemote)

  const current = useProjectStore((s) => s.current)
  const setProject = useProjectStore((s) => s.setProject)

  const [endpoint, setEndpoint] = useState(config.endpoint)
  const [token, setToken] = useState(config.token ?? '')
  const [userName, setUserName] = useState(config.userName)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (enabled) void listRemote()
  }, [enabled, listRemote])

  const canEnable = endpoint.trim().length > 0 && userName.trim().length > 0

  const apply = () => {
    if (!canEnable) return
    enable({
      endpoint: endpoint.trim(),
      token: token.trim() || null,
      userName: userName.trim(),
    })
    setNotice('Configuración guardada. El cliente intentará conectarse en cuanto abras un proyecto.')
  }

  const disableSync = () => {
    if (!confirm('¿Desactivar la sincronización? Se conservan los proyectos locales.')) return
    disable()
    setNotice(null)
  }

  const push = async () => {
    if (!current) return
    await pushNow(current)
    await listRemote()
  }

  const pull = async () => {
    if (!current) return
    const remote = await pullNow(current.id)
    if (remote) {
      setProject(remote)
      await saveProject(remote)
      setNotice('Proyecto actualizado desde el servidor.')
    } else {
      setNotice('Este proyecto aún no existe en el servidor.')
    }
  }

  const importRemote = async (id: string) => {
    const remote = await pullNow(id)
    if (remote) {
      await saveProject(remote)
      setProject(remote)
      setNotice(`Proyecto "${remote.name}" cargado desde el servidor.`)
    }
  }

  const statusBadge = () => {
    if (!enabled) return { text: 'Desactivado', cls: 'bg-muted text-muted-foreground', Icon: CloudOff }
    if (status === 'connected') return { text: 'Conectado', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', Icon: Cloud }
    if (status === 'connecting') return { text: 'Conectando…', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', Icon: RefreshCw }
    if (status === 'error') return { text: 'Error', cls: 'bg-destructive/15 text-destructive', Icon: AlertTriangle }
    return { text: 'Desconectado', cls: 'bg-muted text-muted-foreground', Icon: CloudOff }
  }
  const badge = statusBadge()
  const BadgeIcon = badge.Icon

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <header className="flex items-center gap-2 border-b border-border p-3">
          <Cloud className="size-4 text-muted-foreground" />
          <p className="flex-1 text-sm font-semibold">Sincronización en la nube</p>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', badge.cls)}>
            <BadgeIcon className={cn('size-3', status === 'connecting' && 'animate-spin')} />
            {badge.text}
          </span>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-accent" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
          {notice && (
            <p className="flex items-start gap-2 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400">
              <Check className="mt-0.5 size-3.5" /> {notice}
            </p>
          )}
          {statusError && (
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5" /> {statusError}
            </p>
          )}

          <section className="rounded-md border border-border p-3">
            <p className="mb-2 font-medium">Conexión</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Introduce la URL de un servidor TrackOps compatible. La app es local-first: los proyectos
              siguen guardándose en IndexedDB y solo se sincronizan cuando el servidor está accesible.
            </p>
            <div className="grid gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Endpoint</span>
                <input
                  className={inputCls}
                  placeholder="https://mi-servidor.trackops.example"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Token (opcional)</span>
                  <input
                    className={inputCls}
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Tu nombre (presencia)</span>
                  <input
                    className={inputCls}
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={apply}
                disabled={!canEnable}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {enabled ? 'Actualizar conexión' : 'Activar'}
              </button>
              {enabled && (
                <button
                  type="button"
                  onClick={disableSync}
                  className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive"
                >
                  Desactivar
                </button>
              )}
            </div>
          </section>

          {enabled && (
            <>
              <section className="rounded-md border border-border p-3">
                <p className="mb-2 font-medium">Proyecto actual</p>
                {!current ? (
                  <p className="text-xs text-muted-foreground">Abre un proyecto para sincronizarlo.</p>
                ) : (
                  <>
                    <p className="truncate text-xs">
                      <span className="font-medium">{current.name}</span>
                      <span className="ml-2 text-muted-foreground">#{current.id}</span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                      Último push: {lastPushAt ? new Date(lastPushAt).toLocaleTimeString('es-ES') : '—'} ·
                      Último pull: {lastPullAt ? new Date(lastPullAt).toLocaleTimeString('es-ES') : '—'}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={push}
                        disabled={pending}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        <Upload className="size-3" /> Push
                      </button>
                      <button
                        type="button"
                        onClick={pull}
                        disabled={pending}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
                      >
                        <Download className="size-3" /> Pull
                      </button>
                    </div>
                  </>
                )}
              </section>

              {presence.length > 0 && (
                <section className="rounded-md border border-border p-3">
                  <p className="mb-2 flex items-center gap-1 font-medium">
                    <Users className="size-3.5" /> Conectados ahora ({presence.length})
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {presence.map((u) => (
                      <li
                        key={u.id}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px]"
                      >
                        <span className="size-2 rounded-full" style={{ background: u.color }} aria-hidden />
                        {u.name}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">Proyectos en el servidor</p>
                  <button
                    type="button"
                    onClick={() => void listRemote()}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  >
                    <RefreshCw className="size-3" /> Actualizar
                  </button>
                </div>
                {remoteList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay proyectos publicados.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {remoteList.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{r.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                            {new Date(r.updatedAt).toLocaleString('es-ES')} · {(r.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void importRemote(r.id)}
                          className="rounded-md border border-border p-1 hover:bg-accent"
                          aria-label="Descargar"
                          title="Descargar"
                        >
                          <Download className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (confirm(`¿Borrar "${r.name}" del servidor?`)) {
                              await removeRemote(r.id)
                            }
                          }}
                          className="rounded-md border border-destructive/40 p-1 text-destructive hover:bg-destructive/10"
                          aria-label="Borrar"
                          title="Borrar"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary'
