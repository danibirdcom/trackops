import { gpx } from '@tmcw/togeojson'
import type { FeatureCollection } from 'geojson'

export function parseGPX(text: string): FeatureCollection {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const errorNode = doc.querySelector('parsererror')
  if (errorNode) {
    throw new Error('El archivo GPX no es válido')
  }
  const result = gpx(doc)
  const features = result.features.filter(
    (f) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString',
  )
  return { type: 'FeatureCollection', features }
}
