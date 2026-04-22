import type { SessionToken } from './types'

const STORAGE_KEY = 'trackops.sync.sessions'

type StoredSessions = Record<string, SessionToken>

function load(): StoredSessions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as StoredSessions
    const now = Date.now()
    let changed = false
    for (const [id, s] of Object.entries(parsed)) {
      if (!s || typeof s.token !== 'string' || typeof s.exp !== 'number' || s.exp < now) {
        delete parsed[id]
        changed = true
      }
    }
    if (changed) persist(parsed)
    return parsed
  } catch {
    return {}
  }
}

function persist(sessions: StoredSessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    /* ignore quota errors */
  }
}

export const SessionStore = {
  load,
  getValid(projectId: string): string | null {
    const s = load()[projectId]
    if (!s) return null
    if (s.exp < Date.now()) return null
    return s.token
  },
  save(projectId: string, session: SessionToken) {
    const all = load()
    all[projectId] = session
    persist(all)
  },
  drop(projectId: string) {
    const all = load()
    delete all[projectId]
    persist(all)
  },
}
