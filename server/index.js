#!/usr/bin/env node
/**
 * TrackOps sync server — REST + SSE with file-backed JSON storage.
 * Per-project passwords (scrypt) gate writes. Reads are public.
 * Zero external dependencies. Run with Node >= 18.
 *
 *   PORT=8787 node server/index.js
 */

import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(process.env.TRACKOPS_DATA_DIR ?? path.join(__dirname, 'data'))
const LEGACY_TOKEN = process.env.TRACKOPS_TOKEN ?? null
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? null
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash'
const PORT = Number(process.env.PORT ?? 8787)
const MAX_BODY = 8 * 1024 * 1024
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const SCRYPT_KEY_LEN = 64
const AI_CACHE_TTL_MS = 10 * 60 * 1000

await fs.mkdir(DATA_DIR, { recursive: true })

/** @type {Map<string, Set<import('node:http').ServerResponse>>} */
const subscribersByProject = new Map()
/** @type {Map<import('node:http').ServerResponse, { id: string, name: string, color: string, projectId: string }>} */
const subscriberMeta = new Map()
/** @type {Map<string, { projectId: string, exp: number }>} */
const sessions = new Map()
/** @type {Map<string, { text: string, exp: number }>} */
const aiCache = new Map()

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(res, status, data, origin) {
  res.writeHead(status, {
    ...corsHeaders(origin),
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(data))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      const buf = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(buf ? JSON.parse(buf) : null)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function legacyAuthOk(req) {
  if (!LEGACY_TOKEN) return true
  const auth = req.headers.authorization ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/)
  if (m && m[1] === LEGACY_TOKEN) return true
  const url = new URL(req.url ?? '', 'http://localhost')
  if (url.searchParams.get('token') === LEGACY_TOKEN) return true
  return false
}

function bearerToken(req) {
  const auth = req.headers.authorization ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/)
  return m ? m[1] : null
}

function projectPath(id) {
  if (!/^[\w.-]+$/.test(id)) throw new Error('invalid id')
  return path.join(DATA_DIR, `${id}.json`)
}

function authPath(id) {
  if (!/^[\w.-]+$/.test(id)) throw new Error('invalid id')
  return path.join(DATA_DIR, `${id}.auth.json`)
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN).toString('hex')
  return { salt, hash }
}

function verifyPassword(password, salt, expectedHash) {
  try {
    const actual = crypto.scryptSync(password, salt, SCRYPT_KEY_LEN)
    const expected = Buffer.from(expectedHash, 'hex')
    if (actual.length !== expected.length) return false
    return crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

async function loadAuth(id) {
  try {
    return JSON.parse(await fs.readFile(authPath(id), 'utf8'))
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw err
  }
}

async function saveAuth(id, data) {
  await fs.writeFile(authPath(id), JSON.stringify(data))
}

async function deleteAuth(id) {
  try {
    await fs.unlink(authPath(id))
  } catch {
    /* ignore */
  }
}

function purgeSessions() {
  const now = Date.now()
  for (const [t, s] of sessions) if (s.exp < now) sessions.delete(t)
}

function createSession(projectId) {
  purgeSessions()
  const token = `${randomUUID()}.${crypto.randomBytes(16).toString('hex')}`
  const exp = Date.now() + SESSION_TTL_MS
  sessions.set(token, { projectId, exp })
  return { token, exp }
}

function validateSession(token, projectId) {
  const s = sessions.get(token)
  if (!s) return false
  if (s.exp < Date.now()) {
    sessions.delete(token)
    return false
  }
  return s.projectId === projectId
}

function revokeSession(token) {
  sessions.delete(token)
}

async function listProjects() {
  const entries = await fs.readdir(DATA_DIR)
  const out = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    if (entry.endsWith('.auth.json')) continue
    const id = entry.replace(/\.json$/, '')
    try {
      const full = path.join(DATA_DIR, entry)
      const stat = await fs.stat(full)
      const data = JSON.parse(await fs.readFile(full, 'utf8'))
      let protectedFlag = false
      try {
        await fs.access(authPath(id))
        protectedFlag = true
      } catch {
        /* no password */
      }
      out.push({
        id,
        name: data.name ?? id,
        updatedAt: data.updatedAt ?? stat.mtime.toISOString(),
        eventDate: data.eventDate ?? null,
        trackCount: Array.isArray(data.tracks) ? data.tracks.length : 0,
        volunteerCount: Array.isArray(data.volunteers) ? data.volunteers.length : 0,
        size: stat.size,
        protected: protectedFlag,
      })
    } catch {
      /* skip corrupt */
    }
  }
  out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return out
}

async function loadProject(id) {
  try {
    const data = await fs.readFile(projectPath(id), 'utf8')
    return JSON.parse(data)
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw err
  }
}

async function saveProjectFile(project) {
  const full = projectPath(project.id)
  const tmp = `${full}.tmp`
  await fs.writeFile(tmp, JSON.stringify(project))
  await fs.rename(tmp, full)
}

async function deleteProjectFile(id) {
  try {
    await fs.unlink(projectPath(id))
    await deleteAuth(id)
    return true
  } catch (err) {
    if (err && err.code === 'ENOENT') return false
    throw err
  }
}

function broadcast(projectId, event, data) {
  const subs = subscribersByProject.get(projectId)
  if (!subs) return
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of subs) {
    try {
      res.write(payload)
    } catch {
      /* ignore */
    }
  }
}

function broadcastPresence(projectId) {
  const subs = subscribersByProject.get(projectId)
  if (!subs) return
  const users = [...subs]
    .map((res) => {
      const meta = subscriberMeta.get(res)
      return meta ? { id: meta.id, name: meta.name, color: meta.color } : null
    })
    .filter(Boolean)
  broadcast(projectId, 'presence', users)
}

const COLOR_PALETTE = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

function pickColor() {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)]
}

function handleSse(req, res, origin) {
  const url = new URL(req.url ?? '', 'http://localhost')
  const projectId = url.searchParams.get('projectId')
  const name = (url.searchParams.get('userName') || 'Anon').slice(0, 48)
  if (!projectId) {
    res.writeHead(400, corsHeaders(origin))
    res.end('missing projectId')
    return
  }
  res.writeHead(200, {
    ...corsHeaders(origin),
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(`: connected ${new Date().toISOString()}\n\n`)

  const id = randomUUID()
  const meta = { id, name, color: pickColor(), projectId }
  subscriberMeta.set(res, meta)
  if (!subscribersByProject.has(projectId)) subscribersByProject.set(projectId, new Set())
  subscribersByProject.get(projectId).add(res)
  broadcastPresence(projectId)

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      /* will be cleaned up on close */
    }
  }, 20000)

  req.on('close', () => {
    clearInterval(ping)
    subscribersByProject.get(projectId)?.delete(res)
    subscriberMeta.delete(res)
    broadcastPresence(projectId)
  })
}

async function generateDescription(project, volunteer) {
  const assignedPoints = (project.points ?? []).filter((p) => p.volunteerIds?.includes(volunteer.id))
  const sectorIds = new Set()
  for (const p of assignedPoints) if (p.sectorId) sectorIds.add(p.sectorId)
  for (const s of project.sectors ?? []) if (s.chiefVolunteerId === volunteer.id) sectorIds.add(s.id)
  const sectors = (project.sectors ?? []).filter((s) => sectorIds.has(s.id))
  const chiefs = []
  for (const s of sectors) {
    if (s.chiefVolunteerId && s.chiefVolunteerId !== volunteer.id) {
      const chief = project.volunteers.find((v) => v.id === s.chiefVolunteerId)
      if (chief) chiefs.push({ sector: s.name, name: chief.name })
    }
  }
  const context = {
    evento: project.name,
    voluntario: {
      nombre: volunteer.name,
      rol: volunteer.role || null,
      notas_del_organizador: volunteer.notes || null,
    },
    puntos: assignedPoints.map((p) => ({
      nombre: p.name,
      tipo: p.type,
      km: p.kmMark,
      descripcion_del_organizador: p.description || null,
    })),
    sectores: sectors.map((s) => ({ nombre: s.name, notas: s.notes || null })),
    responsables_de_zona: chiefs,
    es_responsable_de_sector: sectors.some((s) => s.chiefVolunteerId === volunteer.id),
  }

  const prompt = `Eres el asistente de un evento deportivo al aire libre. Redacta en segundo persona (trato de tú) un briefing claro y operativo para este voluntario, en español, de entre 80 y 140 palabras.

REGLAS IMPORTANTES:
1. Si el campo "descripcion_del_organizador" de algún punto contiene texto, **respeta su contenido íntegro** y úsalo como núcleo del briefing. Solo puedes mejorar la redacción o la claridad semántica, nunca suprimir ni inventar información.
2. Si "notas_del_organizador" del voluntario contiene texto, intégralo con el mismo criterio.
3. Si los campos están vacíos, redacta tú un briefing adecuado al tipo de punto y al rol del voluntario.
4. Menciona explícitamente la posición (nombre del punto y km si aplica) y al responsable de zona si lo hay.
5. No inventes datos que no estén en el contexto. No añadas disclaimers ni líneas en blanco. No uses markdown ni comillas.
6. Termina con una frase corta de coordinación (a quién avisar ante cualquier incidencia).

CONTEXTO (JSON):
${JSON.stringify(context, null, 2)}

Devuelve solo el texto final del briefing.`

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      console.error('[trackops-sync] gemini error', resp.status, errText.slice(0, 400))
      throw new Error(`gemini ${resp.status}`)
    }
    const data = await resp.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('gemini empty response')
    }
    return text.trim()
  } catch (err) {
    console.error('[trackops-sync] ai fallback:', err.message ?? err)
    throw err
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin
  const url = new URL(req.url ?? '', 'http://localhost')

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin))
    res.end()
    return
  }

  if (!legacyAuthOk(req)) {
    res.writeHead(401, corsHeaders(origin))
    res.end('unauthorised')
    return
  }

  try {
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      const list = await listProjects()
      return json(res, 200, list, origin)
    }

    const loginMatch = url.pathname.match(/^\/api\/projects\/([\w.-]+)\/auth\/login$/)
    if (loginMatch && req.method === 'POST') {
      const id = loginMatch[1]
      const body = await readBody(req)
      const auth = await loadAuth(id)
      if (!auth) return json(res, 404, { error: 'no password set' }, origin)
      if (!body || typeof body.password !== 'string') {
        return json(res, 400, { error: 'password required' }, origin)
      }
      if (!verifyPassword(body.password, auth.salt, auth.hash)) {
        return json(res, 401, { error: 'invalid password' }, origin)
      }
      const session = createSession(id)
      return json(res, 200, session, origin)
    }

    const logoutMatch = url.pathname.match(/^\/api\/projects\/([\w.-]+)\/auth\/logout$/)
    if (logoutMatch && req.method === 'POST') {
      const token = bearerToken(req)
      if (token) revokeSession(token)
      return json(res, 200, { ok: true }, origin)
    }

    const pwMatch = url.pathname.match(/^\/api\/projects\/([\w.-]+)\/password$/)
    if (pwMatch && req.method === 'POST') {
      const id = pwMatch[1]
      const body = await readBody(req)
      const newPassword = body?.newPassword
      if (typeof newPassword !== 'string' || newPassword.length < 4) {
        return json(res, 400, { error: 'password min 4 chars' }, origin)
      }
      const existing = await loadAuth(id)
      if (existing) {
        const token = bearerToken(req)
        const tokenOk = token && validateSession(token, id)
        const currentOk =
          typeof body.currentPassword === 'string' &&
          verifyPassword(body.currentPassword, existing.salt, existing.hash)
        if (!tokenOk && !currentOk) {
          return json(res, 401, { error: 'auth required' }, origin)
        }
      }
      await saveAuth(id, hashPassword(newPassword))
      const session = createSession(id)
      return json(res, 200, session, origin)
    }

    const unprotectMatch = url.pathname.match(/^\/api\/projects\/([\w.-]+)\/password$/)
    if (unprotectMatch && req.method === 'DELETE') {
      const id = unprotectMatch[1]
      const existing = await loadAuth(id)
      if (!existing) return json(res, 200, { ok: true }, origin)
      const token = bearerToken(req)
      if (!token || !validateSession(token, id)) {
        return json(res, 401, { error: 'auth required' }, origin)
      }
      await deleteAuth(id)
      return json(res, 200, { ok: true }, origin)
    }

    const projectMatch = url.pathname.match(/^\/api\/projects\/([\w.-]+)$/)
    if (projectMatch) {
      const id = projectMatch[1]
      if (req.method === 'GET') {
        const project = await loadProject(id)
        if (!project) return json(res, 404, { error: 'not found' }, origin)
        return json(res, 200, project, origin)
      }
      if (req.method === 'PUT') {
        const body = await readBody(req)
        if (!body || typeof body !== 'object' || body.id !== id) {
          return json(res, 400, { error: 'invalid payload' }, origin)
        }
        const auth = await loadAuth(id)
        if (auth) {
          const token = bearerToken(req)
          if (!token || !validateSession(token, id)) {
            return json(res, 401, { error: 'auth required' }, origin)
          }
        }
        await saveProjectFile(body)
        broadcast(id, 'project-updated', body)
        return json(res, 200, { ok: true }, origin)
      }
      if (req.method === 'DELETE') {
        const auth = await loadAuth(id)
        if (auth) {
          const token = bearerToken(req)
          if (!token || !validateSession(token, id)) {
            return json(res, 401, { error: 'auth required' }, origin)
          }
        }
        const ok = await deleteProjectFile(id)
        if (ok) broadcast(id, 'project-deleted', { id })
        return json(res, ok ? 200 : 404, { ok }, origin)
      }
    }

    if (url.pathname === '/api/events' && req.method === 'GET') {
      handleSse(req, res, origin)
      return
    }

    if (url.pathname === '/api/ai/describe' && req.method === 'POST') {
      if (!GEMINI_API_KEY) {
        return json(res, 501, { error: 'AI not configured' }, origin)
      }
      const body = await readBody(req)
      const projectId = body?.projectId
      const volunteerId = body?.volunteerId
      if (!projectId || !volunteerId) {
        return json(res, 400, { error: 'projectId y volunteerId requeridos' }, origin)
      }
      const project = await loadProject(projectId)
      if (!project) return json(res, 404, { error: 'proyecto no encontrado' }, origin)
      const volunteer = (project.volunteers ?? []).find((v) => v.id === volunteerId)
      if (!volunteer) return json(res, 404, { error: 'voluntario no encontrado' }, origin)

      const cacheKey = `${projectId}:${volunteerId}:${project.updatedAt}`
      const cached = aiCache.get(cacheKey)
      if (cached && cached.exp > Date.now()) {
        return json(res, 200, { text: cached.text, cached: true }, origin)
      }

      const text = await generateDescription(project, volunteer)
      aiCache.set(cacheKey, { text, exp: Date.now() + AI_CACHE_TTL_MS })
      return json(res, 200, { text }, origin)
    }

    res.writeHead(404, corsHeaders(origin))
    res.end('not found')
  } catch (err) {
    console.error('[trackops-sync]', err)
    json(res, 500, { error: err instanceof Error ? err.message : 'server error' }, origin)
  }
})

server.listen(PORT, () => {
  console.log(`[trackops-sync] listening on http://localhost:${PORT}`)
  console.log(`[trackops-sync] data dir: ${DATA_DIR}`)
  console.log(`[trackops-sync] legacy token: ${LEGACY_TOKEN ? 'required' : 'disabled (per-project passwords only)'}`)
})
