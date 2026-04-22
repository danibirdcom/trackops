import { useSyncStore } from '@/stores/syncStore'
import { loadSyncConfig } from './config'

function randomAnimalName(): string {
  const animals = ['Lince', 'Halcón', 'Jabalí', 'Salamandra', 'Milano', 'Gineta', 'Tejón']
  const n = animals[Math.floor(Math.random() * animals.length)] ?? 'Anon'
  return `${n} ${Math.floor(Math.random() * 900 + 100)}`
}

export async function autoConfigureSync(): Promise<void> {
  if (typeof window === 'undefined') return
  const existing = loadSyncConfig()
  if (existing?.endpoint) return

  const origin = window.location.origin
  if (!origin.startsWith('http')) return

  try {
    const res = await fetch(`${origin}/api/projects`, { method: 'GET' })
    if (!res.ok) return
  } catch {
    return
  }

  useSyncStore.getState().enable({
    endpoint: origin,
    token: null,
    userName: randomAnimalName(),
  })
}
