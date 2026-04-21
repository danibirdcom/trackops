import { create } from 'zustand'

const TICK_MS = 100

type SimulationStore = {
  active: boolean
  playing: boolean
  currentMs: number | null
  speed: number
  tick: ReturnType<typeof setInterval> | null
  setActive: (on: boolean) => void
  setCurrentMs: (ms: number) => void
  setSpeed: (s: number) => void
  play: () => void
  pause: () => void
  stop: () => void
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  active: false,
  playing: false,
  currentMs: null,
  speed: 60,
  tick: null,

  setActive: (on) => {
    const { tick } = get()
    if (!on && tick) clearInterval(tick)
    set({ active: on, playing: false, tick: null })
  },

  setCurrentMs: (ms) => set({ currentMs: ms }),

  setSpeed: (s) => set({ speed: s }),

  play: () => {
    const { tick } = get()
    if (tick) return
    const handle = setInterval(() => {
      set((state) => {
        const base = state.currentMs ?? Date.now()
        return { currentMs: base + state.speed * TICK_MS }
      })
    }, TICK_MS)
    set({ playing: true, tick: handle })
  },

  pause: () => {
    const { tick } = get()
    if (tick) clearInterval(tick)
    set({ playing: false, tick: null })
  },

  stop: () => {
    const { tick } = get()
    if (tick) clearInterval(tick)
    set({ playing: false, currentMs: null, tick: null })
  },
}))
