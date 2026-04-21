import pako from 'pako'
import type { Project } from '@/lib/types'

const PAYLOAD_KEY = 'p'
const URL_WARN_THRESHOLD = 16000
const URL_MAX_SAFE = 32000

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function stripContactInfo(project: Project): Project {
  return {
    ...project,
    volunteers: project.volunteers.map((v) => ({ ...v, phone: null, email: null })),
  }
}

export function encodeProjectForUrl(project: Project): string {
  const json = JSON.stringify(project)
  const compressed = pako.deflate(new TextEncoder().encode(json))
  return toBase64Url(compressed)
}

export function decodeProjectFromPayload(encoded: string): Project {
  const bytes = fromBase64Url(encoded)
  const json = new TextDecoder().decode(pako.inflate(bytes))
  return JSON.parse(json) as Project
}

export type ShareUrlResult = {
  url: string
  payloadLength: number
  sizeWarning: 'ok' | 'large' | 'oversize'
}

export function buildShareUrl(
  project: Project,
  opts: { includeContact: boolean },
): ShareUrlResult {
  const data = opts.includeContact ? project : stripContactInfo(project)
  const encoded = encodeProjectForUrl(data)
  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const url = `${window.location.origin}${basePath}/share#${PAYLOAD_KEY}=${encoded}`
  const sizeWarning: ShareUrlResult['sizeWarning'] =
    url.length > URL_MAX_SAFE ? 'oversize' : url.length > URL_WARN_THRESHOLD ? 'large' : 'ok'
  return { url, payloadLength: url.length, sizeWarning }
}

export function readPayloadFromLocationHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw) return null
  const params = new URLSearchParams(raw)
  const direct = params.get(PAYLOAD_KEY)
  if (direct) return direct
  if (!raw.includes('=')) return raw
  return null
}
