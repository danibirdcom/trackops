import type { Point, Sector } from '@/lib/types'

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

/**
 * Returns the first sector that contains the given point, or null.
 * - Range-defined sectors match when the point's kmMark falls in [startKm, endKm].
 *   We don't verify that the kmMark was computed against the sector's track — if
 *   it's wrong the organizer can override manually from the UI.
 * - Polygon sectors match when the point coordinates lie inside the outer ring.
 */
export function detectSectorForPoint(
  point: Pick<Point, 'kmMark' | 'coordinates'>,
  sectors: Sector[],
): string | null {
  for (const sector of sectors) {
    if (sector.definition.type === 'range') {
      if (point.kmMark === null) continue
      if (!sector.trackId) continue
      const lo = Math.min(sector.definition.startKm, sector.definition.endKm)
      const hi = Math.max(sector.definition.startKm, sector.definition.endKm)
      if (point.kmMark >= lo && point.kmMark <= hi) return sector.id
    } else if (sector.definition.type === 'polygon') {
      const ring = sector.definition.geojson.coordinates[0]
      if (!ring || ring.length < 4) continue
      const [lat, lng] = point.coordinates
      if (pointInRing(lat, lng, ring)) return sector.id
    }
  }
  return null
}
