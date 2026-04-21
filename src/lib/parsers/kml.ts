import { kml } from '@tmcw/togeojson'
import type { Feature, FeatureCollection, Geometry } from 'geojson'

export function parseKML(text: string): FeatureCollection {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const errorNode = doc.querySelector('parsererror')
  if (errorNode) {
    throw new Error('El archivo KML no es válido')
  }
  const result = kml(doc)
  const features = result.features.filter(
    (f): f is Feature<Geometry> =>
      f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString',
  )
  return { type: 'FeatureCollection', features }
}
