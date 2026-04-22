import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  MapPin,
  Upload,
  Trash2,
  ClipboardList,
  UserRound,
  ChevronLeft,
  Lock,
  Unlock,
  Cloud,
  CloudOff,
  AlertTriangle,
} from 'lucide-react'
import { listProjects, saveProject, deleteProject, getProject } from '@/lib/storage/dexie'
import { createEmptyProject } from '@/lib/project'
import { parseProjectFile } from '@/lib/export/projectJson'
import { useSyncStore } from '@/stores/syncStore'
import type { Project } from '@/lib/types'
import type { RemoteProjectSummary } from '@/lib/sync/types'
import { cn } from '@/lib/utils'

type Role = 'organizer' | 'volunteer'
const ROLE_STORAGE_KEY = 'trackops.role'

type MergedEntry = {
  id: string
  name: string
  eventDate: string | null
  updatedAt: string
  trackCount: number
  volunteerCount: number
  local: Project | null
  remote: RemoteProjectSummary | null
  protected: boolean
}

function readStoredRole(): Role | null {
  try {
    const v = localStorage.getItem(ROLE_STORAGE_KEY)
    return v === 'organizer' || v === 'volunteer' ? v : null
  } catch {
    return null
  }
}

export default function Home() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(readStoredRole)
  const [local, setLocal] = useState<Project[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [passwordPrompt, setPasswordPrompt] = useState<{ id: string; name: string } | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)

  const syncEnabled = useSyncStore((s) => s.enabled)
  const remoteList = useSyncStore((s) => s.remoteList)
  const listRemote = useSyncStore((s) => s.listRemote)
  const pullNow = useSyncStore((s) => s.pullNow)
  const pushNow = useSyncStore((s) => s.pushNow)
  const setProjectPassword = useSyncStore((s) => s.setProjectPassword)
  const login = useSyncStore((s) => s.login)
  const getSessionToken = useSyncStore((s) => s.getSessionToken)

  const reloadLocal = async () => {
    setLocal(await listProjects())
  }

  useEffect(() => {
    void reloadLocal()
  }, [])

  useEffect(() => {
    if (syncEnabled) void listRemote()
  }, [syncEnabled, listRemote])

  const chooseRole = (r: Role) => {
    setRole(r)
    try {
      localStorage.setItem(ROLE_STORAGE_KEY, r)
    } catch {
      /* ignore */
    }
  }

  const resetRole = () => {
    setRole(null)
    try {
      localStorage.removeItem(ROLE_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  const merged: MergedEntry[] = useMemo(() => {
    const byId = new Map<string, MergedEntry>()
    for (const p of local) {
      byId.set(p.id, {
        id: p.id,
        name: p.name || 'Sin nombre',
        eventDate: p.eventDate,
        updatedAt: p.updatedAt,
        trackCount: p.tracks.length,
        volunteerCount: p.volunteers.length,
        local: p,
        remote: null,
        protected: false,
      })
    }
    for (const r of remoteList) {
      const existing = byId.get(r.id)
      if (existing) {
        existing.remote = r
        existing.protected = Boolean(r.protected)
        if (r.updatedAt > existing.updatedAt) {
          existing.updatedAt = r.updatedAt
          existing.name = r.name
          existing.eventDate = r.eventDate ?? existing.eventDate
        }
      } else {
        byId.set(r.id, {
          id: r.id,
          name: r.name,
          eventDate: r.eventDate ?? null,
          updatedAt: r.updatedAt,
          trackCount: r.trackCount ?? 0,
          volunteerCount: r.volunteerCount ?? 0,
          local: null,
          remote: r,
          protected: Boolean(r.protected),
        })
      }
    }
    return [...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [local, remoteList])

  const openProject = async (entry: MergedEntry, forceReload = false) => {
    setError(null)
    let project = entry.local
    if ((!project || forceReload) && syncEnabled) {
      const remote = await pullNow(entry.id)
      if (remote) {
        await saveProject(remote)
        project = remote
        await reloadLocal()
      }
    }
    if (!project) {
      project = (await getProject(entry.id)) ?? null
    }
    if (!project) {
      setError('No se pudo abrir el proyecto.')
      return
    }
    if (role === 'organizer') {
      navigate(`/project/${project.id}`)
    } else {
      navigate(`/volunteer/${project.id}`)
    }
  }

  const handleOrganizerClick = async (entry: MergedEntry) => {
    setError(null)
    if (!entry.protected || getSessionToken(entry.id)) {
      await openProject(entry)
      return
    }
    setPasswordPrompt({ id: entry.id, name: entry.name })
    setPasswordInput('')
    setPasswordError(null)
  }

  const confirmPassword = async () => {
    if (!passwordPrompt) return
    setPasswordError(null)
    setBusy(true)
    try {
      await login(passwordPrompt.id, passwordInput)
      const entry = merged.find((m) => m.id === passwordPrompt.id)
      setPasswordPrompt(null)
      setPasswordInput('')
      if (entry) await openProject(entry)
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  const submitCreate = async () => {
    if (!name.trim()) return
    setError(null)
    setBusy(true)
    try {
      const project = createEmptyProject(name.trim(), eventDate || null)
      await saveProject(project)
      if (syncEnabled) {
        await pushNow(project)
        if (newPassword.trim().length >= 4) {
          await setProjectPassword(project.id, newPassword.trim())
        }
        await listRemote()
      }
      navigate(`/project/${project.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el proyecto')
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async (file: File) => {
    setError(null)
    setBusy(true)
    try {
      const text = await file.text()
      const project = parseProjectFile(text, { assignNewId: true })
      await saveProject(project)
      if (syncEnabled) {
        await pushNow(project)
        await listRemote()
      }
      await reloadLocal()
      navigate(`/project/${project.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error importando archivo')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (entry: MergedEntry) => {
    if (!confirm(`¿Eliminar "${entry.name}"? Se borrará de este dispositivo${entry.remote ? ' y del servidor' : ''}.`)) return
    setError(null)
    setBusy(true)
    try {
      await deleteProject(entry.id)
      if (entry.remote && syncEnabled) {
        if (entry.protected && !getSessionToken(entry.id)) {
          setError(`"${entry.name}" tiene contraseña: abre el proyecto para autenticarte antes de borrarlo.`)
        } else {
          await useSyncStore.getState().removeRemote(entry.id)
        }
      }
      await reloadLocal()
      if (syncEnabled) await listRemote()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar')
    } finally {
      setBusy(false)
    }
  }

  if (role === null) {
    return (
      <div className="flex h-full flex-col">
        <header className="border-b border-border px-6 py-5">
          <div className="mx-auto max-w-5xl">
            <h1 className="text-2xl font-semibold tracking-tight">{t('app.name')}</h1>
            <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => chooseRole('organizer')}
              className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-border bg-background p-8 text-left transition-all hover:border-primary hover:shadow-lg"
            >
              <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <ClipboardList className="size-6" />
              </span>
              <div>
                <p className="text-xl font-semibold tracking-tight">Soy organizador</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crea o abre un evento, diseña el dispositivo operativo y gestiona voluntarios. Requiere contraseña.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => chooseRole('volunteer')}
              className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-border bg-background p-8 text-left transition-all hover:border-primary hover:shadow-lg"
            >
              <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <UserRound className="size-6" />
              </span>
              <div>
                <p className="text-xl font-semibold tracking-tight">Soy voluntario</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Busca tu nombre y consulta tu punto, responsable y compañeros.
                </p>
              </div>
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetRole}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
                title="Cambiar de rol"
              >
                <ChevronLeft className="size-3" />
                {role === 'organizer' ? 'Organizador' : 'Voluntario'}
              </button>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  syncEnabled
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground',
                )}
                title={syncEnabled ? 'Sincronizado con el servidor' : 'Solo local'}
              >
                {syncEnabled ? <Cloud className="size-3" /> : <CloudOff className="size-3" />}
                {syncEnabled ? 'En la nube' : 'Solo local'}
              </span>
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{t('app.name')}</h1>
            <p className="text-sm text-muted-foreground">
              {role === 'organizer'
                ? syncEnabled
                  ? 'Los proyectos se guardan en el servidor y aparecen en cualquier dispositivo.'
                  : 'Este dispositivo no está conectado al servidor. Los proyectos solo existen localmente.'
                : 'Elige el evento para ver tu asignación.'}
            </p>
          </div>
          {role === 'organizer' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => importInput.current?.click()}
                className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
              >
                <Upload className="size-4" />
                Importar
              </button>
              <input
                ref={importInput}
                type="file"
                accept=".json,.trackops.json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleImport(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setCreating(true)
                  setName('')
                  setEventDate('')
                  setNewPassword('')
                }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-4" />
                {t('home.newProject')}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          {error && (
            <p className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              <AlertTriangle className="size-4" /> {error}
            </p>
          )}

          {merged.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
              <MapPin className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {role === 'organizer'
                  ? syncEnabled
                    ? 'Aún no hay proyectos en el servidor. Crea el primero para empezar.'
                    : 'Aún no hay proyectos. Crea el primero para empezar.'
                  : 'Aún no hay eventos disponibles.'}
              </p>
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-lg font-medium">
                {role === 'organizer' ? 'Proyectos' : 'Eventos disponibles'}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {merged.map((entry) => {
                  const hasSession = Boolean(getSessionToken(entry.id))
                  return (
                    <li
                      key={entry.id}
                      className={cn(
                        'group relative rounded-lg border border-border p-4 hover:bg-accent/30',
                      )}
                    >
                      {role === 'organizer' ? (
                        <button
                          type="button"
                          onClick={() => void handleOrganizerClick(entry)}
                          className="block w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate font-medium">{entry.name}</p>
                            {entry.protected && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                  hasSession
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                                )}
                                title={hasSession ? 'Sesión activa' : 'Requiere contraseña'}
                              >
                                {hasSession ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                                {hasSession ? 'Abierto' : 'Protegido'}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.eventDate ? new Date(entry.eventDate).toLocaleDateString('es-ES') : 'Sin fecha'}
                            {' · '}
                            {entry.trackCount} tracks · {entry.volunteerCount} voluntarios
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Actualizado {new Date(entry.updatedAt).toLocaleString('es-ES')}
                          </p>
                        </button>
                      ) : (
                        <Link to={`/volunteer/${entry.id}`} className="block">
                          <p className="truncate font-medium">{entry.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.eventDate ? new Date(entry.eventDate).toLocaleDateString('es-ES') : 'Sin fecha'}
                            {' · '}
                            {entry.trackCount} tracks · {entry.volunteerCount} voluntarios
                          </p>
                        </Link>
                      )}
                      {role === 'organizer' && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry)}
                          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                          aria-label="Eliminar"
                          disabled={busy}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </main>

      {creating && role === 'organizer' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setCreating(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-base font-semibold">Nuevo proyecto</h3>
            <label className="mb-2 block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Nombre</span>
              <input
                autoFocus
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Media Maratón Zaragoza 2026"
              />
            </label>
            <label className="mb-2 block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Fecha del evento (opcional)</span>
              <input
                type="date"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </label>
            {syncEnabled && (
              <label className="mb-4 block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Contraseña para editar (mínimo 4 caracteres, opcional)
                </span>
                <input
                  type="password"
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Déjalo en blanco para crear un proyecto abierto"
                />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm"
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={busy || !name.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setPasswordPrompt(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void confirmPassword()
            }}
            className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-base font-semibold">Contraseña requerida</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Introduce la contraseña para abrir "{passwordPrompt.name}" como organizador.
            </p>
            <input
              autoFocus
              type="password"
              className="mb-3 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Contraseña"
            />
            {passwordError && (
              <p className="mb-2 text-xs text-destructive">{passwordError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasswordPrompt(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm"
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || passwordInput.length === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
