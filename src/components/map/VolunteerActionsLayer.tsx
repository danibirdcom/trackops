import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import type { Project } from '@/lib/types'
import { positionAtKm } from '@/lib/geo/positionAtKm'
import { computeRaceBounds, runnerKmAt } from '@/lib/race/simulation'

type Props = {
  project: Project
  currentMs: number | null
}

function sweeperIcon(label: string): L.DivIcon {
  const safe = label.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return L.divIcon({
    className: 'trackops-sweeper',
    html: `<div style="
      display:flex;align-items:center;gap:4px;
      transform: translate(-50%, -100%);
      padding: 2px 2px 2px 2px;
      background: transparent;
    ">
      <div style="
        width:24px;height:24px;
        background:#f97316;color:#fff;
        border:2px solid #fff;border-radius:6px;
        box-shadow:0 1px 2px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        font-size:10px;font-weight:700;
        font-family: system-ui, sans-serif;
      ">${initials || '●'}</div>
      <div style="
        background: rgba(249,115,22,0.95);color:#fff;
        padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;
        white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.25);
        font-family: system-ui, sans-serif;
      ">${safe}</div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

export default function VolunteerActionsLayer({ project, currentMs }: Props) {
  if (currentMs === null) return null

  const volunteerById = new Map(project.volunteers.map((v) => [v.id, v]))
  const trackById = new Map(project.tracks.map((t) => [t.id, t]))
  const markers: Array<{ key: string; pos: [number, number]; name: string }> = []

  for (const origin of project.points) {
    if (!origin.volunteerActions) continue
    if (origin.kmMark === null) continue
    for (const [volunteerId, action] of Object.entries(origin.volunteerActions)) {
      if (action.type !== 'sweeper') continue
      const track = trackById.get(action.trackId)
      if (!track) continue
      const bounds = computeRaceBounds(track)
      if (!bounds) continue
      const trailerKm = runnerKmAt(track, currentMs, 'trailer', project.points)
      if (trailerKm === null) continue
      if (trailerKm < origin.kmMark) continue

      let pos: [number, number] | null
      if (trailerKm >= bounds.totalKm) {
        pos = positionAtKm(track.geojson, bounds.totalKm)
      } else {
        pos = positionAtKm(track.geojson, trailerKm)
      }
      if (!pos) continue

      const volunteer = volunteerById.get(volunteerId)
      const name = volunteer?.name ?? 'Voluntario'
      markers.push({
        key: `${origin.id}-${volunteerId}`,
        pos,
        name,
      })
    }
  }

  return (
    <>
      {markers.map((m) => (
        <Marker
          key={m.key}
          position={m.pos}
          icon={sweeperIcon(m.name)}
          interactive
        >
          <Tooltip direction="top" offset={[0, -20]} opacity={0.95}>
            <span style={{ fontSize: 11 }}>
              <strong>{m.name}</strong>
              <br />Escoba
            </span>
          </Tooltip>
        </Marker>
      ))}
    </>
  )
}
