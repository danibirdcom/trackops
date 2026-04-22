import { useEffect, useState } from 'react'
import { X, Lock, Unlock, LogOut, Check, AlertTriangle } from 'lucide-react'
import { useSyncStore } from '@/stores/syncStore'
import type { Project } from '@/lib/types'

type Props = {
  project: Project
  onClose: () => void
}

export default function SecurityDialog({ project, onClose }: Props) {
  const syncEnabled = useSyncStore((s) => s.enabled)
  const remoteList = useSyncStore((s) => s.remoteList)
  const listRemote = useSyncStore((s) => s.listRemote)
  const getSessionToken = useSyncStore((s) => s.getSessionToken)
  const setProjectPassword = useSyncStore((s) => s.setProjectPassword)
  const clearProjectPassword = useSyncStore((s) => s.clearProjectPassword)
  const logout = useSyncStore((s) => s.logout)
  const login = useSyncStore((s) => s.login)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loginPassword, setLoginPassword] = useState('')

  const remote = remoteList.find((r) => r.id === project.id)
  const isProtected = Boolean(remote?.protected)
  const hasSession = Boolean(getSessionToken(project.id))

  useEffect(() => {
    if (syncEnabled) void listRemote()
  }, [syncEnabled, listRemote])

  if (!syncEnabled) {
    return (
      <Modal onClose={onClose}>
        <Header title="Seguridad" onClose={onClose} />
        <div className="p-4 text-sm">
          <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5" /> Este dispositivo no está conectado al servidor, así que la
            contraseña no se puede gestionar. Abre la app desde el subdominio donde está desplegado TrackOps.
          </p>
        </div>
      </Modal>
    )
  }

  const handleSet = async () => {
    setError(null)
    setSuccess(null)
    if (newPassword.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres.')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (isProtected && !hasSession && !currentPassword) {
      setError('Introduce la contraseña actual para cambiarla.')
      return
    }
    setBusy(true)
    try {
      await setProjectPassword(
        project.id,
        newPassword,
        isProtected && !hasSession ? currentPassword : undefined,
      )
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
      setSuccess(isProtected ? 'Contraseña actualizada.' : 'Contraseña establecida. Ahora el proyecto está protegido.')
      await listRemote()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('¿Quitar la contraseña del proyecto? Cualquiera podrá editarlo sin autenticarse.')) return
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      await clearProjectPassword(project.id)
      setSuccess('Contraseña eliminada. El proyecto queda abierto.')
      await listRemote()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la contraseña.')
    } finally {
      setBusy(false)
    }
  }

  const handleLogin = async () => {
    setError(null)
    setBusy(true)
    try {
      await login(project.id, loginPassword)
      setSuccess('Sesión iniciada. Ya puedes editar o cambiar la contraseña.')
      setLoginPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Contraseña incorrecta.')
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = () => {
    logout(project.id)
    setSuccess('Sesión cerrada en este dispositivo.')
  }

  return (
    <Modal onClose={onClose}>
      <Header title="Seguridad del proyecto" onClose={onClose} />
      <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs">
          {isProtected ? (
            <Lock className="size-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Unlock className="size-4 text-muted-foreground" />
          )}
          <div className="flex-1">
            <p className="font-medium">{isProtected ? 'Proyecto protegido' : 'Proyecto abierto'}</p>
            <p className="text-[11px] text-muted-foreground">
              {isProtected
                ? hasSession
                  ? 'Tienes sesión activa — puedes editar, cambiar la contraseña o quitarla.'
                  : 'Sin sesión: introduce la contraseña para poder cambiarla.'
                : 'Cualquiera que acceda al enlace puede editar. Pon una contraseña si quieres limitarlo.'}
            </p>
          </div>
          {hasSession && (
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent"
              title="Cerrar sesión en este dispositivo"
            >
              <LogOut className="size-3" /> Cerrar
            </button>
          )}
        </div>

        {success && (
          <p className="flex items-start gap-2 rounded-md bg-emerald-500/10 p-2 text-xs text-emerald-700 dark:text-emerald-400">
            <Check className="mt-0.5 size-3.5" /> {success}
          </p>
        )}
        {error && (
          <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5" /> {error}
          </p>
        )}

        {isProtected && !hasSession && (
          <section className="rounded-md border border-border p-3">
            <p className="mb-2 font-medium">Iniciar sesión</p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleLogin()
              }}
              className="flex flex-col gap-2 text-xs"
            >
              <input
                type="password"
                className="rounded-md border border-border bg-background px-2 py-1.5"
                placeholder="Contraseña actual"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                disabled={busy || loginPassword.length === 0}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          </section>
        )}

        <section className="rounded-md border border-border p-3">
          <p className="mb-2 font-medium">
            {isProtected ? 'Cambiar contraseña' : 'Proteger con contraseña'}
          </p>
          <div className="flex flex-col gap-2 text-xs">
            {isProtected && !hasSession && (
              <input
                type="password"
                className="rounded-md border border-border bg-background px-2 py-1.5"
                placeholder="Contraseña actual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            )}
            <input
              type="password"
              className="rounded-md border border-border bg-background px-2 py-1.5"
              placeholder="Nueva contraseña (mín. 4 caracteres)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              className="rounded-md border border-border bg-background px-2 py-1.5"
              placeholder="Repite la nueva contraseña"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
            />
            <button
              type="button"
              onClick={handleSet}
              disabled={busy || newPassword.length < 4 || newPassword !== newPasswordConfirm}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? 'Guardando…' : isProtected ? 'Cambiar' : 'Establecer'}
            </button>
          </div>
        </section>

        {isProtected && hasSession && (
          <section className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="mb-1 font-medium text-destructive">Quitar contraseña</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              El proyecto pasará a ser editable sin autenticación. Úsalo solo si vas a cerrar el evento.
            </p>
            <button
              type="button"
              onClick={handleClear}
              disabled={busy}
              className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              Quitar contraseña
            </button>
          </section>
        )}
      </div>
    </Modal>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <header className="flex items-center gap-2 border-b border-border p-3">
      <Lock className="size-4 text-muted-foreground" />
      <p className="flex-1 text-sm font-semibold">{title}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 hover:bg-accent"
        aria-label="Cerrar"
      >
        <X className="size-4" />
      </button>
    </header>
  )
}
