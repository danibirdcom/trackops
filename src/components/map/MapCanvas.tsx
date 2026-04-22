import { MapContainer, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import TrackLayer from './TrackLayer'
import PointsLayer from './PointsLayer'
import SectorsLayer from './SectorsLayer'
import AnnotationsLayer from './AnnotationsLayer'
import SnakeLayer from './SnakeLayer'
import VolunteerActionsLayer from './VolunteerActionsLayer'
import DrawHandler from './DrawHandler'
import DrawToolbar from './DrawToolbar'
import FitToBounds from './FitToBounds'
import FlyToController from './FlyToController'
import { useProjectStore } from '@/stores/projectStore'
import { useSimulationStore } from '@/stores/simulationStore'
import { boundsOf } from '@/lib/geo/bounds'
import { kmAlongTrack } from '@/lib/geo/kmAlongTrack'
import { nanoid } from 'nanoid'
import type { Point } from '@/lib/types'
import { useUiStore } from '@/stores/uiStore'
import { useRef } from 'react'

function ClickHandler() {
  const current = useProjectStore((s) => s.current)
  const addPoint = useProjectStore((s) => s.addPoint)
  const selectPoint = useProjectStore((s) => s.selectPoint)
  const addPointMode = useUiStore((s) => s.addPointMode)
  const setAddPointMode = useUiStore((s) => s.setAddPointMode)
  const drawMode = useUiStore((s) => s.drawMode)

  useMapEvents({
    click(e) {
      if (drawMode) return
      if (!addPointMode || !current) return
      const lat = e.latlng.lat
      const lng = e.latlng.lng

      let kmMark: number | null = null
      for (const track of current.tracks) {
        if (!track.visible) continue
        const km = kmAlongTrack(track.geojson, [lat, lng])
        if (km !== null) {
          kmMark = km
          break
        }
      }

      const point: Point = {
        id: nanoid(10),
        name: `Punto ${current.points.length + 1}`,
        type: addPointMode,
        coordinates: [lat, lng],
        sectorId: null,
        volunteerIds: [],
        description: '',
        kmMark,
      }
      addPoint(point)
      selectPoint(point.id)
      setAddPointMode(null)
    },
  })
  return null
}

export default function MapCanvas() {
  const current = useProjectStore((s) => s.current)
  const readOnly = useUiStore((s) => s.readOnly)
  const darkMode = useUiStore((s) => s.darkMode)
  const simulationActive = useSimulationStore((s) => s.active)
  const simulationMs = useSimulationStore((s) => s.currentMs)
  const initialBounds = useRef(current ? boundsOf(current.tracks.map((t) => t.geojson)) : null)

  const center = current?.mapState.center ?? [40.4168, -3.7038]
  const zoom = current?.mapState.zoom ?? 6
  const baseLayer = current?.mapState.baseLayer ?? 'osm'

  const tileUrl =
    baseLayer === 'topo'
      ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
      : darkMode
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
  const attribution =
    baseLayer === 'topo'
      ? '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

  return (
    <div className="relative size-full">
      <MapContainer
        center={center}
        zoom={zoom}
        zoomControl={false}
        className="size-full"
        style={{ background: 'var(--background)' }}
      >
        <TileLayer
          key={`${baseLayer}-${darkMode ? 'dark' : 'light'}`}
          attribution={attribution}
          url={tileUrl}
          maxZoom={19}
          crossOrigin
        />
        {current && <TrackLayer tracks={current.tracks} />}
        {current && <SectorsLayer sectors={current.sectors} tracks={current.tracks} />}
        {current && <AnnotationsLayer annotations={current.annotations} />}
        {current && simulationActive && (
          <SnakeLayer tracks={current.tracks} points={current.points} currentMs={simulationMs} />
        )}
        {current && simulationActive && (
          <VolunteerActionsLayer project={current} currentMs={simulationMs} />
        )}
        {current && <PointsLayer points={current.points} />}
        <FitToBounds bounds={initialBounds.current} />
        <FlyToController />
        {!readOnly && <ClickHandler />}
        {!readOnly && <DrawHandler />}
        <ZoomControl position="bottomright" />
      </MapContainer>
      {!readOnly && <DrawToolbar />}
    </div>
  )
}
