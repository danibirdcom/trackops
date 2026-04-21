import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { useUiStore } from '@/stores/uiStore'

type NominatimResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  boundingbox?: string[]
  type?: string
  class?: string
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const MIN_QUERY = 3
const DEBOUNCE_MS = 450

export default function AddressSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestFlyTo = useUiStore((s) => s.requestFlyTo)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY) {
      setResults([])
      setError(null)
      return
    }
    const handle = setTimeout(() => {
      void runSearch(trimmed)
    }, DEBOUNCE_MS)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  const runSearch = async (q: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        q,
        format: 'json',
        addressdetails: '0',
        limit: '6',
      })
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
        signal: ctrl.signal,
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`)
      const data = (await res.json()) as NominatimResult[]
      setResults(data)
      setOpen(true)
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Error en la búsqueda')
    } finally {
      setLoading(false)
    }
  }

  const pick = (r: NominatimResult) => {
    const lat = Number(r.lat)
    const lon = Number(r.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    requestFlyTo([lat, lon], 15)
    setOpen(false)
    setQuery(r.display_name.split(',')[0] ?? r.display_name)
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-xs">
      <div className="flex items-center rounded-md border border-border bg-background">
        <Search className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true)
          }}
          placeholder="Buscar dirección…"
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs outline-none"
          aria-label="Buscar dirección"
        />
        {loading ? (
          <Loader2 className="mr-2 size-3.5 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResults([])
              setOpen(false)
            }}
            className="mr-1 rounded-sm p-1 text-muted-foreground hover:bg-accent"
            aria-label="Limpiar"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
      {open && (results.length > 0 || error) && (
        <ul className="absolute left-0 right-0 z-[1000] mt-1 max-h-72 overflow-auto rounded-md border border-border bg-background shadow-md">
          {error ? (
            <li className="px-2 py-1.5 text-[11px] text-destructive">{error}</li>
          ) : (
            results.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-accent"
                  title={r.display_name}
                >
                  {r.display_name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
