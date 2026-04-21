import { create } from 'zustand'
import type {
  Annotation,
  MapState,
  Point,
  Project,
  Sector,
  Track,
  Volunteer,
} from '@/lib/types'
import { saveProject } from '@/lib/storage/dexie'
import { touch } from '@/lib/project'
import { useUiStore } from './uiStore'

type ProjectUpdater = (p: Project) => Project

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(project: Project) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void saveProject(project)
  }, 500)
}

type ProjectStore = {
  current: Project | null
  selectedPointId: string | null
  setProject: (project: Project | null) => void
  update: (updater: ProjectUpdater, opts?: { persist?: boolean }) => void

  addTrack: (track: Track) => void
  updateTrack: (id: string, patch: Partial<Track>) => void
  removeTrack: (id: string) => void
  reorderTracks: (orderedIds: string[]) => void

  addPoint: (point: Point) => void
  updatePoint: (id: string, patch: Partial<Point>) => void
  removePoint: (id: string) => void
  selectPoint: (id: string | null) => void

  addVolunteer: (volunteer: Volunteer) => void
  updateVolunteer: (id: string, patch: Partial<Volunteer>) => void
  removeVolunteer: (id: string) => void
  clearVolunteers: () => void

  addSector: (sector: Sector) => void
  updateSector: (id: string, patch: Partial<Sector>) => void
  removeSector: (id: string) => void

  addAnnotation: (annotation: Annotation) => void
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void
  removeAnnotation: (id: string) => void

  setMapState: (patch: Partial<MapState>) => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  current: null,
  selectedPointId: null,

  setProject: (project) => set({ current: project, selectedPointId: null }),

  update: (updater, opts = {}) => {
    const state = get()
    if (!state.current) return
    const readOnly = useUiStore.getState().readOnly
    const willPersist = opts.persist !== false
    if (readOnly && willPersist) return
    const next = touch(updater(state.current))
    set({ current: next })
    if (willPersist) scheduleSave(next)
  },

  addTrack: (track) => get().update((p) => ({ ...p, tracks: [...p.tracks, track] })),
  updateTrack: (id, patch) =>
    get().update((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  removeTrack: (id) =>
    get().update((p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t.id !== id),
      points: p.points.map((pt) => {
        const baseActions = pt.volunteerActions
        let nextActions = baseActions
        if (baseActions) {
          const filtered = Object.fromEntries(
            Object.entries(baseActions).filter(
              ([, a]) => !(a.type === 'sweeper' && a.trackId === id),
            ),
          )
          nextActions = Object.keys(filtered).length > 0 ? filtered : undefined
        }
        const next = { ...pt, volunteerActions: nextActions }
        if (pt.kmMark !== null && p.tracks.find((t) => t.id === id)) next.kmMark = null
        return next
      }),
    })),
  reorderTracks: (orderedIds) =>
    get().update((p) => {
      const map = new Map(p.tracks.map((t) => [t.id, t]))
      const reordered = orderedIds.flatMap((id) => {
        const t = map.get(id)
        return t ? [t] : []
      })
      const remaining = p.tracks.filter((t) => !orderedIds.includes(t.id))
      return { ...p, tracks: [...reordered, ...remaining] }
    }),

  addPoint: (point) => get().update((p) => ({ ...p, points: [...p.points, point] })),
  updatePoint: (id, patch) =>
    get().update((p) => ({
      ...p,
      points: p.points.map((pt) => (pt.id === id ? { ...pt, ...patch } : pt)),
    })),
  removePoint: (id) =>
    get().update((p) => ({
      ...p,
      points: p.points
        .filter((pt) => pt.id !== id)
        .map((pt) => {
          if (!pt.volunteerActions) return pt
          const filtered = Object.fromEntries(
            Object.entries(pt.volunteerActions).filter(
              ([, a]) => !(a.type === 'moveTo' && a.targetPointId === id),
            ),
          )
          const next = Object.keys(filtered).length > 0 ? filtered : undefined
          return { ...pt, volunteerActions: next }
        }),
    })),
  selectPoint: (id) => set({ selectedPointId: id }),

  addVolunteer: (volunteer) => get().update((p) => ({ ...p, volunteers: [...p.volunteers, volunteer] })),
  updateVolunteer: (id, patch) =>
    get().update((p) => ({
      ...p,
      volunteers: p.volunteers.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    })),
  removeVolunteer: (id) =>
    get().update((p) => ({
      ...p,
      volunteers: p.volunteers.filter((v) => v.id !== id),
      points: p.points.map((pt) => {
        let actions = pt.volunteerActions
        if (actions && actions[id]) {
          const rest = Object.fromEntries(Object.entries(actions).filter(([k]) => k !== id))
          actions = Object.keys(rest).length > 0 ? rest : undefined
        }
        return {
          ...pt,
          volunteerIds: pt.volunteerIds.filter((vid) => vid !== id),
          volunteerActions: actions,
        }
      }),
      sectors: p.sectors.map((s) => ({
        ...s,
        chiefVolunteerId: s.chiefVolunteerId === id ? null : s.chiefVolunteerId,
      })),
    })),
  clearVolunteers: () =>
    get().update((p) => ({
      ...p,
      volunteers: [],
      points: p.points.map((pt) => ({
        ...pt,
        volunteerIds: [],
        volunteerActions: undefined,
      })),
      sectors: p.sectors.map((s) => ({ ...s, chiefVolunteerId: null })),
    })),

  addSector: (sector) => get().update((p) => ({ ...p, sectors: [...p.sectors, sector] })),
  updateSector: (id, patch) =>
    get().update((p) => ({
      ...p,
      sectors: p.sectors.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),
  removeSector: (id) =>
    get().update((p) => ({
      ...p,
      sectors: p.sectors.filter((s) => s.id !== id),
      points: p.points.map((pt) => (pt.sectorId === id ? { ...pt, sectorId: null } : pt)),
    })),

  addAnnotation: (annotation) => get().update((p) => ({ ...p, annotations: [...p.annotations, annotation] })),
  updateAnnotation: (id, patch) =>
    get().update((p) => ({
      ...p,
      annotations: p.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),
  removeAnnotation: (id) =>
    get().update((p) => ({
      ...p,
      annotations: p.annotations.filter((a) => a.id !== id),
    })),

  setMapState: (patch) => {
    const readOnly = useUiStore.getState().readOnly
    get().update(
      (p) => ({ ...p, mapState: { ...p.mapState, ...patch } }),
      { persist: !readOnly },
    )
  },
}))
