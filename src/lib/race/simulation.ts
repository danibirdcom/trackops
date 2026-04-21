import type { Point, Track } from '@/lib/types'
import { totalDistanceKm } from '@/lib/geo/distance'
import { trackLatLngs } from '@/lib/geo/kmAlongTrack'

export type Runner = 'leader' | 'trailer'

export type RaceBounds = {
  startMs: number
  leaderFinishMs: number
  trailerFinishMs: number
  totalKm: number
}

type Knot = { km: number; ms: number }
type PaceCurve = Knot[]

export function trackTotalKm(track: Track): number {
  return totalDistanceKm(trackLatLngs(track.geojson))
}

export function computeRaceBounds(track: Track): RaceBounds | null {
  const race = track.race
  if (!race?.startTime) return null
  const leader = race.leaderPaceMinPerKm
  const trailer = race.trailerPaceMinPerKm
  if (!leader || !trailer) return null
  const startMs = Date.parse(race.startTime)
  if (!Number.isFinite(startMs)) return null
  const totalKm = trackTotalKm(track)
  if (totalKm <= 0) return null
  return {
    startMs,
    leaderFinishMs: startMs + totalKm * leader * 60_000,
    trailerFinishMs: startMs + totalKm * trailer * 60_000,
    totalKm,
  }
}

function collectOverrides(
  track: Track,
  points: Point[] | undefined,
  which: Runner,
  maxKm: number,
): Knot[] {
  if (!points) return []
  const out: Knot[] = []
  for (const p of points) {
    if (p.kmMark === null) continue
    if (p.kmMark < 0 || p.kmMark > maxKm) continue
    const pt = p.passageTimes?.[track.id]
    if (!pt) continue
    const val = which === 'leader' ? pt.leaderAt : pt.trailerAt
    if (!val) continue
    const ms = Date.parse(val)
    if (!Number.isFinite(ms)) continue
    out.push({ km: p.kmMark, ms })
  }
  return out
}

function buildCurve(
  track: Track,
  points: Point[] | undefined,
  which: Runner,
): { curve: PaceCurve; bounds: RaceBounds } | null {
  const bounds = computeRaceBounds(track)
  if (!bounds) return null
  const finishMs = which === 'leader' ? bounds.leaderFinishMs : bounds.trailerFinishMs
  const overrides = collectOverrides(track, points, which, bounds.totalKm)
  const map = new Map<number, number>()
  for (const k of overrides) map.set(k.km, k.ms)
  if (!map.has(0)) map.set(0, bounds.startMs)
  if (!map.has(bounds.totalKm)) map.set(bounds.totalKm, finishMs)
  const curve = [...map.entries()]
    .map(([km, ms]) => ({ km, ms }))
    .sort((a, b) => a.km - b.km)
  return { curve, bounds }
}

function interpolateMs(curve: PaceCurve, km: number): number {
  if (curve.length === 0) return 0
  const first = curve[0]!
  const last = curve[curve.length - 1]!
  if (km <= first.km) return first.ms
  if (km >= last.km) return last.ms
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!
    const b = curve[i]!
    if (km >= a.km && km <= b.km) {
      const span = b.km - a.km
      if (span <= 0) return a.ms
      const t = (km - a.km) / span
      return a.ms + (b.ms - a.ms) * t
    }
  }
  return last.ms
}

function interpolateKm(curve: PaceCurve, ms: number): number {
  if (curve.length === 0) return 0
  const first = curve[0]!
  const last = curve[curve.length - 1]!
  if (ms <= first.ms) return first.km
  if (ms >= last.ms) return last.km
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!
    const b = curve[i]!
    const lo = Math.min(a.ms, b.ms)
    const hi = Math.max(a.ms, b.ms)
    if (ms >= lo && ms <= hi) {
      const span = b.ms - a.ms
      if (span === 0) return a.km
      const t = (ms - a.ms) / span
      return a.km + (b.km - a.km) * t
    }
  }
  return last.km
}

export function timeAtKm(
  track: Track,
  km: number,
  which: Runner,
  points?: Point[],
): number | null {
  const built = buildCurve(track, points, which)
  if (!built) return null
  return interpolateMs(built.curve, Math.max(0, Math.min(km, built.bounds.totalKm)))
}

export function runnerKmAt(
  track: Track,
  atMs: number,
  which: Runner,
  points?: Point[],
): number | null {
  const built = buildCurve(track, points, which)
  if (!built) return null
  if (atMs <= built.bounds.startMs) return 0
  return Math.min(built.bounds.totalKm, Math.max(0, interpolateKm(built.curve, atMs)))
}

export function aggregateRaceWindow(tracks: Track[]): { startMs: number; endMs: number } | null {
  let startMs = Infinity
  let endMs = -Infinity
  for (const track of tracks) {
    const bounds = computeRaceBounds(track)
    if (!bounds) continue
    if (bounds.startMs < startMs) startMs = bounds.startMs
    if (bounds.trailerFinishMs > endMs) endMs = bounds.trailerFinishMs
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return { startMs, endMs }
}

export function formatPace(minPerKm: number | null | undefined): string {
  if (!minPerKm || !Number.isFinite(minPerKm)) return '—'
  const totalSec = Math.round(minPerKm * 60)
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm}:${ss.toString().padStart(2, '0')} /km`
}

export function formatClock(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export function formatClockWithSeconds(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function isoToTimeInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function mergeTimeIntoDate(dateIso: string, hhmm: string): string | null {
  const d = new Date(dateIso)
  if (Number.isNaN(d.getTime())) return null
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
