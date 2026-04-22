import type { PointType } from '@/lib/types'

export const POINT_TYPE_LABELS: Record<PointType, string> = {
  avituallamiento: 'Avituallamiento',
  control: 'Control',
  cruce: 'Cruce',
  ambulancia: 'Ambulancia',
  meta: 'Meta',
  salida: 'Salida',
  paso: 'Paso',
  voluntario: 'Voluntario',
  escoba: 'Escoba',
  guardarropa: 'Guardarropa',
  parking: 'Parking',
  baños: 'Baños',
  prensa: 'Prensa',
  otro: 'Otro',
}

export const POINT_TYPES = Object.keys(POINT_TYPE_LABELS) as PointType[]
