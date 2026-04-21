import { Polyline, Polygon, Tooltip } from 'react-leaflet'
import type { Sector, Track } from '@/lib/types'
import { sliceByKmRange } from '@/lib/geo/sliceByKm'
import { useUiStore } from '@/stores/uiStore'

type Props = {
  sectors: Sector[]
  tracks: Track[]
}

export default function SectorsLayer({ sectors, tracks }: Props) {
  const selectedId = useUiStore((s) => s.selectedSectorId)
  const selectSector = useUiStore((s) => s.selectSector)
  const setActiveTab = useUiStore((s) => s.setActiveTab)

  return (
    <>
      {sectors.map((sector) => {
        if (sector.visible === false) return null
        const selected = selectedId === sector.id
        if (sector.definition.type === 'range') {
          const track = tracks.find((t) => t.id === sector.trackId)
          if (!track) return null
          const coords = sliceByKmRange(
            track.geojson,
            sector.definition.startKm,
            sector.definition.endKm,
          )
          if (coords.length < 2) return null
          return (
            <Polyline
              key={sector.id}
              positions={coords}
              pathOptions={{
                color: sector.color,
                weight: (track.width ?? 4) + 8,
                opacity: selected ? 0.75 : 0.45,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={{
                click: () => {
                  selectSector(sector.id)
                  setActiveTab('sectors')
                },
              }}
            >
              <Tooltip sticky>{sector.name}</Tooltip>
            </Polyline>
          )
        }
        const poly = sector.definition.geojson
        const positions = poly.coordinates[0]?.map(
          (c) => [c[1]!, c[0]!] as [number, number],
        ) ?? []
        if (positions.length < 3) return null
        return (
          <Polygon
            key={sector.id}
            positions={positions}
            pathOptions={{
              color: sector.color,
              weight: selected ? 3 : 2,
              opacity: 0.9,
              fillOpacity: selected ? 0.35 : 0.2,
              fillColor: sector.color,
            }}
            eventHandlers={{
              click: () => {
                selectSector(sector.id)
                setActiveTab('sectors')
              },
            }}
          >
            <Tooltip sticky>{sector.name}</Tooltip>
          </Polygon>
        )
      })}
    </>
  )
}
