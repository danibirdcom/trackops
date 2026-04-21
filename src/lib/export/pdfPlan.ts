import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import type { Project } from '@/lib/types'
import { POINT_TYPE_LABELS } from '@/lib/pointTypes'

const MARGIN_MM = 10
const TITLE_HEIGHT_MM = 10

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

async function captureMap(mapEl: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(mapEl, {
    useCORS: true,
    backgroundColor: '#ffffff',
    scale: window.devicePixelRatio > 1 ? 2 : 1.5,
    logging: false,
    ignoreElements: (el) => el.classList.contains('leaflet-control-attribution'),
  })
}

export async function exportPlanPdf(project: Project, mapEl: HTMLElement): Promise<void> {
  const canvas = await captureMap(mapEl)
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const maxW = pageW - 2 * MARGIN_MM
  const maxH = pageH - 2 * MARGIN_MM - TITLE_HEIGHT_MM
  const ratio = Math.min(maxW / canvas.width, maxH / canvas.height)
  const imgW = canvas.width * ratio
  const imgH = canvas.height * ratio

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.text(project.name, MARGIN_MM, MARGIN_MM + 6)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(120)
  const subtitle = project.eventDate
    ? new Date(project.eventDate).toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : 'Plano operativo'
  pdf.text(subtitle, pageW - MARGIN_MM, MARGIN_MM + 6, { align: 'right' })
  pdf.setTextColor(0)

  pdf.addImage(
    imgData,
    'PNG',
    MARGIN_MM + (maxW - imgW) / 2,
    MARGIN_MM + TITLE_HEIGHT_MM + (maxH - imgH) / 2,
    imgW,
    imgH,
  )

  renderLegendPages(pdf, project)
  pdf.save(`${slug(project.name)}-plano.pdf`)
}

function renderLegendPages(pdf: jsPDF, project: Project) {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const bottom = pageH - MARGIN_MM
  const volunteerById = new Map(project.volunteers.map((v) => [v.id, v]))

  pdf.addPage('a4', 'landscape')
  let y = MARGIN_MM + 6
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.text(`${project.name} — Leyenda`, MARGIN_MM, y)
  y += 8

  const ensureSpace = (needed: number) => {
    if (y + needed > bottom) {
      pdf.addPage('a4', 'landscape')
      y = MARGIN_MM + 6
    }
  }

  if (project.sectors.length === 0 && project.points.length === 0) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text('Sin sectores ni puntos definidos.', MARGIN_MM, y)
    return
  }

  for (const sector of project.sectors) {
    ensureSpace(14)
    pdf.setDrawColor(0)
    pdf.setFillColor(sector.color)
    pdf.rect(MARGIN_MM, y - 3.5, 4, 4, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text(sector.name, MARGIN_MM + 6, y)
    const chief = volunteerById.get(sector.chiefVolunteerId ?? '')
    const descr =
      sector.definition.type === 'range'
        ? `km ${sector.definition.startKm.toFixed(1)} – ${sector.definition.endKm.toFixed(1)}`
        : 'Polígono libre'
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(100)
    pdf.text(
      `${descr}${chief ? `  ·  Jefe de sector: ${chief.name}` : ''}`,
      MARGIN_MM + 6,
      y + 4.5,
    )
    pdf.setTextColor(0)
    y += 9

    const pts = project.points
      .filter((p) => p.sectorId === sector.id)
      .sort((a, b) => (a.kmMark ?? Infinity) - (b.kmMark ?? Infinity))
    if (pts.length === 0) {
      pdf.setFontSize(9)
      pdf.setTextColor(120)
      pdf.text('(Sin puntos asignados)', MARGIN_MM + 10, y)
      pdf.setTextColor(0)
      y += 6
    } else {
      for (const pt of pts) {
        const volunteers = pt.volunteerIds
          .map((vid) => volunteerById.get(vid)?.name)
          .filter((n): n is string => Boolean(n))
        const lines = pdf.splitTextToSize(
          `  •  ${pt.name} (${POINT_TYPE_LABELS[pt.type]})${
            pt.kmMark !== null ? ` — km ${pt.kmMark.toFixed(2)}` : ''
          }${volunteers.length ? ` — ${volunteers.join(', ')}` : ''}`,
          pageW - 2 * MARGIN_MM - 6,
        ) as string[]
        ensureSpace(lines.length * 5 + 1)
        pdf.setFontSize(10)
        for (const line of lines) {
          pdf.text(line, MARGIN_MM + 4, y)
          y += 5
        }
      }
    }
    y += 2
  }

  const orphan = project.points.filter((p) => !p.sectorId)
  if (orphan.length > 0) {
    ensureSpace(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text('Puntos sin sector', MARGIN_MM, y)
    y += 6
    pdf.setFont('helvetica', 'normal')
    for (const pt of orphan.sort((a, b) => (a.kmMark ?? Infinity) - (b.kmMark ?? Infinity))) {
      const volunteers = pt.volunteerIds
        .map((vid) => volunteerById.get(vid)?.name)
        .filter((n): n is string => Boolean(n))
      const lines = pdf.splitTextToSize(
        `  •  ${pt.name} (${POINT_TYPE_LABELS[pt.type]})${
          pt.kmMark !== null ? ` — km ${pt.kmMark.toFixed(2)}` : ''
        }${volunteers.length ? ` — ${volunteers.join(', ')}` : ''}`,
        pageW - 2 * MARGIN_MM - 6,
      ) as string[]
      ensureSpace(lines.length * 5 + 1)
      pdf.setFontSize(10)
      for (const line of lines) {
        pdf.text(line, MARGIN_MM + 4, y)
        y += 5
      }
    }
  }
}
