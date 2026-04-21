import type { ReactNode } from 'react'
import { Polyline, CircleMarker, Tooltip } from 'react-leaflet'
import type { Point, Track } from '@/lib/types'

function FragmentWithKey({ children }: { children: ReactNode }) {
  return <>{children}</>
}
import { sliceByKmRange } from '@/lib/geo/sliceByKm'
import { positionAtKm } from '@/lib/geo/positionAtKm'
import {
  computeRaceBounds,
  runnerKmAt,
  formatClockWithSeconds,
} from '@/lib/race/simulation'

type Props = {
  tracks: Track[]
  points: Point[]
  currentMs: number | null
}

export default function SnakeLayer({ tracks, points, currentMs }: Props) {
  if (currentMs === null) return null

  return (
    <>
      {tracks.map((track) => {
        if (!track.visible) return null
        const bounds = computeRaceBounds(track)
        if (!bounds) return null
        if (currentMs < bounds.startMs) return null

        const leaderKm = runnerKmAt(track, currentMs, 'leader', points) ?? 0
        const trailerKm = runnerKmAt(track, currentMs, 'trailer', points) ?? 0

        const raceFinished = currentMs >= bounds.trailerFinishMs
        if (raceFinished) return null

        const startKm = Math.max(0, Math.min(leaderKm, trailerKm))
        const endKm = Math.max(leaderKm, trailerKm)
        const snake = sliceByKmRange(track.geojson, startKm, endKm)
        const leaderPos = positionAtKm(track.geojson, leaderKm)
        const trailerPos = positionAtKm(track.geojson, trailerKm)

        const snakeKey = `${track.id}-snake`
        const weight = (track.width ?? 4) + 6

        return (
          <FragmentWithKey key={track.id}>
            {snake.length >= 2 && (
              <Polyline
                key={snakeKey}
                positions={snake}
                pathOptions={{
                  color: track.color,
                  weight,
                  opacity: 0.85,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
                interactive={false}
              />
            )}
            {leaderPos && leaderKm < bounds.totalKm && (
              <CircleMarker
                key={`${track.id}-leader`}
                center={leaderPos}
                radius={7}
                pathOptions={{
                  color: '#fff',
                  weight: 2,
                  fillColor: track.color,
                  fillOpacity: 1,
                }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  <span style={{ fontSize: 11 }}>
                    <strong>{track.name}</strong> · 1º corredor<br />
                    km {leaderKm.toFixed(2)} · {formatClockWithSeconds(currentMs)}
                  </span>
                </Tooltip>
              </CircleMarker>
            )}
            {trailerPos && trailerKm < bounds.totalKm && trailerKm < leaderKm && (
              <CircleMarker
                key={`${track.id}-trailer`}
                center={trailerPos}
                radius={5}
                pathOptions={{
                  color: track.color,
                  weight: 2,
                  fillColor: '#fff',
                  fillOpacity: 0.9,
                  dashArray: '2 3',
                }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  <span style={{ fontSize: 11 }}>
                    <strong>{track.name}</strong> · último corredor<br />
                    km {trailerKm.toFixed(2)}
                  </span>
                </Tooltip>
              </CircleMarker>
            )}
          </FragmentWithKey>
        )
      })}
    </>
  )
}
