import type { Project } from '@/lib/types'

export type SyncConfig = {
  endpoint: string
  token: string | null
  userName: string
}

export type RemoteProjectSummary = {
  id: string
  name: string
  updatedAt: string
  size: number
}

export type PresenceUser = {
  id: string
  name: string
  color: string
}

export type SyncEvent =
  | { type: 'project-updated'; project: Project }
  | { type: 'project-deleted'; id: string }
  | { type: 'presence'; users: PresenceUser[] }

export type SyncStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface SyncAdapter {
  readonly config: SyncConfig
  list(): Promise<RemoteProjectSummary[]>
  pull(id: string): Promise<Project | null>
  push(project: Project): Promise<void>
  remove(id: string): Promise<void>
  subscribe(
    projectId: string,
    handler: (event: SyncEvent) => void,
    onStatus: (status: SyncStatus, error?: string) => void,
  ): () => void
}
