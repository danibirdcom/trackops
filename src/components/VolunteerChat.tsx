import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X, Sparkles, AlertTriangle, Loader2 } from 'lucide-react'
import { sendChatTurn, type ChatMessage } from '@/lib/ai/chat'

type Props = {
  projectId: string
  volunteerId: string
  volunteerName: string
}

export default function VolunteerChat({ projectId, volunteerId, volunteerName }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || bootstrapped) return
    setBootstrapped(true)
    void fetchInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, busy])

  const fetchInitial = async () => {
    setBusy(true)
    setError(null)
    const result = await sendChatTurn(projectId, volunteerId, [])
    setBusy(false)
    if ('error' in result) {
      if (result.status === 501) {
        setError('La ayuda inteligente no está configurada en este servidor.')
      } else {
        setError(result.error)
      }
      return
    }
    const reply: ChatMessage = { role: 'model', text: result.text }
    setMessages([reply])
    setHistory([reply])
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    const userMsg: ChatMessage = { role: 'user', text }
    const nextHistory = [...history, userMsg]
    setMessages((m) => [...m, userMsg])
    setHistory(nextHistory)
    setInput('')
    setBusy(true)
    setError(null)
    const result = await sendChatTurn(projectId, volunteerId, nextHistory)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    const reply: ChatMessage = { role: 'model', text: result.text }
    setMessages((m) => [...m, reply])
    setHistory((h) => [...h, reply])
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-[1100] inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90"
          aria-label="Abrir chat de ayuda"
          title="Ayuda IA"
        >
          <MessageCircle className="size-6" />
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-[1100] flex items-end justify-end bg-black/30 sm:inset-auto sm:bottom-4 sm:right-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-lg border border-border bg-background shadow-xl sm:h-[520px] sm:w-[380px] sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center gap-2 border-b border-border p-3">
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-semibold">Ayuda IA</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  Para {volunteerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-accent"
                aria-label="Cerrar chat"
              >
                <X className="size-4" />
              </button>
            </header>

            <div
              ref={listRef}
              className="flex-1 space-y-2 overflow-auto p-3 text-sm"
            >
              {messages.length === 0 && !busy && !error && (
                <p className="text-muted-foreground text-[13px]">
                  Pulsa cualquier tecla para empezar. Preparando tu briefing…
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3 py-2 text-[13px] text-primary-foreground'
                      : 'mr-auto max-w-[90%] rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-[13px] leading-snug whitespace-pre-line'
                  }
                >
                  {m.text}
                </div>
              ))}
              {busy && (
                <div className="mr-auto inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[12px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Pensando…
                </div>
              )}
              {error && (
                <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5" /> {error}
                </p>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
              className="flex items-center gap-2 border-t border-border p-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pregunta lo que quieras…"
                disabled={busy || Boolean(error && error.includes('no está configurada'))}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || input.trim().length === 0}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                aria-label="Enviar"
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
