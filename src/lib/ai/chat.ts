import { useSyncStore } from '@/stores/syncStore'

export type ChatRole = 'user' | 'model'
export type ChatMessage = { role: ChatRole; text: string }

export async function sendChatTurn(
  projectId: string,
  volunteerId: string,
  history: ChatMessage[],
): Promise<{ text: string } | { error: string; status: number }> {
  const adapter = useSyncStore.getState().adapter
  if (!adapter) return { error: 'Sincronización no disponible', status: 0 }
  const endpoint = adapter.config.endpoint
  try {
    const res = await fetch(`${endpoint}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, volunteerId, history }),
    })
    if (!res.ok) {
      let message = `HTTP ${res.status}`
      try {
        const data = (await res.json()) as { error?: string }
        if (data?.error) message = data.error
      } catch {
        /* ignore */
      }
      return { error: message, status: res.status }
    }
    const data = (await res.json()) as { text?: string }
    if (typeof data.text !== 'string') return { error: 'Respuesta vacía', status: res.status }
    return { text: data.text }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error de red', status: 0 }
  }
}
