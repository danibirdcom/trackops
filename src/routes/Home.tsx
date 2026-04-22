import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, MapPin, Upload, Trash2, ClipboardList, UserRound, ChevronLeft } from 'lucide-react'
import { listProjects, saveProject, deleteProject } from '@/lib/storage/dexie'
import { createEmptyProject } from '@/lib/project'
import { parseProjectFile } from '@/lib/export/projectJson'
import type { Project } from '@/lib/types'
import { cn } from '@/lib/utils'

type Role = 'organizer' | 'volunteer'
const ROLE_STORAGE_KEY = 'trackops.role'

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
  const [projects, setProjects] = useState<Project[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)

  const reload = async () => {
    setProjects(await listProjects())
  }

  useEffect(() => {
    void reload()
  }, [])

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

  const submitCreate = async () => {
    if (!name.trim()) return
    const project = createEmptyProject(name.trim(), eventDate || null)
    await saveProject(project)
    navigate(`/project/${project.id}`)
  }

  const handleImport = async (file: File) => {
    setError(null)
    try {
      const text = await file.text()
      const project = parseProjectFile(text, { assignNewId: true })
      await saveProject(project)
      await reload()
      navigate(`/project/${project.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error importando archivo')
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
                  Crea o abre un evento, diseña el dispositivo operativo, gestiona sectores, puntos y voluntarios.
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
                  Busca tu nombre y consulta tu punto, tu responsable de zona, tus compañeros y qué tienes que hacer.
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
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
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{t('app.name')}</h1>
            <p className="text-sm text-muted-foreground">
              {role === 'organizer'
                ? 'Gestiona los eventos que tienes guardados en este dispositivo.'
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
                onClick={() => setCreating(true)}
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
            <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          {projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
              <MapPin className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {role === 'organizer'
                  ? 'Aún no hay proyectos. Crea el primero para empezar.'
                  : 'Aún no hay eventos disponibles en este dispositivo. Pide al organizador el enlace compartido.'}
              </p>
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-lg font-medium">
                {role === 'organizer' ? 'Proyectos recientes' : 'Eventos disponibles'}
              </h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((p) => (
                  <li
                    key={p.id}
                    className={cn(
                      'group relative rounded-lg border border-border p-4 hover:bg-accent/30',
                    )}
                  >
                    <Link
                      to={role === 'organizer' ? `/project/${p.id}` : `/volunteer/${p.id}`}
                      className="block"
                    >
                      <p className="truncate font-medium">{p.name || 'Sin nombre'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.eventDate ? new Date(p.eventDate).toLocaleDateString('es-ES') : 'Sin fecha'}
                        {' · '}
                        {p.tracks.length} tracks · {p.volunteers.length} voluntarios
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Actualizado {new Date(p.updatedAt).toLocaleString('es-ES')}
                      </p>
                    </Link>
                    {role === 'organizer' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm(`¿Eliminar el proyecto "${p.name}"?`)) {
                            await deleteProject(p.id)
                            await reload()
                          }
                        }}
                        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
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
            <label className="mb-4 block text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Fecha del evento (opcional)</span>
              <input
                type="date"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={!name.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
