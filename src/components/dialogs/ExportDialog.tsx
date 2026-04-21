import { useState } from 'react'
import { X, FileText, Users, Link2, Download, Copy, Check, AlertTriangle } from 'lucide-react'
import type { Project } from '@/lib/types'
import { downloadProject } from '@/lib/export/projectJson'
import { exportPlanPdf } from '@/lib/export/pdfPlan'
import { exportDirectoryPdf } from '@/lib/export/pdfDirectory'
import { buildShareUrl, type ShareUrlResult } from '@/lib/export/shareUrl'
import { cn } from '@/lib/utils'

type Props = {
  project: Project
  onClose: () => void
}

export default function ExportDialog({ project, onClose }: Props) {
  const [busy, setBusy] = useState<null | 'plan' | 'directory' | 'json' | 'share'>(null)
  const [error, setError] = useState<string | null>(null)
  const [includeContact, setIncludeContact] = useState(false)
  const [share, setShare] = useState<ShareUrlResult | null>(null)
  const [copied, setCopied] = useState(false)

  const hasContacts = project.volunteers.some((v) => v.phone || v.email)

  const runPdfPlan = async () => {
    setError(null)
    setBusy('plan')
    try {
      const el = document.querySelector<HTMLElement>('.leaflet-container')
      if (!el) throw new Error('No se ha encontrado el mapa.')
      await exportPlanPdf(project, el)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando PDF')
    } finally {
      setBusy(null)
    }
  }

  const runPdfDirectory = () => {
    setError(null)
    setBusy('directory')
    try {
      exportDirectoryPdf(project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando PDF')
    } finally {
      setBusy(null)
    }
  }

  const runJson = () => {
    setError(null)
    setBusy('json')
    try {
      downloadProject(project)
    } finally {
      setBusy(null)
    }
  }

  const genShareUrl = () => {
    setError(null)
    setBusy('share')
    try {
      const result = buildShareUrl(project, { includeContact })
      setShare(result)
      setCopied(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error generando URL')
    } finally {
      setBusy(null)
    }
  }

  const copyShare = async () => {
    if (!share) return
    try {
      await navigator.clipboard.writeText(share.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se ha podido copiar al portapapeles.')
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <header className="flex items-center gap-2 border-b border-border p-3">
          <p className="flex-1 text-sm font-semibold">Exportar y compartir</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-accent"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
          {error && (
            <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
              <AlertTriangle className="size-3.5" /> {error}
            </p>
          )}

          <section className="rounded-md border border-border p-3">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 size-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">PDF del plano operativo</p>
                <p className="text-xs text-muted-foreground">
                  Captura del mapa + leyenda por sectores. A4 horizontal. No incluye datos de contacto.
                </p>
              </div>
              <button
                type="button"
                onClick={runPdfPlan}
                disabled={busy !== null}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy === 'plan' ? 'Generando…' : 'Descargar'}
              </button>
            </div>
          </section>

          <section className="rounded-md border border-border p-3">
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 size-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">PDF del directorio de voluntarios</p>
                <p className="text-xs text-muted-foreground">
                  Tabla con teléfono, email, rol, sector y puntos asignados. Pensado para impresión interna.
                </p>
              </div>
              <button
                type="button"
                onClick={runPdfDirectory}
                disabled={busy !== null || project.volunteers.length === 0}
                className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {busy === 'directory' ? 'Generando…' : 'Descargar'}
              </button>
            </div>
          </section>

          <section className="rounded-md border border-border p-3">
            <div className="flex items-start gap-2">
              <Download className="mt-0.5 size-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">Proyecto como JSON</p>
                <p className="text-xs text-muted-foreground">
                  Copia de seguridad completa. Se puede reimportar desde la pantalla inicial.
                </p>
              </div>
              <button
                type="button"
                onClick={runJson}
                disabled={busy !== null}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                .trackops.json
              </button>
            </div>
          </section>

          <section className="rounded-md border border-border p-3">
            <div className="flex items-start gap-2">
              <Link2 className="mt-0.5 size-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">Enlace de solo lectura</p>
                <p className="text-xs text-muted-foreground">
                  El proyecto se serializa comprimido dentro de la propia URL (no hay servidor).
                  Cualquiera con el enlace puede abrir la vista.
                </p>

                {hasContacts && (
                  <label className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                    <input
                      type="checkbox"
                      checked={includeContact}
                      onChange={(e) => {
                        setIncludeContact(e.target.checked)
                        setShare(null)
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Incluir datos de contacto</span> (teléfono, email)
                      en el enlace. Por defecto se omiten para proteger la privacidad del voluntariado.
                    </span>
                  </label>
                )}

                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={genShareUrl}
                    disabled={busy !== null}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {busy === 'share' ? 'Generando…' : share ? 'Regenerar' : 'Generar enlace'}
                  </button>
                </div>

                {share && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={share.url}
                        className="min-w-0 flex-1 rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11px]"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        onClick={copyShare}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                      >
                        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                        {copied ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>
                    <p
                      className={cn(
                        'text-[11px]',
                        share.sizeWarning === 'oversize'
                          ? 'text-destructive'
                          : share.sizeWarning === 'large'
                            ? 'text-amber-600 dark:text-amber-500'
                            : 'text-muted-foreground',
                      )}
                    >
                      {(share.payloadLength / 1024).toFixed(1)} KB ·{' '}
                      {share.sizeWarning === 'oversize'
                        ? 'Supera el límite práctico de URL (~32 KB). Muchos navegadores pueden rechazarla.'
                        : share.sizeWarning === 'large'
                          ? 'Enlace largo: valida que el destinatario pueda abrirlo sin truncar.'
                          : 'Tamaño dentro del rango seguro.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
