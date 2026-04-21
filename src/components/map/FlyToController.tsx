import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { useUiStore } from '@/stores/uiStore'

export default function FlyToController() {
  const map = useMap()
  const flyTo = useUiStore((s) => s.flyTo)

  useEffect(() => {
    if (!flyTo) return
    map.flyTo(flyTo.center, flyTo.zoom ?? Math.max(map.getZoom(), 15), { duration: 0.6 })
  }, [flyTo, map])

  return null
}
