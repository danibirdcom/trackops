import type { FeatureCollection } from 'geojson'

export type Bounds = {
  south: number
  west: number
  north: number
  east: number
}

export function boundsOf(collections: FeatureCollection[]): Bounds | null {
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  let hasAny = false

  for (const fc of collections) {
    for (const f of fc.features) {
      const g = f.geometry
      if (!g) continue
      const visit = (coords: number[]) => {
        const lng = coords[0]
        const lat = coords[1]
        if (typeof lng !== 'number' || typeof lat !== 'number') return
        hasAny = true
        if (lat < south) south = lat
        if (lat > north) north = lat
        if (lng < west) west = lng
        if (lng > east) east = lng
      }
      if (g.type === 'LineString') {
        for (const c of g.coordinates) visit(c)
      } else if (g.type === 'MultiLineString') {
        for (const line of g.coordinates) for (const c of line) visit(c)
      } else if (g.type === 'Point') {
        visit(g.coordinates)
      }
    }
  }
  return hasAny ? { south, west, north, east } : null
}
