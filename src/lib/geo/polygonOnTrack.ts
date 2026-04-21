import type { FeatureCollection, Polygon } from 'geojson'
import { haversineMeters } from './distance'
import { trackLatLngs } from './kmAlongTrack'

export type TrackSegmentOverlap = {
  startKm: number
  endKm: number
}

export type TrackPolygonOverlap = {
  segments: TrackSegmentOverlap[]
  totalKm: number
}

function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const xi = a[0]!
    const yi = a[1]!
    const xj = b[0]!
    const yj = b[1]!
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygon(lat: number, lng: number, polygon: Polygon): boolean {
  const outer = polygon.coordinates[0]
  if (!outer || outer.length < 4) return false
  if (!pointInRing(lat, lng, outer)) return false
  // Holes: if the point is inside any hole, it's outside the polygon.
  for (let i = 1; i < polygon.coordinates.length; i++) {
    const hole = polygon.coordinates[i]
    if (hole && hole.length >= 4 && pointInRing(lat, lng, hole)) return false
  }
  return true
}

export function polygonOverlapWithTrack(
  fc: FeatureCollection,
  polygon: Polygon,
): TrackPolygonOverlap {
  const path = trackLatLngs(fc)
  if (path.length < 2) return { segments: [], totalKm: 0 }
  const outer = polygon.coordinates[0]
  if (!outer || outer.length < 4) return { segments: [], totalKm: 0 }

  const segments: TrackSegmentOverlap[] = []
  let cumulativeM = 0
  let entryKm: number | null = null
  let prevInside = false

  const firstPoint = path[0]!
  prevInside = pointInPolygon(firstPoint[0], firstPoint[1], polygon)
  if (prevInside) entryKm = 0

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]!
    const curr = path[i]!
    const segLen = haversineMeters(prev, curr)
    cumulativeM += segLen
    const currKm = cumulativeM / 1000

    const inside = pointInPolygon(curr[0], curr[1], polygon)
    if (inside && !prevInside) {
      entryKm = currKm
    } else if (!inside && prevInside && entryKm !== null) {
      segments.push({ startKm: entryKm, endKm: currKm })
      entryKm = null
    }
    prevInside = inside
  }

  if (prevInside && entryKm !== null) {
    segments.push({ startKm: entryKm, endKm: cumulativeM / 1000 })
  }

  const totalKm = segments.reduce((acc, s) => acc + (s.endKm - s.startKm), 0)
  return { segments, totalKm }
}
