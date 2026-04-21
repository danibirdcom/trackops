import type { FeatureCollection } from 'geojson'
import { haversineMeters } from './distance'
import { trackLatLngs, type LatLng } from './kmAlongTrack'

export function positionAtKm(fc: FeatureCollection, km: number): LatLng | null {
  const path = trackLatLngs(fc)
  if (path.length < 2) return null
  const targetM = Math.max(0, km * 1000)

  let cumulative = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const segLen = haversineMeters(a, b)
    if (cumulative + segLen >= targetM) {
      const t = segLen === 0 ? 0 : (targetM - cumulative) / segLen
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    cumulative += segLen
  }
  return path[path.length - 1] ?? null
}
