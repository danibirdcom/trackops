export type SwStatus = {
  registered: boolean
  updateReady: boolean
  error?: string
}

type Listener = (status: SwStatus) => void

let status: SwStatus = { registered: false, updateReady: false }
const listeners = new Set<Listener>()
let waitingRegistration: ServiceWorkerRegistration | null = null

function notify() {
  for (const l of listeners) l(status)
}

export function subscribeSw(listener: Listener): () => void {
  listeners.add(listener)
  listener(status)
  return () => listeners.delete(listener)
}

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    status = { ...status, registered: true }
    notify()

    if (reg.waiting) {
      waitingRegistration = reg
      status = { ...status, updateReady: true }
      notify()
    }

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          waitingRegistration = reg
          status = { ...status, updateReady: true }
          notify()
        }
      })
    })

    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  } catch (err) {
    status = { ...status, error: err instanceof Error ? err.message : 'SW registration failed' }
    notify()
  }
}

export function applySwUpdate(): void {
  const reg = waitingRegistration
  if (!reg?.waiting) return
  reg.waiting.postMessage({ type: 'SKIP_WAITING' })
}

export async function getTileCacheStats(): Promise<number | null> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return null
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timeout = setTimeout(() => resolve(null), 2000)
    channel.port1.onmessage = (ev) => {
      clearTimeout(timeout)
      const data = ev.data as { type?: string; count?: number }
      if (data.type === 'TILE_CACHE_STATS') resolve(data.count ?? 0)
      else resolve(null)
    }
    navigator.serviceWorker.controller!.postMessage(
      { type: 'TILE_CACHE_STATS' },
      [channel.port2],
    )
  })
}

export function clearTileCache(): void {
  navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_TILES' })
}
