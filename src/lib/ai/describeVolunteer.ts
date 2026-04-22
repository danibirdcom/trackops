import type { Point, Project, Sector, Volunteer } from '@/lib/types'

const POINT_TYPE_INSTRUCTIONS: Record<string, string> = {
  avituallamiento:
    'Distribuye bebida y comida a los corredores. Mantén el stock ordenado, cambia los vasos usados con frecuencia y evita aglomeraciones delante de la mesa. Ten agua fresca lista durante todo el evento.',
  control:
    'Verifica el paso de cada corredor. Si el evento lleva chip, escanéalo; si no, toma referencia del dorsal. Anota incidencias (retirados, problemas médicos) y comunícalas al responsable de sector.',
  cruce:
    'Estás en un cruce o zona sensible. Prioriza la seguridad de los corredores ante vehículos y peatones. Usa el chaleco reflectante, y si tienes silbato avísalo antes de que pasen coches. Mantén visual con el siguiente tramo.',
  ambulancia:
    'Punto de asistencia médica. Observa el estado físico de los corredores y pide refuerzos si detectas mareos, golpes, caídas o cualquier señal de alarma. No asumas funciones sanitarias para las que no estés formado.',
  meta:
    'Zona de llegada. Recibe a los corredores, apártalos del carril de carrera, entrega medalla/avituallamiento final y dirígelos hacia la zona de descanso. Mantén el pasillo despejado en todo momento.',
  salida:
    'Zona de salida. Ordena a los corredores por cajones, controla que no haya corredores sin dorsal, y mantén despejado el pasillo central. Sigue las indicaciones del director de carrera para el pistoletazo.',
  paso:
    'Punto de paso general. Anima a los corredores, confirma que siguen la ruta correcta y no permitas que se desvíen en cruces o caminos secundarios.',
  voluntario:
    'Punto de apoyo general de voluntariado. Orienta a los corredores, atiende peticiones puntuales, y mantén comunicación constante con el responsable de zona ante cualquier incidencia.',
  escoba:
    'Eres escoba de la carrera: cerrarás el recorrido acompañando al último corredor. Mantén comunicación constante con dirección de carrera, recoge señalización a medida que avanzas si corresponde, y atiende retiradas y primeros auxilios básicos hasta que llegue refuerzo si hace falta.',
  guardarropa:
    'Guardarropa. Recibe y etiqueta bolsas con el dorsal del corredor. No entregues ninguna bolsa sin el dorsal correspondiente del usuario.',
  parking:
    'Parking. Ordena a los coches, reserva el espacio reservado para vehículos oficiales (ambulancia, organización), e indica por dónde se sale a pie al resto de zonas.',
  baños:
    'Cabinas portátiles. Asegúrate de que están limpias y con papel, y avisa si escasea. Si hay cola larga, pide un refuerzo de cabinas.',
  prensa:
    'Zona de prensa / fotógrafos. Gestiona el acceso solo a acreditados y evita que se metan en el circuito. Ayuda a orientarles hacia los mejores puntos para sacar foto.',
  otro:
    'Sigue las instrucciones específicas que te haya dado el director de carrera o el responsable de sector. Ante cualquier duda, contacta con el responsable antes de tomar iniciativa.',
}

export type RoleDescriptionContext = {
  volunteer: Volunteer
  points: Point[]
  sectors: Sector[]
  chiefByVolunteer: Map<string, Volunteer>
  peers: Volunteer[]
  project: Project
}

export function buildRoleDescriptionContext(project: Project, volunteerId: string): RoleDescriptionContext | null {
  const volunteer = project.volunteers.find((v) => v.id === volunteerId)
  if (!volunteer) return null

  const assignedPoints = project.points.filter((p) => p.volunteerIds.includes(volunteerId))
  const sectorIds = new Set<string>()
  for (const p of assignedPoints) if (p.sectorId) sectorIds.add(p.sectorId)
  for (const s of project.sectors) if (s.chiefVolunteerId === volunteerId) sectorIds.add(s.id)
  const sectors = project.sectors.filter((s) => sectorIds.has(s.id))

  const peerIds = new Set<string>()
  for (const p of assignedPoints) for (const vid of p.volunteerIds) if (vid !== volunteerId) peerIds.add(vid)
  for (const s of sectors) {
    for (const p of project.points.filter((pt) => pt.sectorId === s.id)) {
      for (const vid of p.volunteerIds) if (vid !== volunteerId) peerIds.add(vid)
    }
  }
  const peers = project.volunteers.filter((v) => peerIds.has(v.id))

  const chiefByVolunteer = new Map<string, Volunteer>()
  for (const s of sectors) {
    if (s.chiefVolunteerId && s.chiefVolunteerId !== volunteerId) {
      const chief = project.volunteers.find((v) => v.id === s.chiefVolunteerId)
      if (chief) chiefByVolunteer.set(s.id, chief)
    }
  }

  return { volunteer, points: assignedPoints, sectors, chiefByVolunteer, peers, project }
}

export function describeVolunteerRole(ctx: RoleDescriptionContext): string {
  const { volunteer, points, sectors, chiefByVolunteer, project } = ctx
  const firstPoint = points[0]
  const pointDesc = firstPoint
    ? `tu posición es ${firstPoint.name}${firstPoint.kmMark !== null ? ` (km ${firstPoint.kmMark.toFixed(2)})` : ''}`
    : 'aún no tienes punto asignado'
  const extraPoints =
    points.length > 1
      ? ` Además tienes otros ${points.length - 1} punto${points.length - 1 === 1 ? '' : 's'} asignado${points.length - 1 === 1 ? '' : 's'}.`
      : ''
  const sectorDesc =
    sectors.length > 0
      ? `Trabajas en el sector ${sectors.map((s) => s.name).join(', ')}.`
      : ''

  const chiefsList: string[] = []
  for (const s of sectors) {
    const chief = chiefByVolunteer.get(s.id)
    if (chief) chiefsList.push(`${chief.name} (${s.name})`)
  }
  const chiefDesc =
    sectors.some((s) => s.chiefVolunteerId === volunteer.id)
      ? 'Eres responsable de tu sector — coordina al resto de voluntarios que trabajan contigo y reporta al director de carrera.'
      : chiefsList.length > 0
        ? `Tu responsable de zona es ${chiefsList.join(', ')}. Contacta con él o ella ante cualquier incidencia.`
        : 'No se ha asignado todavía un responsable de zona; coordínate directamente con el director de carrera.'

  const instructions = firstPoint ? POINT_TYPE_INSTRUCTIONS[firstPoint.type] ?? '' : ''

  const roleIntro = volunteer.role
    ? `Tu rol dentro del evento "${project.name}" es ${volunteer.role}`
    : `Colaboras en el evento "${project.name}"`

  return [
    `${roleIntro}. ${pointDesc}.${extraPoints}`,
    sectorDesc,
    chiefDesc,
    instructions,
  ]
    .filter(Boolean)
    .join(' ')
}
