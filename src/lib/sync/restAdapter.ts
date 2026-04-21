import type { Project } from '@/lib/types'
import type {
  PresenceUser,
  RemoteProjectSummary,
  SyncAdapter,
  SyncConfig,
  SyncEvent,
  SyncStatus,
} from './types'

function authHeaders(cfg: SyncConfig): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.token) h['Authorization'] = `Bearer ${cfg.token}`
  return h
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/$/, '')
}

export class RestSyncAdapter implements SyncAdapter {
  readonly config: SyncConfig

  constructor(config: SyncConfig) {
    this.config = { ...config, endpoint: normalizeEndpoint(config.endpoint) }
  }

  async list(): Promise<RemoteProjectSummary[]> {
    const res = await fetch(`${this.config.endpoint}/api/projects`, {
      headers: authHeaders(this.config),
    })
    if (!res.ok) throw new Error(`No se pudo listar (${res.status})`)
    return (await res.json()) as RemoteProjectSummary[]
  }

  async pull(id: string): Promise<Project | null> {
    const res = await fetch(`${this.config.endpoint}/api/projects/${encodeURIComponent(id)}`, {
      headers: authHeaders(this.config),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`No se pudo descargar (${res.status})`)
    return (await res.json()) as Project
  }

  async push(project: Project): Promise<void> {
    const res = await fetch(`${this.config.endpoint}/api/projects/${encodeURIComponent(project.id)}`, {
      method: 'PUT',
      headers: authHeaders(this.config),
      body: JSON.stringify(project),
    })
    if (!res.ok) throw new Error(`No se pudo subir (${res.status})`)
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(`${this.config.endpoint}/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(this.config),
    })
    if (!res.ok && res.status !== 404) throw new Error(`No se pudo borrar (${res.status})`)
  }

  subscribe(
    projectId: string,
    handler: (event: SyncEvent) => void,
    onStatus: (status: SyncStatus, error?: string) => void,
  ): () => void {
    const params = new URLSearchParams({
      projectId,
      userName: this.config.userName,
    })
    if (this.config.token) params.set('token', this.config.token)
    const url = `${this.config.endpoint}/api/events?${params.toString()}`

    onStatus('connecting')
    const source = new EventSource(url)

    let closed = false
    source.onopen = () => {
      if (!closed) onStatus('connected')
    }
    source.onerror = () => {
      if (!closed) onStatus('error', 'Conexión SSE perdida')
    }

    source.addEventListener('project-updated', (ev) => {
      try {
        const project = JSON.parse((ev as MessageEvent).data) as Project
        handler({ type: 'project-updated', project })
      } catch {
        /* ignore malformed payload */
      }
    })
    source.addEventListener('project-deleted', (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { id: string }
        handler({ type: 'project-deleted', id: data.id })
      } catch {
        /* ignore */
      }
    })
    source.addEventListener('presence', (ev) => {
      try {
        const users = JSON.parse((ev as MessageEvent).data) as PresenceUser[]
        handler({ type: 'presence', users })
      } catch {
        /* ignore */
      }
    })

    return () => {
      closed = true
      source.close()
      onStatus('disconnected')
    }
  }
}
