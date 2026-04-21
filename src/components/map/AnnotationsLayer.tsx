import type { ReactNode } from 'react'
import { Polyline, Polygon, Marker, Tooltip, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { Annotation } from '@/lib/types'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'

type Props = { annotations: Annotation[] }

function FragmentWithKey({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function textIcon(label: string, color: string): L.DivIcon {
  const safe = label.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return L.divIcon({
    className: 'trackops-annotation-text',
    html: `<div style="
      background: ${color};
      color: white;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
      transform: translate(-50%, -50%);
      pointer-events: auto;
    ">${safe}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

function arrowHeadIcon(color: string, rotationDeg: number): L.DivIcon {
  return L.divIcon({
    className: 'trackops-arrow-head',
    html: `<div style="
      transform: translate(-50%, -50%) rotate(${rotationDeg}deg);
      width: 0; height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-bottom: 14px solid ${color};
      filter: drop-shadow(0 1px 1px rgba(0,0,0,0.3));
    "></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

function bearing(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const dLng = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

const TYPE_LABELS: Record<Annotation['type'], string> = {
  text: 'Texto',
  line: 'Línea',
  polygon: 'Polígono',
  arrow: 'Flecha',
}

export default function AnnotationsLayer({ annotations }: Props) {
  const removeAnnotation = useProjectStore((s) => s.removeAnnotation)
  const readOnly = useUiStore((s) => s.readOnly)

  const renderPopup = (a: Annotation) => {
    if (readOnly) return a.label ? <Popup>{a.label}</Popup> : null
    return (
      <Popup>
        <div style={{ minWidth: 140, fontFamily: 'inherit' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{a.label || TYPE_LABELS[a.type]}</p>
          <p style={{ margin: '2px 0 8px', fontSize: 11, color: '#666' }}>{TYPE_LABELS[a.type]}</p>
          <button
            type="button"
            onClick={() => removeAnnotation(a.id)}
            style={{
              appearance: 'none',
              border: '1px solid #dc2626',
              color: '#dc2626',
              background: 'transparent',
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 4,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Eliminar
          </button>
        </div>
      </Popup>
    )
  }

  return (
    <>
      {annotations.map((a) => {
        const g = a.geojson.geometry
        if (!g) return null

        if (a.type === 'text' && g.type === 'Point') {
          const lat = g.coordinates[1] ?? 0
          const lng = g.coordinates[0] ?? 0
          return (
            <Marker key={a.id} position={[lat, lng]} icon={textIcon(a.label ?? '', a.color)}>
              {renderPopup(a)}
            </Marker>
          )
        }

        if (a.type === 'line' && g.type === 'LineString') {
          const positions = g.coordinates.map(
            (c) => [c[1]!, c[0]!] as [number, number],
          )
          return (
            <Polyline
              key={a.id}
              positions={positions}
              pathOptions={{ color: a.color, weight: 3, opacity: 0.9 }}
            >
              {a.label && <Tooltip sticky>{a.label}</Tooltip>}
              {renderPopup(a)}
            </Polyline>
          )
        }

        if (a.type === 'polygon' && g.type === 'Polygon') {
          const positions = g.coordinates[0]?.map(
            (c) => [c[1]!, c[0]!] as [number, number],
          ) ?? []
          if (positions.length < 3) return null
          return (
            <Polygon
              key={a.id}
              positions={positions}
              pathOptions={{
                color: a.color,
                weight: 2,
                fillOpacity: 0.25,
                fillColor: a.color,
              }}
            >
              {a.label && <Tooltip sticky>{a.label}</Tooltip>}
              {renderPopup(a)}
            </Polygon>
          )
        }

        if (a.type === 'arrow' && g.type === 'LineString' && g.coordinates.length >= 2) {
          const positions = g.coordinates.map(
            (c) => [c[1]!, c[0]!] as [number, number],
          )
          const last = positions[positions.length - 1]
          const prev = positions[positions.length - 2]
          if (!last || !prev) return null
          const deg = bearing(prev, last)
          return (
            <FragmentWithKey key={a.id}>
              <Polyline
                positions={positions}
                pathOptions={{ color: a.color, weight: 3, opacity: 0.9 }}
              >
                {a.label && <Tooltip sticky>{a.label}</Tooltip>}
                {renderPopup(a)}
              </Polyline>
              <Marker position={last} icon={arrowHeadIcon(a.color, deg)} interactive={false} />
            </FragmentWithKey>
          )
        }

        return null
      })}
    </>
  )
}
