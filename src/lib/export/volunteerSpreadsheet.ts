import type { Project } from '@/lib/types'

type Row = {
  volunteer: string
  role: string
  description: string
  sectors: string
  chiefs: string
  sortKey: string
}

function escapeField(value: string): string {
  if (/[";\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'proyecto'
  )
}

export function buildVolunteersCsv(project: Project): string {
  const sectorsById = new Map(project.sectors.map((s) => [s.id, s]))
  const volunteersById = new Map(project.volunteers.map((v) => [v.id, v]))

  const rows: Row[] = []
  for (const volunteer of project.volunteers) {
    const sectorIds = new Set<string>()
    const assignedPoints = project.points.filter((pt) => pt.volunteerIds.includes(volunteer.id))
    for (const pt of assignedPoints) {
      if (pt.sectorId) sectorIds.add(pt.sectorId)
    }
    for (const s of project.sectors) {
      if (s.chiefVolunteerId === volunteer.id) sectorIds.add(s.id)
    }

    const orderedSectors = [...sectorIds]
      .map((id) => sectorsById.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))

    const sectorsText = orderedSectors.length === 0 ? '—' : orderedSectors.map((s) => s.name).join(' · ')

    const chiefsText =
      orderedSectors.length === 0
        ? '—'
        : orderedSectors
            .map((s) => {
              if (s.chiefVolunteerId === volunteer.id) return 'Eres responsable'
              if (!s.chiefVolunteerId) return 'Sin responsable'
              return volunteersById.get(s.chiefVolunteerId)?.name ?? '—'
            })
            .join(' · ')

    const descriptionParts: string[] = []
    if (volunteer.notes && volunteer.notes.trim()) {
      descriptionParts.push(volunteer.notes.trim())
    }
    for (const pt of assignedPoints) {
      if (!pt.description || !pt.description.trim()) continue
      const kmLabel = pt.kmMark !== null ? ` (km ${pt.kmMark.toFixed(2)})` : ''
      descriptionParts.push(`${pt.name}${kmLabel}: ${pt.description.trim()}`)
    }
    const descriptionText = descriptionParts.length === 0 ? '—' : descriptionParts.join(' | ')

    rows.push({
      volunteer: volunteer.name,
      role: volunteer.role || '—',
      description: descriptionText,
      sectors: sectorsText,
      chiefs: chiefsText,
      sortKey: (orderedSectors[0]?.name ?? 'zzzz').toLowerCase(),
    })
  }

  rows.sort((a, b) => {
    const cmp = a.sortKey.localeCompare(b.sortKey, 'es', { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return a.volunteer.localeCompare(b.volunteer, 'es', { sensitivity: 'base' })
  })

  const header = ['Voluntario', 'Cometido en la carrera', 'Descripción', 'Sector', 'Jefe de sector']
  const lines = [
    header.join(';'),
    ...rows.map((r) =>
      [r.volunteer, r.role, r.description, r.sectors, r.chiefs].map(escapeField).join(';'),
    ),
  ]
  // UTF-8 BOM so Spanish Excel respects accents and renders the ; separator correctly.
  return '\ufeff' + lines.join('\r\n')
}

export function downloadVolunteersCsv(project: Project): void {
  const csv = buildVolunteersCsv(project)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug(project.name)}-voluntarios.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
