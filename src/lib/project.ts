import { nanoid } from 'nanoid'
import type { Project } from '@/lib/types'

export const DEFAULT_CENTER: [number, number] = [40.4168, -3.7038]
export const DEFAULT_ZOOM = 6

export function createEmptyProject(name: string, eventDate: string | null = null): Project {
  const now = new Date().toISOString()
  return {
    id: nanoid(12),
    name,
    eventDate,
    createdAt: now,
    updatedAt: now,
    tracks: [],
    sectors: [],
    points: [],
    volunteers: [],
    annotations: [],
    mapState: {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      baseLayer: 'osm',
    },
  }
}

export function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() }
}
