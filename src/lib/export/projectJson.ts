import type { Project } from '@/lib/types'
import { nanoid } from 'nanoid'

const FILE_VERSION = 1

type ProjectFile = {
  format: 'trackops.project'
  version: number
  exportedAt: string
  project: Project
}

export function exportProjectToBlob(project: Project): Blob {
  const file: ProjectFile = {
    format: 'trackops.project',
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    project,
  }
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
}

export function downloadProject(project: Project) {
  const blob = exportProjectToBlob(project)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyecto'
  a.href = url
  a.download = `${slug}.trackops.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function parseProjectFile(text: string, opts: { assignNewId: boolean }): Project {
  const data = JSON.parse(text) as Partial<ProjectFile>
  if (data.format !== 'trackops.project' || !data.project) {
    throw new Error('El archivo no es un proyecto TrackOps válido')
  }
  const project = data.project
  if (opts.assignNewId) {
    const now = new Date().toISOString()
    return { ...project, id: nanoid(12), createdAt: now, updatedAt: now }
  }
  return project
}
