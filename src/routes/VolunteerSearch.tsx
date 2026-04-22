import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Search, X, ArrowLeft, User } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { getProject } from '@/lib/storage/dexie'

function normalise(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export default function VolunteerSearch() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const current = useProjectStore((s) => s.current)
  const setProject = useProjectStore((s) => s.setProject)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      const p = await getProject(projectId)
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
    }
  }, [projectId, setProject])

  const results = useMemo(() => {
    if (!current) return []
    const q = normalise(query)
    const list = [...current.volunteers].sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    )
    if (!q) return list
    return list.filter((v) => normalise(v.name).includes(q) || normalise(v.role).includes(q))
  }, [current, query])

  if (loading) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Cargando…</div>
  }
  if (notFound || !current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Proyecto no encontrado.</p>
        <Link to="/" className="rounded-md border border-border px-3 py-1.5 text-sm">
          Volver al inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        <Link to="/" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent" aria-label="Inicio">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">{current.name}</span>
          <span className="text-[11px] text-muted-foreground">Busca tu nombre para ver tu asignación</span>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-xl p-4">
          <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
            <Search className="size-4 text-muted-foreground" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre o apellidos…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label="Buscar voluntario"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded-sm p-1 text-muted-foreground hover:bg-accent"
                aria-label="Limpiar"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {current.volunteers.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Este proyecto todavía no tiene voluntarios.
            </p>
          ) : results.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Ninguna coincidencia con "{query}".
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/volunteer/${projectId}/${v.id}`)}
                    className="flex w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left hover:bg-accent"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
                      <User className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate font-medium">{v.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {v.role || 'Sin rol asignado'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
