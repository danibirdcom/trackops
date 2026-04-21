import type { FeatureCollection, Position } from 'geojson'

export type ElevationStats = {
  gain: number
  loss: number
  min: number | null
  max: number | null
  hasElevation: boolean
}

const MIN_DELTA = 1

function visitPositions(fc: FeatureCollection, visit: (p: Position) => void) {
  for (const f of fc.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'LineString') {
      for (const c of g.coordinates) visit(c)
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates) for (const c of line) visit(c)
    }
  }
}

export function elevationStats(fc: FeatureCollection): ElevationStats {
  const elevations: number[] = []
  visitPositions(fc, (c) => {
    const z = c[2]
    if (typeof z === 'number' && Number.isFinite(z)) elevations.push(z)
  })

  if (elevations.length < 2) {
    return { gain: 0, loss: 0, min: null, max: null, hasElevation: false }
  }

  let gain = 0
  let loss = 0
  let min = elevations[0] ?? 0
  let max = elevations[0] ?? 0
  let prev = elevations[0] ?? 0

  for (let i = 1; i < elevations.length; i++) {
    const z = elevations[i] ?? prev
    if (z < min) min = z
    if (z > max) max = z
    const delta = z - prev
    if (Math.abs(delta) >= MIN_DELTA) {
      if (delta > 0) gain += delta
      else loss += -delta
      prev = z
    }
  }

  return {
    gain: Math.round(gain),
    loss: Math.round(loss),
    min: Math.round(min),
    max: Math.round(max),
    hasElevation: true,
  }
}
