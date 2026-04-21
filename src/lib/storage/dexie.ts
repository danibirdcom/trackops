import Dexie, { type Table } from 'dexie'
import type { Project } from '@/lib/types'

class TrackOpsDB extends Dexie {
  projects!: Table<Project, string>

  constructor() {
    super('trackops')
    this.version(1).stores({
      projects: 'id, name, updatedAt',
    })
  }
}

export const db = new TrackOpsDB()

export async function listProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id)
}

export async function saveProject(project: Project): Promise<void> {
  await db.projects.put(project)
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id)
}
