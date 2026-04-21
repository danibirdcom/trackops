import type { FeatureCollection, Feature, Polygon } from 'geojson'

export type PointType =
  | 'avituallamiento'
  | 'control'
  | 'cruce'
  | 'ambulancia'
  | 'meta'
  | 'salida'
  | 'paso'
  | 'guardarropa'
  | 'parking'
  | 'baños'
  | 'prensa'
  | 'otro'

export type BaseLayer = 'osm' | 'topo'

export type MapState = {
  center: [number, number]
  zoom: number
  baseLayer: BaseLayer
}

export type RaceConfig = {
  startTime: string | null
  leaderPaceMinPerKm: number | null
  trailerPaceMinPerKm: number | null
}

export type Track = {
  id: string
  name: string
  color: string
  width: number
  visible: boolean
  geojson: FeatureCollection
  sourceFile: { name: string; type: 'kml' | 'gpx'; importedAt: string }
  race?: RaceConfig
}

export type SectorDefinition =
  | { type: 'range'; startKm: number; endKm: number }
  | { type: 'polygon'; geojson: Polygon }

export type Sector = {
  id: string
  name: string
  color: string
  trackId: string | null
  definition: SectorDefinition
  chiefVolunteerId: string | null
  notes: string
  visible?: boolean
}

export type PassageTime = {
  leaderAt: string | null
  trailerAt: string | null
}

export type VolunteerAction =
  | { type: 'stay' }
  | { type: 'moveTo'; targetPointId: string }
  | { type: 'sweeper'; trackId: string }

export type Point = {
  id: string
  name: string
  type: PointType
  coordinates: [number, number]
  sectorId: string | null
  volunteerIds: string[]
  description: string
  kmMark: number | null
  passageTimes?: Record<string, PassageTime>
  volunteerActions?: Record<string, VolunteerAction>
}

export type Volunteer = {
  id: string
  name: string
  phone: string | null
  email: string | null
  role: string
  shirtSize: string | null
  notes: string
}

export type Annotation = {
  id: string
  type: 'text' | 'line' | 'polygon' | 'arrow'
  geojson: Feature
  label: string | null
  color: string
}

export type Project = {
  id: string
  name: string
  eventDate: string | null
  createdAt: string
  updatedAt: string
  tracks: Track[]
  sectors: Sector[]
  points: Point[]
  volunteers: Volunteer[]
  annotations: Annotation[]
  mapState: MapState
}
