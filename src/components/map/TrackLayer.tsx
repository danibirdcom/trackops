import { GeoJSON } from 'react-leaflet'
import type { PathOptions } from 'leaflet'
import type { Track } from '@/lib/types'

type Props = {
  tracks: Track[]
}

export default function TrackLayer({ tracks }: Props) {
  return (
    <>
      {tracks
        .filter((t) => t.visible)
        .map((track) => {
          const style: PathOptions = {
            color: track.color,
            weight: track.width,
            opacity: 1,
          }
          return (
            <GeoJSON
              key={`${track.id}-${track.color}-${track.width}`}
              data={track.geojson}
              style={() => style}
            />
          )
        })}
    </>
  )
}
