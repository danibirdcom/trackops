#!/usr/bin/env node
/**
 * TrackOps sample sync server — REST + SSE with file-backed JSON storage.
 * Zero external dependencies. Run with Node >= 18.
 *
 *   PORT=8787 TRACKOPS_TOKEN=optional-secret node server/index.js
 */

import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(process.env.TRACKOPS_DATA_DIR ?? path.join(__dirname, 'data'))
const TOKEN = process.env.TRACKOPS_TOKEN ?? null
const PORT = Number(process.env.PORT ?? 8787)
const MAX_BODY = 8 * 1024 * 1024

await fs.mkdir(DATA_DIR, { recursive: true })

/** @type {Map<string, Set<import('node:http').ServerResponse>>} */
const subscribersByProject = new Map()
/** @type {Map<import('node:http').ServerResponse, { id: string, name: string, color: string, projectId: string }>} */
const subscriberMeta = new Map()

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
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

function authorise(req) {
  if (!TOKEN) return true
  const auth = req.headers.authorization ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/)
  if (m && m[1] === TOKEN) return true
  const url = new URL(req.url ?? '', 'http://localhost')
  if (url.searchParams.get('token') === TOKEN) return true
  return false
}

function projectPath(id) {
  if (!/^[\w.-]+$/.test(id)) throw new Error('invalid id')
  return path.join(DATA_DIR, `${id}.json`)
}

async function listProjects() {
  const entries = await fs.readdir(DATA_DIR)
  const out = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    const id = entry.replace(/\.json$/, '')
    try {
      const full = path.join(DATA_DIR, entry)
      const stat = await fs.stat(full)
      const data = JSON.parse(await fs.readFile(full, 'utf8'))
      out.push({
        id,
        name: data.name ?? id,
        updatedAt: data.updatedAt ?? stat.mtime.toISOString(),
        size: stat.size,
      })
    } catch {
      /* skip corrupt files */
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
  const users = [...subs].map((res) => {
    const meta = subscriberMeta.get(res)
    return meta ? { id: meta.id, name: meta.name, color: meta.color } : null
  }).filter(Boolean)
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

  if (!authorise(req)) {
    res.writeHead(401, corsHeaders(origin))
    res.end('unauthorised')
    return
  }

  try {
    if (url.pathname === '/api/projects' && req.method === 'GET') {
      const list = await listProjects()
      return json(res, 200, list, origin)
    }

    const match = url.pathname.match(/^\/api\/projects\/([\w.-]+)$/)
    if (match) {
      const id = match[1]
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
        await saveProjectFile(body)
        broadcast(id, 'project-updated', body)
        return json(res, 200, { ok: true }, origin)
      }
      if (req.method === 'DELETE') {
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
  console.log(`[trackops-sync] auth: ${TOKEN ? 'bearer token required' : 'open (no token)'}`)
})
