import { useEffect, useMemo } from 'react'
import { Play, Pause, RotateCcw, X, Gauge, Clock } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useSimulationStore } from '@/stores/simulationStore'
import {
  aggregateRaceWindow,
  formatClockWithSeconds,
} from '@/lib/race/simulation'
import { cn } from '@/lib/utils'

const SPEEDS = [1, 10, 60, 300, 600, 1800]

export default function SimulationBar() {
  const current = useProjectStore((s) => s.current)
  const active = useSimulationStore((s) => s.active)
  const playing = useSimulationStore((s) => s.playing)
  const currentMs = useSimulationStore((s) => s.currentMs)
  const speed = useSimulationStore((s) => s.speed)
  const setActive = useSimulationStore((s) => s.setActive)
  const setCurrentMs = useSimulationStore((s) => s.setCurrentMs)
  const setSpeed = useSimulationStore((s) => s.setSpeed)
  const play = useSimulationStore((s) => s.play)
  const pause = useSimulationStore((s) => s.pause)

  const window = useMemo(
    () => (current ? aggregateRaceWindow(current.tracks) : null),
    [current],
  )

  useEffect(() => {
    if (!active || !window) return
    if (currentMs === null) setCurrentMs(window.startMs)
  }, [active, window, currentMs, setCurrentMs])

  useEffect(() => {
    if (!window) return
    if (currentMs !== null && currentMs >= window.endMs && playing) {
      pause()
    }
  }, [currentMs, window, playing, pause])

  if (!active || !window) return null

  const progress =
    currentMs === null
      ? 0
      : Math.max(0, Math.min(1, (currentMs - window.startMs) / (window.endMs - window.startMs || 1)))

  const reset = () => {
    pause()
    setCurrentMs(window.startMs)
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-center p-3">
      <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => (playing ? pause() : play())}
            className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
            aria-label={playing ? 'Pausar' : 'Reproducir'}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border hover:bg-accent"
            aria-label="Reiniciar"
            title="Reiniciar"
          >
            <RotateCcw className="size-3.5" />
          </button>

          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="inline-flex items-center gap-1 font-medium tabular-nums">
              <Clock className="size-3 text-muted-foreground" />
              {currentMs !== null ? formatClockWithSeconds(currentMs) : '—'}
            </span>
            <span className="truncate text-[10px] text-muted-foreground">
              {formatClockWithSeconds(window.startMs)} → {formatClockWithSeconds(window.endMs)}
            </span>
          </div>

          <div className="hidden items-center gap-1 sm:flex">
            <Gauge className="size-3 text-muted-foreground" />
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                className={cn(
                  'rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums',
                  speed === s
                    ? 'border-primary bg-accent'
                    : 'border-border hover:bg-accent/50',
                )}
                title={`${s}× tiempo real`}
              >
                {s}×
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setActive(false)}
            className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Cerrar simulación"
            title="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>

        <input
          type="range"
          min={window.startMs}
          max={window.endMs}
          value={currentMs ?? window.startMs}
          step={1000}
          onChange={(e) => {
            pause()
            setCurrentMs(Number(e.target.value))
          }}
          className="w-full"
          aria-label="Línea temporal de la simulación"
          style={{
            background: `linear-gradient(to right, rgb(var(--primary-rgb, 59 130 246)) ${progress * 100}%, rgba(var(--muted-rgb, 148 163 184), 0.3) ${progress * 100}%)`,
          }}
        />

        <div className="flex sm:hidden items-center gap-1 text-[10px]">
          <Gauge className="size-3 text-muted-foreground" />
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                'flex-1 rounded-md border py-0.5 tabular-nums',
                speed === s ? 'border-primary bg-accent' : 'border-border',
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
