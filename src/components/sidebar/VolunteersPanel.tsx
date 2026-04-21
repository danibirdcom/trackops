import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Plus, Trash2, Pencil, Upload, ArrowDownAZ, ArrowUpZA } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import type { Point, PointType, Track, Volunteer } from '@/lib/types'
import { parseVolunteersCsv, type CsvVolunteerRow } from '@/lib/parsers/csv'
import { POINT_TYPES, POINT_TYPE_LABELS } from '@/lib/pointTypes'
import { positionAtKm } from '@/lib/geo/positionAtKm'
import { cn } from '@/lib/utils'

type Draft = Omit<Volunteer, 'id'>

const EMPTY: Draft = {
  name: '',
  phone: null,
  email: null,
  role: '',
  shirtSize: null,
  notes: '',
}

export default function VolunteersPanel() {
  const current = useProjectStore((s) => s.current)
  const addVolunteer = useProjectStore((s) => s.addVolunteer)
  const updateVolunteer = useProjectStore((s) => s.updateVolunteer)
  const removeVolunteer = useProjectStore((s) => s.removeVolunteer)
  const clearVolunteers = useProjectStore((s) => s.clearVolunteers)
  const addPoint = useProjectStore((s) => s.addPoint)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [showForm, setShowForm] = useState(false)
  const [importFeedback, setImportFeedback] = useState<string | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const csvInput = useRef<HTMLInputElement>(null)

  if (!current) return null

  const handleCsv = async (file: File) => {
    setImportFeedback(null)
    setImportErrors([])
    try {
      const text = await file.text()
      const rows = parseVolunteersCsv(text)
      if (rows.length === 0) {
        setImportFeedback('No se ha importado nada: ¿tiene el CSV una columna "nombre"?')
        return
      }
      const withAssignment = rows.filter((r) => r.track && r.km !== null).length
      const message =
        withAssignment > 0
          ? `Importar ${rows.length} voluntario${rows.length === 1 ? '' : 's'} (${withAssignment} con punto asignado) desde ${file.name}?`
          : `Importar ${rows.length} voluntario${rows.length === 1 ? '' : 's'} desde ${file.name}?`
      if (!confirm(message)) return

      const tracks = current.tracks
      const errors: string[] = []
      let volunteersAdded = 0
      let pointsCreated = 0
      let volunteersAssigned = 0

      for (const row of rows) {
        const volunteerId = nanoid(10)
        addVolunteer({
          id: volunteerId,
          name: row.name,
          phone: row.phone,
          email: row.email,
          role: row.role,
          shirtSize: row.shirtSize,
          notes: row.notes,
        })
        volunteersAdded += 1

        if (!row.track && row.km === null) continue

        const track = resolveTrack(tracks, row.track)
        if (!track) {
          errors.push(rowError(row, `track "${row.track ?? '—'}" no encontrado`))
          continue
        }
        if (row.km === null) {
          errors.push(rowError(row, 'falta la columna km'))
          continue
        }
        const coords = positionAtKm(track.geojson, row.km)
        if (!coords) {
          errors.push(rowError(row, `km ${row.km} fuera del recorrido`))
          continue
        }
        const type = resolvePointType(row.pointType)
        const pointName =
          row.pointName?.trim() ||
          `${POINT_TYPE_LABELS[type]} km ${row.km.toFixed(1)}`
        const point: Point = {
          id: nanoid(10),
          name: pointName,
          type,
          coordinates: coords,
          sectorId: null,
          volunteerIds: [volunteerId],
          description: '',
          kmMark: row.km,
        }
        addPoint(point)
        pointsCreated += 1
        volunteersAssigned += 1
      }

      const parts = [
        `Voluntarios importados: ${volunteersAdded}`,
        pointsCreated > 0 ? `puntos creados: ${pointsCreated}` : '',
        volunteersAssigned > 0 ? `asignados: ${volunteersAssigned}` : '',
      ].filter(Boolean)
      setImportFeedback(parts.join(' · '))
      setImportErrors(errors)
    } catch (e) {
      setImportFeedback(e instanceof Error ? e.message : 'Error leyendo CSV')
    }
  }

  const startEdit = (v: Volunteer) => {
    setEditingId(v.id)
    setDraft({
      name: v.name,
      phone: v.phone,
      email: v.email,
      role: v.role,
      shirtSize: v.shirtSize,
      notes: v.notes,
    })
    setShowForm(true)
  }

  const cancel = () => {
    setEditingId(null)
    setDraft(EMPTY)
    setShowForm(false)
  }

  const save = () => {
    if (!draft.name.trim()) return
    if (editingId) {
      updateVolunteer(editingId, draft)
    } else {
      addVolunteer({ ...draft, id: nanoid(10) })
    }
    cancel()
  }

  const assignmentsFor = (id: string) => {
    const points = current.points.filter((pt) => pt.volunteerIds.includes(id))
    return points.length
  }

  return (
    <div className="flex h-full flex-col gap-3">
      {showForm ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2 text-xs">
          <p className="font-medium">{editingId ? 'Editar voluntario' : 'Nuevo voluntario'}</p>
          <input
            className={inputCls}
            placeholder="Nombre *"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="Rol (ej. Jefe de sector)"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputCls}
              placeholder="Teléfono"
              value={draft.phone ?? ''}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value || null })}
            />
            <input
              className={inputCls}
              placeholder="Email"
              type="email"
              value={draft.email ?? ''}
              onChange={(e) => setDraft({ ...draft, email: e.target.value || null })}
            />
          </div>
          <input
            className={inputCls}
            placeholder="Talla"
            value={draft.shirtSize ?? ''}
            onChange={(e) => setDraft({ ...draft, shirtSize: e.target.value || null })}
          />
          <textarea
            className={cn(inputCls, 'min-h-[3rem] resize-y')}
            placeholder="Notas"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!draft.name.trim()}
              className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-md border border-border px-3 py-1.5 text-xs"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-3.5" /> Nuevo voluntario
          </button>
          <button
            type="button"
            onClick={() => csvInput.current?.click()}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            <Upload className="size-3.5" /> Importar CSV
          </button>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleCsv(file)
              e.target.value = ''
            }}
          />
          {importFeedback && (
            <p className="text-[11px] text-muted-foreground" role="status">
              {importFeedback}
            </p>
          )}
          {importErrors.length > 0 && (
            <details className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
              <summary className="cursor-pointer">
                {importErrors.length} aviso{importErrors.length === 1 ? '' : 's'} al importar
              </summary>
              <ul className="mt-1 max-h-32 list-disc overflow-auto pl-4">
                {importErrors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-[10px] text-muted-foreground">
            Columnas: <strong>nombre</strong> (obligatoria), teléfono, email, rol, talla, notas, track, km,
            punto, tipo. Con <em>track</em> (nombre o id) y <em>km</em>, crea un punto en esa posición
            exacta y asigna el voluntario automáticamente.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-xs font-medium">Voluntarios ({current.volunteers.length})</p>
          <div className="flex items-center gap-1">
            {current.volunteers.length > 1 && (
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-accent"
                title={sortDir === 'asc' ? 'Ordenar Z→A' : 'Ordenar A→Z'}
                aria-label="Cambiar orden alfabético"
              >
                {sortDir === 'asc' ? <ArrowDownAZ className="size-3" /> : <ArrowUpZA className="size-3" />}
                {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
              </button>
            )}
            {current.volunteers.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const n = current.volunteers.length
                  const ok = confirm(
                    `¿Eliminar los ${n} voluntarios? Se quitarán también de los puntos y sectores asignados. Esta acción no se puede deshacer.`,
                  )
                  if (ok) clearVolunteers()
                }}
                className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10"
                title="Eliminar todos los voluntarios"
                aria-label="Eliminar todos los voluntarios"
              >
                <Trash2 className="size-3" />
                Vaciar
              </button>
            )}
          </div>
        </div>
        {current.volunteers.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay voluntarios.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {[...current.volunteers]
              .sort((a, b) => {
                const cmp = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
                return sortDir === 'asc' ? cmp : -cmp
              })
              .map((v) => (
                <li key={v.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-xs">
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate font-medium">{v.name}</p>
                    <p className="truncate text-muted-foreground">
                      {v.role || 'Sin rol'} · {assignmentsFor(v.id)} pts
                    </p>
                    {(v.phone || v.email) && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {v.phone ?? ''}{v.phone && v.email ? ' · ' : ''}{v.email ?? ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(v)}
                    className="rounded-md p-1 hover:bg-accent"
                    aria-label="Editar"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`¿Eliminar a ${v.name}?`)) removeVolunteer(v.id)
                    }}
                    className="rounded-md p-1 text-destructive hover:bg-destructive/10"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const inputCls =
  'rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary'

function normaliseToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function resolveTrack(tracks: Track[], hint: string | null): Track | null {
  if (!hint) return null
  const needle = normaliseToken(hint)
  if (!needle) return null
  return (
    tracks.find((t) => t.id === hint) ??
    tracks.find((t) => normaliseToken(t.name) === needle) ??
    tracks.find((t) => normaliseToken(t.name).includes(needle)) ??
    null
  )
}

function resolvePointType(hint: string | null): PointType {
  if (!hint) return 'paso'
  const n = normaliseToken(hint)
  for (const t of POINT_TYPES) {
    if (normaliseToken(POINT_TYPE_LABELS[t]) === n || normaliseToken(t) === n) return t
  }
  return 'paso'
}

function rowError(row: CsvVolunteerRow, reason: string): string {
  return `Fila ${row.rowNumber} · ${row.name}: ${reason}`
}
