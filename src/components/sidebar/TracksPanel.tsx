import { useRef, useState } from 'react'
import { Upload, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, Timer, ChevronDown, ChevronRight } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { detectFormat, featureCollectionToTracks, parseTrackFile } from '@/lib/parsers'
import { totalDistanceKm } from '@/lib/geo/distance'
import { trackLatLngs } from '@/lib/geo/kmAlongTrack'
import { elevationStats } from '@/lib/geo/elevation'
import { formatPace } from '@/lib/race/simulation'
import type { RaceConfig, Track } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function TracksPanel() {
  const current = useProjectStore((s) => s.current)
  const addTrack = useProjectStore((s) => s.addTrack)
  const updateTrack = useProjectStore((s) => s.updateTrack)
  const removeTrack = useProjectStore((s) => s.removeTrack)
  const reorderTracks = useProjectStore((s) => s.reorderTracks)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [raceOpen, setRaceOpen] = useState<Record<string, boolean>>({})
  const fileInput = useRef<HTMLInputElement>(null)

  if (!current) return null

  const handleFiles = async (files: FileList | File[]) => {
    setError(null)
    const existingCount = current.tracks.length
    let added = 0
    for (const file of Array.from(files)) {
      const format = detectFormat(file.name)
      if (!format) {
        setError(`Archivo no soportado: ${file.name}`)
        continue
      }
      try {
        const text = await file.text()
        const fc = parseTrackFile(file.name, text)
        if (fc.features.length === 0) {
          setError(`${file.name} no contiene trazas.`)
          continue
        }
        const tracks = featureCollectionToTracks(
          fc,
          { name: file.name, type: format },
          existingCount + added,
        )
        for (const track of tracks) {
          addTrack(track)
          added += 1
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : `Error importando ${file.name}`)
      }
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-md border border-dashed px-3 py-4 text-center text-xs transition-colors',
          dragOver ? 'border-primary bg-accent' : 'border-border bg-muted/30',
        )}
      >
        <Upload className="mx-auto mb-1 size-4 text-muted-foreground" />
        <p className="text-muted-foreground">Arrastra KML o GPX aquí</p>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-2 text-[11px] font-medium underline underline-offset-4"
        >
          o selecciona un archivo
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".kml,.gpx"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-auto">
        {current.tracks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay tracks.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {current.tracks.map((track, idx) => {
              const km = totalDistanceKm(trackLatLngs(track.geojson))
              const elev = elevationStats(track.geojson)
              return (
                <li key={track.id} className="rounded-md border border-border p-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={track.color}
                      onChange={(e) => updateTrack(track.id, { color: e.target.value })}
                      className="size-6 cursor-pointer rounded border border-border bg-transparent"
                      aria-label="Color del track"
                    />
                    <input
                      type="text"
                      value={track.name}
                      onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded-sm bg-transparent text-sm font-medium outline-none focus:bg-muted"
                    />
                    <button
                      type="button"
                      onClick={() => updateTrack(track.id, { visible: !track.visible })}
                      className="rounded-md p-1 hover:bg-accent"
                      aria-label={track.visible ? 'Ocultar' : 'Mostrar'}
                    >
                      {track.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{km.toFixed(2)} km</span>
                    {elev.hasElevation && (
                      <span className="tabular-nums" title="Desnivel positivo / negativo">
                        ▲ {elev.gain} m · ▼ {elev.loss} m
                      </span>
                    )}
                    {elev.hasElevation && elev.min !== null && elev.max !== null && (
                      <span className="tabular-nums" title="Altitud mínima / máxima">
                        {elev.min}–{elev.max} m
                      </span>
                    )}
                    <label className="ml-auto flex items-center gap-1">
                      Grosor
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={track.width}
                        onChange={(e) => updateTrack(track.id, { width: Number(e.target.value) })}
                        className="w-16"
                      />
                      <span className="tabular-nums">{track.width}</span>
                    </label>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === 0) return
                        const other = current.tracks[idx - 1]
                        if (!other) return
                        reorderTracks([
                          ...current.tracks.slice(0, idx - 1).map((t) => t.id),
                          track.id,
                          other.id,
                          ...current.tracks.slice(idx + 1).map((t) => t.id),
                        ])
                      }}
                      disabled={idx === 0}
                      className="rounded-md p-1 hover:bg-accent disabled:opacity-30"
                      aria-label="Subir"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (idx === current.tracks.length - 1) return
                        const other = current.tracks[idx + 1]
                        if (!other) return
                        reorderTracks([
                          ...current.tracks.slice(0, idx).map((t) => t.id),
                          other.id,
                          track.id,
                          ...current.tracks.slice(idx + 2).map((t) => t.id),
                        ])
                      }}
                      disabled={idx === current.tracks.length - 1}
                      className="rounded-md p-1 hover:bg-accent disabled:opacity-30"
                      aria-label="Bajar"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeTrack(track.id)}
                      className="ml-auto rounded-md p-1 text-destructive hover:bg-destructive/10"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRaceOpen((s) => ({ ...s, [track.id]: !s[track.id] }))
                    }
                    className="mt-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
                  >
                    {raceOpen[track.id] ? (
                      <ChevronDown className="size-3" />
                    ) : (
                      <ChevronRight className="size-3" />
                    )}
                    <Timer className="size-3" />
                    Horarios de carrera
                    {track.race?.startTime && (
                      <span className="ml-1 tabular-nums">
                        · salida {new Date(track.race.startTime).toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </button>
                  {raceOpen[track.id] && (
                    <RaceConfigForm
                      track={track}
                      onChange={(race) => updateTrack(track.id, { race })}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function RaceConfigForm({
  track,
  onChange,
}: {
  track: Track
  onChange: (race: RaceConfig) => void
}) {
  const race = track.race ?? { startTime: null, leaderPaceMinPerKm: null, trailerPaceMinPerKm: null }
  const totalKm = totalDistanceKm(trackLatLngs(track.geojson))
  const leaderFinishMs =
    race.startTime && race.leaderPaceMinPerKm
      ? Date.parse(race.startTime) + totalKm * race.leaderPaceMinPerKm * 60_000
      : null
  const trailerFinishMs =
    race.startTime && race.trailerPaceMinPerKm
      ? Date.parse(race.startTime) + totalKm * race.trailerPaceMinPerKm * 60_000
      : null

  const toLocalInput = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-2 text-[11px]">
      <label className="flex flex-col gap-0.5">
        <span className="text-muted-foreground">Hora de salida</span>
        <input
          type="datetime-local"
          className="rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary"
          value={toLocalInput(race.startTime)}
          onChange={(e) => {
            const v = e.target.value
            onChange({ ...race, startTime: v ? new Date(v).toISOString() : null })
          }}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Ritmo 1º (min/km)</span>
          <input
            type="number"
            step={0.1}
            min={0}
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary"
            value={race.leaderPaceMinPerKm ?? ''}
            placeholder="4.0"
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              onChange({ ...race, leaderPaceMinPerKm: Number.isFinite(v) ? (v as number) : null })
            }}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Ritmo último (min/km)</span>
          <input
            type="number"
            step={0.1}
            min={0}
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary"
            value={race.trailerPaceMinPerKm ?? ''}
            placeholder="8.0"
            onChange={(e) => {
              const v = e.target.value === '' ? null : Number(e.target.value)
              onChange({ ...race, trailerPaceMinPerKm: Number.isFinite(v) ? (v as number) : null })
            }}
          />
        </label>
      </div>
      <p className="tabular-nums text-muted-foreground">
        {formatPace(race.leaderPaceMinPerKm)} · {formatPace(race.trailerPaceMinPerKm)}
      </p>
      {leaderFinishMs && trailerFinishMs && (
        <p className="tabular-nums text-muted-foreground">
          Meta 1º:{' '}
          {new Date(leaderFinishMs).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          {' · '}
          Meta último:{' '}
          {new Date(trailerFinishMs).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      {race.startTime && race.leaderPaceMinPerKm && race.trailerPaceMinPerKm &&
        race.leaderPaceMinPerKm > race.trailerPaceMinPerKm && (
          <p className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-400">
            El ritmo del primer corredor debería ser menor (más rápido) que el del último.
          </p>
        )}
    </div>
  )
}
