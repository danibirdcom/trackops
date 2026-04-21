import type { SyncConfig } from './types'

const STORAGE_KEY = 'trackops.sync.config'

function randomName(): string {
  const animals = ['Lince', 'Halcón', 'Sardina', 'Jabalí', 'Salamandra', 'Milano', 'Gineta', 'Tejón']
  const n = animals[Math.floor(Math.random() * animals.length)] ?? 'Anon'
  const num = Math.floor(Math.random() * 900 + 100)
  return `${n} ${num}`
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    if (!parsed.endpoint) return null
    return {
      endpoint: parsed.endpoint,
      token: parsed.token ?? null,
      userName: parsed.userName || randomName(),
    }
  } catch {
    return null
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearSyncConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function defaultSyncConfig(): SyncConfig {
  return {
    endpoint: '',
    token: null,
    userName: randomName(),
  }
}
