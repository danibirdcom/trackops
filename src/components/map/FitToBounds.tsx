import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import type { Bounds } from '@/lib/geo/bounds'

type Props = {
  bounds: Bounds | null
}

export default function FitToBounds({ bounds }: Props) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [40, 40], animate: false },
    )
  }, [bounds, map])
  return null
}
