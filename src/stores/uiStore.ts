import { create } from 'zustand'
import type { PointType } from '@/lib/types'

export type SidebarTab = 'tracks' | 'sectors' | 'points' | 'volunteers' | 'legend'

type FlyTo = {
  center: [number, number]
  zoom?: number
  at: number
}

export type AnnotationDrawType = 'line' | 'polygon' | 'arrow' | 'text'

export type DrawMode =
  | { kind: 'sector-polygon'; sectorId: string }
  | { kind: 'annotation'; annotationType: AnnotationDrawType }

type UiStore = {
  sidebarOpen: boolean
  activeTab: SidebarTab
  darkMode: boolean
  addPointMode: PointType | null
  flyTo: FlyTo | null
  drawMode: DrawMode | null
  drawPoints: [number, number][]
  selectedSectorId: string | null
  readOnly: boolean
  toggleSidebar: () => void
  setActiveTab: (tab: SidebarTab) => void
  toggleDarkMode: () => void
  setAddPointMode: (type: PointType | null) => void
  requestFlyTo: (center: [number, number], zoom?: number) => void
  setDrawMode: (mode: DrawMode | null) => void
  addDrawPoint: (latlng: [number, number]) => void
  clearDraw: () => void
  selectSector: (id: string | null) => void
  setReadOnly: (v: boolean) => void
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: true,
  activeTab: 'tracks',
  darkMode: false,
  addPointMode: null,
  flyTo: null,
  drawMode: null,
  drawPoints: [],
  selectedSectorId: null,
  readOnly: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setAddPointMode: (type) => set({ addPointMode: type, drawMode: null, drawPoints: [] }),
  requestFlyTo: (center, zoom) => set({ flyTo: { center, zoom, at: Date.now() } }),
  setDrawMode: (mode) => set({ drawMode: mode, drawPoints: [], addPointMode: null }),
  addDrawPoint: (latlng) => set((s) => ({ drawPoints: [...s.drawPoints, latlng] })),
  clearDraw: () => set({ drawMode: null, drawPoints: [] }),
  selectSector: (id) => set({ selectedSectorId: id }),
  setReadOnly: (v) => set({ readOnly: v }),
}))
