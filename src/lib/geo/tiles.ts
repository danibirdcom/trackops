import type { Bounds } from './bounds'

export type TileCoord = { z: number; x: number; y: number }

export function lonLatToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom
  const x = Math.floor(((lng + 180) / 360) * n)
  const rad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export function tilesForBounds(bounds: Bounds, zoom: number): TileCoord[] {
  const nw = lonLatToTile(bounds.north, bounds.west, zoom)
  const se = lonLatToTile(bounds.south, bounds.east, zoom)
  const xs: [number, number] = [Math.min(nw.x, se.x), Math.max(nw.x, se.x)]
  const ys: [number, number] = [Math.min(nw.y, se.y), Math.max(nw.y, se.y)]
  const out: TileCoord[] = []
  for (let x = xs[0]; x <= xs[1]; x++) {
    for (let y = ys[0]; y <= ys[1]; y++) {
      out.push({ z: zoom, x, y })
    }
  }
  return out
}

export function tilesForBoundsRange(
  bounds: Bounds,
  zoomBase: number,
  extraLevels: number,
): TileCoord[] {
  const all: TileCoord[] = []
  for (let z = zoomBase; z <= zoomBase + extraLevels; z++) {
    all.push(...tilesForBounds(bounds, z))
  }
  return all
}

export function tileUrl(
  template: string,
  tile: TileCoord,
  subdomains: string[] = ['a', 'b', 'c'],
): string {
  const s = subdomains[(tile.x + tile.y) % subdomains.length] ?? subdomains[0] ?? 'a'
  return template
    .replace('{s}', s)
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y))
}

export async function fetchTilesWithProgress(
  urls: string[],
  opts: {
    concurrency?: number
    onProgress?: (done: number, total: number, lastError: string | null) => void
    signal?: AbortSignal
  } = {},
): Promise<{ done: number; errors: number }> {
  const concurrency = opts.concurrency ?? 6
  let done = 0
  let errors = 0
  let idx = 0
  let lastError: string | null = null

  const worker = async () => {
    while (idx < urls.length) {
      if (opts.signal?.aborted) return
      const i = idx++
      const url = urls[i]
      if (!url) continue
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: opts.signal })
        if (!res.ok) {
          errors++
          lastError = `HTTP ${res.status}`
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        errors++
        lastError = e instanceof Error ? e.message : 'network error'
      }
      done++
      opts.onProgress?.(done, urls.length, lastError)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker())
  await Promise.all(workers)
  return { done, errors }
}
