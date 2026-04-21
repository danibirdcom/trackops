import jsPDF from 'jspdf'
import type { Project } from '@/lib/types'

const MARGIN_MM = 12

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

type Column = {
  key: 'name' | 'phone' | 'email' | 'role' | 'sector' | 'points' | 'shirtSize' | 'notes'
  label: string
  width: number
}

export function exportDirectoryPdf(project: Project): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const innerW = pageW - 2 * MARGIN_MM

  const columns: Column[] = [
    { key: 'name', label: 'Nombre', width: 0.2 * innerW },
    { key: 'phone', label: 'Teléfono', width: 0.14 * innerW },
    { key: 'email', label: 'Email', width: 0.22 * innerW },
    { key: 'role', label: 'Rol', width: 0.14 * innerW },
    { key: 'sector', label: 'Sector', width: 0.14 * innerW },
    { key: 'points', label: 'Puntos', width: 0.16 * innerW },
  ]

  const sectorByVolunteer = new Map<string, string>()
  for (const s of project.sectors) {
    if (s.chiefVolunteerId) sectorByVolunteer.set(s.chiefVolunteerId, `${s.name} (jefe)`)
  }
  for (const pt of project.points) {
    if (!pt.sectorId) continue
    const sector = project.sectors.find((s) => s.id === pt.sectorId)
    if (!sector) continue
    for (const vid of pt.volunteerIds) {
      if (!sectorByVolunteer.has(vid)) sectorByVolunteer.set(vid, sector.name)
    }
  }

  const pointsByVolunteer = new Map<string, string[]>()
  for (const pt of project.points) {
    for (const vid of pt.volunteerIds) {
      const arr = pointsByVolunteer.get(vid) ?? []
      arr.push(pt.kmMark !== null ? `${pt.name} (km ${pt.kmMark.toFixed(1)})` : pt.name)
      pointsByVolunteer.set(vid, arr)
    }
  }

  const rows = [...project.volunteers].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.text(`${project.name} — Directorio de voluntarios`, MARGIN_MM, MARGIN_MM + 6)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  pdf.text(
    `${rows.length} persona${rows.length === 1 ? '' : 's'} · Generado ${new Date().toLocaleDateString('es-ES')}`,
    MARGIN_MM,
    MARGIN_MM + 11,
  )
  pdf.setTextColor(0)

  let y = MARGIN_MM + 18

  const drawHeader = () => {
    pdf.setFillColor(240, 240, 240)
    pdf.rect(MARGIN_MM, y - 4, innerW, 6, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    let x = MARGIN_MM + 1
    for (const col of columns) {
      pdf.text(col.label, x, y)
      x += col.width
    }
    pdf.setFont('helvetica', 'normal')
    y += 4
  }

  drawHeader()

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - MARGIN_MM) {
      pdf.addPage('a4', 'portrait')
      y = MARGIN_MM + 6
      drawHeader()
    }
  }

  for (const v of rows) {
    const cells: Record<Column['key'], string> = {
      name: v.name,
      phone: v.phone ?? '—',
      email: v.email ?? '—',
      role: v.role || '—',
      sector: sectorByVolunteer.get(v.id) ?? '—',
      points: pointsByVolunteer.get(v.id)?.join(', ') ?? '—',
      shirtSize: v.shirtSize ?? '',
      notes: v.notes,
    }

    pdf.setFontSize(9)
    let maxLines = 1
    const wrapped: string[][] = []
    for (const col of columns) {
      const text = cells[col.key] ?? ''
      const lines = pdf.splitTextToSize(text, col.width - 2) as string[]
      wrapped.push(lines)
      if (lines.length > maxLines) maxLines = lines.length
    }
    const rowHeight = maxLines * 4 + 2
    ensureSpace(rowHeight)

    let x = MARGIN_MM + 1
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!
      const lines = wrapped[i] ?? []
      let ly = y
      for (const line of lines) {
        pdf.text(line, x, ly)
        ly += 4
      }
      x += col.width
    }
    pdf.setDrawColor(230)
    pdf.line(MARGIN_MM, y + rowHeight - 4.5, MARGIN_MM + innerW, y + rowHeight - 4.5)
    y += rowHeight
  }

  pdf.save(`${slug(project.name)}-directorio.pdf`)
}
