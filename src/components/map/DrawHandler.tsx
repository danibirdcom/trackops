import { useEffect } from 'react'
import { useMap, useMapEvents, Polyline, Polygon, CircleMarker } from 'react-leaflet'
import { nanoid } from 'nanoid'
import { useUiStore } from '@/stores/uiStore'
import { useProjectStore } from '@/stores/projectStore'
import type { Annotation } from '@/lib/types'

const ANNOTATION_COLOR = '#dc2626'

function finishAnnotation(
  annotationType: 'line' | 'polygon' | 'arrow',
  drawPoints: [number, number][],
  addAnnotation: (a: Annotation) => void,
) {
  if (annotationType === 'line' && drawPoints.length >= 2) {
    const label = prompt('Etiqueta (opcional):', '') || null
    addAnnotation({
      id: nanoid(10),
      type: 'line',
      color: ANNOTATION_COLOR,
      label,
      geojson: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: drawPoints.map(([lat, lng]) => [lng, lat]),
        },
      },
    })
  } else if (annotationType === 'polygon' && drawPoints.length >= 3) {
    const label = prompt('Etiqueta (opcional):', '') || null
    const ring = drawPoints.map(([lat, lng]) => [lng, lat])
    if (ring.length > 0) {
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        ring.push([first[0]!, first[1]!])
      }
    }
    addAnnotation({
      id: nanoid(10),
      type: 'polygon',
      color: ANNOTATION_COLOR,
      label,
      geojson: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    })
  } else if (annotationType === 'arrow' && drawPoints.length === 2) {
    const label = prompt('Etiqueta (opcional):', '') || null
    addAnnotation({
      id: nanoid(10),
      type: 'arrow',
      color: ANNOTATION_COLOR,
      label,
      geojson: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: drawPoints.map(([lat, lng]) => [lng, lat]),
        },
      },
    })
  }
}

export default function DrawHandler() {
  const map = useMap()
  const drawMode = useUiStore((s) => s.drawMode)
  const drawPoints = useUiStore((s) => s.drawPoints)
  const addDrawPoint = useUiStore((s) => s.addDrawPoint)
  const clearDraw = useUiStore((s) => s.clearDraw)
  const addAnnotation = useProjectStore((s) => s.addAnnotation)
  const updateSector = useProjectStore((s) => s.updateSector)

  useEffect(() => {
    if (drawMode) {
      map.doubleClickZoom.disable()
      const el = map.getContainer()
      el.style.cursor = 'crosshair'
      return () => {
        map.doubleClickZoom.enable()
        el.style.cursor = ''
      }
    }
  }, [drawMode, map])

  useEffect(() => {
    if (!drawMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearDraw()
      if (e.key === 'Enter') {
        finish()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, drawPoints])

  const finish = () => {
    if (!drawMode) return
    if (drawMode.kind === 'annotation') {
      const t = drawMode.annotationType
      if (t === 'text') return
      finishAnnotation(t, drawPoints, addAnnotation)
    } else if (drawMode.kind === 'sector-polygon') {
      if (drawPoints.length < 3) {
        clearDraw()
        return
      }
      const ring = drawPoints.map(([lat, lng]) => [lng, lat])
      if (ring.length > 0) {
        const first = ring[0]
        const last = ring[ring.length - 1]
        if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
          ring.push([first[0]!, first[1]!])
        }
      }
      updateSector(drawMode.sectorId, {
        trackId: null,
        definition: {
          type: 'polygon',
          geojson: { type: 'Polygon', coordinates: [ring] },
        },
      })
    }
    clearDraw()
  }

  useMapEvents({
    click(e) {
      if (!drawMode) return
      const latlng: [number, number] = [e.latlng.lat, e.latlng.lng]
      if (drawMode.kind === 'annotation' && drawMode.annotationType === 'text') {
        const label = prompt('Texto de la anotación:', '') ?? ''
        if (label.trim().length > 0) {
          addAnnotation({
            id: nanoid(10),
            type: 'text',
            color: ANNOTATION_COLOR,
            label: label.trim(),
            geojson: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [latlng[1], latlng[0]] },
            },
          })
        }
        clearDraw()
        return
      }
      if (drawMode.kind === 'annotation' && drawMode.annotationType === 'arrow') {
        const next = [...drawPoints, latlng]
        if (next.length === 2) {
          finishAnnotation('arrow', next, addAnnotation)
          clearDraw()
        } else {
          addDrawPoint(latlng)
        }
        return
      }
      addDrawPoint(latlng)
    },
    dblclick() {
      if (!drawMode) return
      finish()
    },
  })

  if (!drawMode || drawPoints.length === 0) return null

  const isPolygonPreview =
    drawMode.kind === 'sector-polygon' ||
    (drawMode.kind === 'annotation' && drawMode.annotationType === 'polygon')

  return (
    <>
      {isPolygonPreview && drawPoints.length >= 3 ? (
        <Polygon
          positions={drawPoints}
          pathOptions={{
            color: '#3b82f6',
            weight: 2,
            dashArray: '4 4',
            fillOpacity: 0.15,
            fillColor: '#3b82f6',
          }}
        />
      ) : drawPoints.length >= 2 ? (
        <Polyline
          positions={drawPoints}
          pathOptions={{ color: '#3b82f6', weight: 2, dashArray: '4 4' }}
        />
      ) : null}
      {drawPoints.map((p, i) => (
        <CircleMarker
          key={i}
          center={p}
          radius={4}
          pathOptions={{ color: '#3b82f6', fillColor: 'white', fillOpacity: 1, weight: 2 }}
        />
      ))}
    </>
  )
}
