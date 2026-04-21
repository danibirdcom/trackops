const EARTH_RADIUS_M = 6371000

function toRad(deg: number) {
  return (deg * Math.PI) / 180
}

export function haversineMeters(
  a: [number, number],
  b: [number, number],
): number {
  const [lat1, lng1] = a
  const [lat2, lng2] = b
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s))
}

export function totalDistanceKm(latlngs: [number, number][]): number {
  let sum = 0
  for (let i = 1; i < latlngs.length; i++) {
    const prev = latlngs[i - 1]
    const curr = latlngs[i]
    if (!prev || !curr) continue
    sum += haversineMeters(prev, curr)
  }
  return sum / 1000
}
