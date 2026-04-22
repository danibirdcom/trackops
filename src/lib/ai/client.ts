import { useSyncStore } from '@/stores/syncStore'

export type AIDescription = {
  text: string
  source: 'ai' | 'fallback'
}

export async function fetchAIDescription(
  projectId: string,
  volunteerId: string,
): Promise<string | null> {
  const adapter = useSyncStore.getState().adapter
  if (!adapter) return null
  const endpoint = adapter.config.endpoint
  try {
    const res = await fetch(`${endpoint}/api/ai/describe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, volunteerId }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { text?: string }
    if (typeof data.text === 'string' && data.text.trim().length > 0) {
      return data.text.trim()
    }
    return null
  } catch {
    return null
  }
}
