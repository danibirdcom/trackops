import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Shield,
  LogOut,
  Trash2,
  ArrowLeft,
  AlertTriangle,
  Lock,
  Unlock,
  Cloud,
  KeyRound,
  RefreshCw,
} from 'lucide-react'
import { useSyncStore } from '@/stores/syncStore'
import { useProjectStore } from '@/stores/projectStore'
import { saveProject, deleteProject } from '@/lib/storage/dexie'
import type { RemoteProjectSummary } from '@/lib/sync/types'
import { cn } from '@/lib/utils'

export default function Admin() {
  const navigate = useNavigate()
  const syncEnabled = useSyncStore((s) => s.enabled)
  const masterToken = useSyncStore((s) => s.masterToken)
  const remoteList = useSyncStore((s) => s.remoteList)
  const listRemote = useSyncStore((s) => s.listRemote)
  const loginAsAdmin = useSyncStore((s) => s.loginAsAdmin)
  const logoutAdmin = useSyncStore((s) => s.logoutAdmin)
  const removeRemote = useSyncStore((s) => s.removeRemote)
  const pullNow = useSyncStore((s) => s.pullNow)
  const setProjectPassword = useSyncStore((s) => s.setProjectPassword)
  const clearProjectPassword = useSyncStore((s) => s.clearProjectPassword)
  const setProject = useProjectStore((s) => s.setProject)

  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (masterToken && syncEnabled) void listRemote()
  }, [masterToken, syncEnabled, listRemote])

  if (!syncEnabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-8 text-amber-500" />
        <p className="max-w-md text-sm">
          Este dispositivo no está conectado al servidor. El modo administrador solo tiene sentido
          contra el backend desplegado.
        </p>
        <Link to="/" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          <ArrowLeft className="inline size-3.5" /> Volver
        </Link>
      </div>
    )
  }

  if (!masterToken) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
        <form
          className="w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-sm"
          onSubmit={async (e) => {
            e.preventDefault()
            setError(null)
            setBusy(true)
            try {
              const ok = await loginAsAdmin(token)
              if (!ok) setError('Token inválido.')
              else setToken('')
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Error autenticando')
            } finally {
              setBusy(false)
            }
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <Shield className="size-5 text-destructive" />
            <p className="text-base font-semibold">Modo administrador</p>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Introduce el token definido en <code>TRACKOPS_ADMIN_TOKEN</code>. Permite saltarse las
            contraseñas de proyecto para operaciones de mantenimiento.
          </p>
          <input
            autoFocus
            type="password"
            className="mb-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token"
            autoComplete="off"
          />
          {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
          <div className="flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              <ArrowLeft className="size-3" /> Cancelar
            </Link>
            <button
              type="submit"
              disabled={busy || token.length === 0}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? 'Verificando…' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
        <Shield className="size-4 text-destructive" />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="text-sm font-semibold">Administrador</span>
          <span className="text-[11px] text-muted-foreground">
            Saltas cualquier contraseña de proyecto. Actúa con cuidado.
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            logoutAdmin()
            setNotice('Sesión de administrador cerrada en este dispositivo.')
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          <LogOut className="size-3" /> Salir
        </button>
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
        >
          <ArrowLeft className="size-3" /> Inicio
        </Link>
      </header>

      <main className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          {notice && (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              {notice}
            </p>
          )}
          {error && (
            <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5" /> {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">Todos los proyectos</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
              <Cloud className="size-3" /> Admin
            </span>
            <button
              type="button"
              onClick={() => void listRemote()}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
            >
              <RefreshCw className="size-3" /> Actualizar
            </button>
          </div>

          {remoteList.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              El servidor no tiene proyectos publicados.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {remoteList.map((p) => (
                <AdminProjectRow
                  key={p.id}
                  project={p}
                  busy={busy}
                  onOpen={async () => {
                    setError(null)
                    setBusy(true)
                    try {
                      const fresh = await pullNow(p.id)
                      if (!fresh) throw new Error('No se pudo descargar')
                      await saveProject(fresh)
                      setProject(fresh)
                      navigate(`/project/${p.id}`)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error abriendo proyecto')
                    } finally {
                      setBusy(false)
                    }
                  }}
                  onDelete={async () => {
                    if (!confirm(`¿Borrar "${p.name}" del servidor y de este dispositivo?`)) return
                    setError(null)
                    setBusy(true)
                    try {
                      await removeRemote(p.id)
                      await deleteProject(p.id).catch(() => undefined)
                      await listRemote()
                      setNotice(`"${p.name}" eliminado.`)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error eliminando')
                    } finally {
                      setBusy(false)
                    }
                  }}
                  onUnprotect={async () => {
                    if (!confirm(`¿Quitar la contraseña a "${p.name}"? Será editable sin auth.`)) return
                    setError(null)
                    setBusy(true)
                    try {
                      await clearProjectPassword(p.id)
                      await listRemote()
                      setNotice(`Contraseña eliminada en "${p.name}".`)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error')
                    } finally {
                      setBusy(false)
                    }
                  }}
                  onResetPassword={async (newPw) => {
                    setError(null)
                    setBusy(true)
                    try {
                      await setProjectPassword(p.id, newPw)
                      await listRemote()
                      setNotice(`Contraseña actualizada en "${p.name}".`)
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Error')
                    } finally {
                      setBusy(false)
                    }
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

type RowProps = {
  project: RemoteProjectSummary
  busy: boolean
  onOpen: () => void | Promise<void>
  onDelete: () => void | Promise<void>
  onUnprotect: () => void | Promise<void>
  onResetPassword: (newPw: string) => void | Promise<void>
}

function AdminProjectRow({ project, busy, onOpen, onDelete, onUnprotect, onResetPassword }: RowProps) {
  const [pwOpen, setPwOpen] = useState(false)
  const [newPw, setNewPw] = useState('')

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex items-center gap-2 truncate font-medium">
          {project.name}
          {project.protected ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
              title="Proyecto protegido con contraseña"
            >
              <Lock className="size-3" /> Protegido
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title="Proyecto sin contraseña"
            >
              <Unlock className="size-3" /> Abierto
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {project.eventDate ? new Date(project.eventDate).toLocaleDateString('es-ES') : 'Sin fecha'} ·{' '}
          {project.trackCount ?? 0} tracks · {project.volunteerCount ?? 0} voluntarios ·{' '}
          {(project.size / 1024).toFixed(1)} KB
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => void onOpen()}
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50',
          )}
        >
          Abrir
        </button>
        <button
          type="button"
          onClick={() => setPwOpen((v) => !v)}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          title="Cambiar contraseña"
        >
          <KeyRound className="size-3" /> {project.protected ? 'Cambiar' : 'Proteger'}
        </button>
        {project.protected && (
          <button
            type="button"
            onClick={() => void onUnprotect()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            title="Quitar contraseña"
          >
            <Unlock className="size-3" /> Abrir
          </button>
        )}
        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="size-3" /> Borrar
        </button>
      </div>

      {pwOpen && (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (newPw.length < 4) return
            await onResetPassword(newPw)
            setNewPw('')
            setPwOpen(false)
          }}
          className="flex w-full flex-col gap-2 rounded-md border border-border bg-muted/30 p-2 sm:flex-row sm:items-center"
        >
          <input
            type="password"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            placeholder="Nueva contraseña (mín. 4)"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || newPw.length < 4}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Guardar
          </button>
        </form>
      )}
    </li>
  )
}
