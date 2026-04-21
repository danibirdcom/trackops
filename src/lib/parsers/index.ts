import { nanoid } from 'nanoid'
import type { FeatureCollection, Feature, LineString, MultiLineString, Position } from 'geojson'
import type { Track } from '@/lib/types'
import { parseKML } from './kml'
import { parseGPX } from './gpx'

const DEFAULT_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']

export type DetectedFormat = 'kml' | 'gpx'

export function detectFormat(filename: string): DetectedFormat | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.kml')) return 'kml'
  if (lower.endsWith('.gpx')) return 'gpx'
  return null
}

export function parseTrackFile(filename: string, text: string): FeatureCollection {
  const format = detectFormat(filename)
  if (format === 'kml') return parseKML(text)
  if (format === 'gpx') return parseGPX(text)
  throw new Error('Formato no soportado. Usa KML o GPX.')
}

export function featureCollectionToTracks(
  fc: FeatureCollection,
  sourceFile: { name: string; type: DetectedFormat },
  existingCount = 0,
): Track[] {
  const now = new Date().toISOString()
  return fc.features.map((feature, idx) => {
    const name = getFeatureName(feature) ?? deriveNameFromFile(sourceFile.name, idx)
    const color = DEFAULT_COLORS[(existingCount + idx) % DEFAULT_COLORS.length] ?? '#3b82f6'
    const singleGeom: FeatureCollection = {
      type: 'FeatureCollection',
      features: [feature],
    }
    return {
      id: nanoid(12),
      name,
      color,
      width: 4,
      visible: true,
      geojson: singleGeom,
      sourceFile: { ...sourceFile, importedAt: now },
    }
  })
}

function getFeatureName(feature: Feature): string | null {
  const props = feature.properties as Record<string, unknown> | null
  if (!props) return null
  const name = props.name
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null
}

function deriveNameFromFile(filename: string, idx: number): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return idx === 0 ? base : `${base} (${idx + 1})`
}

export function positionsOf(feature: Feature<LineString | MultiLineString>): Position[][] {
  if (feature.geometry.type === 'LineString') return [feature.geometry.coordinates]
  return feature.geometry.coordinates
}
