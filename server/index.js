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
const PORT = Number(process.env.PORT ?? 8787)
const MAX_BODY = 8 * 1024 * 1024
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const SCRYPT_KEY_LEN = 64

await fs.mkdir(DATA_DIR, { recursive: true })

/** @type {Map<string, Set<import('node:http').ServerResponse>>} */
const subscribersByProject = new Map()
/** @type {Map<import('node:http').ServerResponse, { id: string, name: string, color: string, projectId: string }>} */
const subscriberMeta = new Map()
/** @type {Map<string, { projectId: string, exp: number }>} */
const sessions = new Map()

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
