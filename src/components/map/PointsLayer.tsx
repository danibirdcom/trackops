import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { Point, PointType, Volunteer } from '@/lib/types'
import { useProjectStore } from '@/stores/projectStore'
import { useUiStore } from '@/stores/uiStore'
import { kmAlongTrack } from '@/lib/geo/kmAlongTrack'
import { POINT_TYPE_LABELS } from '@/lib/pointTypes'

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
  escoba: { emoji: '🧹', color: '#92400e' },
  guardarropa: { emoji: '🎒', color: '#8b5cf6' },
  parking: { emoji: '🅿️', color: '#64748b' },
  baños: { emoji: '🚻', color: '#0891b2' },
  prensa: { emoji: '📷', color: '#db2777' },
  otro: { emoji: '•', color: '#475569' },
}

export function pointTypeMeta(type: PointType) {
  return POINT_META[type]
}

function PointPopupContent({ point, volunteers }: { point: Point; volunteers: Volunteer[] }) {
  const meta = POINT_META[point.type]
  const assigned = point.volunteerIds
    .map((id) => volunteers.find((v) => v.id === id))
    .filter((v): v is Volunteer => Boolean(v))
  return (
    <div style={{ minWidth: 200, fontFamily: 'inherit', fontSize: 12, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 9999,
            background: meta.color,
            color: '#fff',
            fontSize: 12,
          }}
        >
          {meta.emoji}
        </span>
        <strong style={{ flex: 1 }}>{point.name}</strong>
      </div>
      <p style={{ margin: 0, color: '#666' }}>
        {POINT_TYPE_LABELS[point.type]}
        {point.kmMark !== null ? ` · km ${point.kmMark.toFixed(2)}` : ''}
      </p>
      {point.description && (
        <p style={{ margin: '6px 0 0', whiteSpace: 'pre-line' }}>{point.description}</p>
      )}
      {assigned.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Asignados</p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {assigned.map((v) => (
              <li key={v.id} style={{ marginBottom: 4 }}>
                <div style={{ fontWeight: 600 }}>{v.name}</div>
                {v.role && <div style={{ color: '#666' }}>{v.role}</div>}
                {v.notes && (
                  <div style={{ color: '#444', whiteSpace: 'pre-line' }}>{v.notes}</div>
                )}
                {(v.phone || v.email) && (
                  <div style={{ color: '#666', fontSize: 11 }}>
                    {v.phone && (
                      <a href={`tel:${v.phone}`} style={{ color: 'inherit' }}>
                        {v.phone}
                      </a>
                    )}
                    {v.phone && v.email ? ' · ' : ''}
                    {v.email && (
                      <a href={`mailto:${v.email}`} style={{ color: 'inherit' }}>
                        {v.email}
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
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
  const focusVolunteerId = useUiStore((s) => s.focusVolunteerId)

  const visiblePoints = focusVolunteerId
    ? points.filter((p) => p.volunteerIds.includes(focusVolunteerId))
    : points

  return (
    <>
      {visiblePoints.map((pt) => (
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
        >
          {readOnly && current && (
            <Popup maxWidth={260} closeButton>
              <PointPopupContent point={pt} volunteers={current.volunteers} />
            </Popup>
          )}
        </Marker>
      ))}
    </>
  )
}
