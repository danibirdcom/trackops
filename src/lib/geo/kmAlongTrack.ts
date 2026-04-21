import type { FeatureCollection } from 'geojson'
import { haversineMeters } from './distance'

export type LatLng = [number, number]

export function trackLatLngs(fc: FeatureCollection): LatLng[] {
  const all: LatLng[] = []
  for (const f of fc.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'LineString') {
      for (const c of g.coordinates) {
        const lng = c[0]
        const lat = c[1]
        if (typeof lng === 'number' && typeof lat === 'number') all.push([lat, lng])
      }
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates) {
        for (const c of line) {
          const lng = c[0]
          const lat = c[1]
          if (typeof lng === 'number' && typeof lat === 'number') all.push([lat, lng])
        }
      }
    }
  }
  return all
}

/**
 * Project a point onto the track polyline and return the distance in km
 * from the track start to the closest point on the line.
 */
export function kmAlongTrack(fc: FeatureCollection, point: LatLng): number | null {
  const path = trackLatLngs(fc)
  if (path.length < 2) return null

  let bestDist = Infinity
  let bestKm = 0
  let cumulativeM = 0

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    if (!a || !b) continue
    const segLen = haversineMeters(a, b)
    const proj = projectOnSegment(a, b, point)
    const d = haversineMeters(proj.point, point)
    if (d < bestDist) {
      bestDist = d
      bestKm = (cumulativeM + segLen * proj.t) / 1000
    }
    cumulativeM += segLen
  }
  return bestKm
}

function projectOnSegment(
  a: LatLng,
  b: LatLng,
  p: LatLng,
): { point: LatLng; t: number } {
  // Use equirectangular approximation in meters for local projection.
  const [aLat, aLng] = a
  const [bLat, bLng] = b
  const [pLat, pLng] = p
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180)
  const cosLat = Math.cos(midLat)
  const ax = aLng * cosLat
  const ay = aLat
  const bx = bLng * cosLat
  const by = bLat
  const px = pLng * cosLat
  const py = pLat
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { point: a, t: 0 }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  const qLng = (ax + dx * t) / cosLat
  const qLat = ay + dy * t
  return { point: [qLat, qLng], t }
}
