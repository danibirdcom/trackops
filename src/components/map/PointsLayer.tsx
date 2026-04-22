import { Marker } from 'react-leaflet'
import L from 'leaflet'
import type { Point, PointType } from '@/lib/types'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import { kmAlongTrack } from '@/lib/geo/kmAlongTrack'

type Props = { points: Point[] }

const POINT_META: Record<PointType, { emoji: string; color: string }> = {
  avituallamiento: { emoji: '💧', color: '#0ea5e9' },
  control: { emoji: '✔️', color: '#16a34a' },
  cruce: { emoji: '⚠️', color: '#f59e0b' },
  ambulancia: { emoji: '➕', color: '#dc2626' },
  meta: { emoji: '🏁', color: '#111827' },
  salida: { emoji: '🚩', color: '#16a34a' },
  paso: { emoji: '📍', color: '#6366f1' },
  voluntario: { emoji: '🧑', color: '#14b8a6' },
  guardarropa: { emoji: '🎒', color: '#8b5cf6' },
  parking: { emoji: '🅿️', color: '#64748b' },
  baños: { emoji: '🚻', color: '#0891b2' },
  prensa: { emoji: '📷', color: '#db2777' },
  otro: { emoji: '•', color: '#475569' },
}

export function pointTypeMeta(type: PointType) {
  return POINT_META[type]
}

function buildIcon(type: PointType, selected: boolean): L.DivIcon {
  const meta = POINT_META[type]
  const size = selected ? 36 : 30
  const ring = selected ? '3px solid rgba(59,130,246,0.75)' : '2px solid white'
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      background:${meta.color};color:white;
      display:flex;align-items:center;justify-content:center;
      border:${ring};
      box-shadow:0 1px 3px rgba(0,0,0,0.3);
      font-size:${Math.round(size * 0.55)}px;line-height:1;
      user-select:none;
    ">${meta.emoji}</div>
  `
  return L.divIcon({
    html,
    className: 'trackops-point',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export default function PointsLayer({ points }: Props) {
  const selectedId = useProjectStore((s) => s.selectedPointId)
  const select = useProjectStore((s) => s.selectPoint)
  const updatePoint = useProjectStore((s) => s.updatePoint)
  const current = useProjectStore((s) => s.current)
  const readOnly = useUiStore((s) => s.readOnly)

  return (
    <>
      {points.map((pt) => (
        <Marker
          key={pt.id}
          position={pt.coordinates}
          icon={buildIcon(pt.type, selectedId === pt.id)}
          draggable={!readOnly}
          eventHandlers={{
            click: () => select(pt.id),
            dragend: (e) => {
              if (readOnly) return
              const latlng = e.target.getLatLng()
              const coords: [number, number] = [latlng.lat, latlng.lng]
              let kmMark: number | null = pt.kmMark
              if (current) {
                for (const track of current.tracks) {
                  if (!track.visible) continue
                  const km = kmAlongTrack(track.geojson, coords)
                  if (km !== null) {
                    kmMark = km
                    break
                  }
                }
              }
              updatePoint(pt.id, { coordinates: coords, kmMark })
            },
          }}
        />
      ))}
    </>
  )
}
