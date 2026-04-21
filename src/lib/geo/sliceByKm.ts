import type { FeatureCollection } from 'geojson'
import { haversineMeters } from './distance'
import { trackLatLngs, type LatLng } from './kmAlongTrack'

export function sliceByKmRange(
  fc: FeatureCollection,
  startKm: number,
  endKm: number,
): LatLng[] {
  const path = trackLatLngs(fc)
  if (path.length < 2) return []

  const start = Math.max(0, Math.min(startKm, endKm)) * 1000
  const end = Math.max(startKm, endKm) * 1000
  if (end <= 0) return []

  const out: LatLng[] = []
  let cumulative = 0
  let started = false

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    if (!a || !b) continue
    const segLen = haversineMeters(a, b)
    const segStart = cumulative
    const segEnd = cumulative + segLen

    if (segEnd < start) {
      cumulative = segEnd
      continue
    }

    if (!started) {
      if (segLen === 0) {
        out.push(a)
      } else {
        const t = (start - segStart) / segLen
        out.push(interpolate(a, b, t))
      }
      started = true
    }

    if (segEnd >= end) {
      const t = segLen === 0 ? 1 : (end - segStart) / segLen
      out.push(interpolate(a, b, t))
      break
    }

    out.push(b)
    cumulative = segEnd
  }

  return out
}

function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  const tt = Math.max(0, Math.min(1, t))
  return [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]
}
