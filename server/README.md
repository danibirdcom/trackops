# TrackOps sync server (sample)

Minimal REST + SSE backend for the optional sync feature (Phase 5 of the product spec).

- **Zero dependencies** — pure Node `http` + `fs`. Node ≥ 18 required.
- **File-backed** — each project is stored as `data/<id>.json`.
- **Auth** — optional bearer token via `TRACKOPS_TOKEN` env var. If unset, the server accepts all requests (suitable only for LAN / dev).
- **Realtime** — Server-Sent Events at `GET /api/events?projectId=...&userName=...`. Clients get `project-updated`, `project-deleted` and `presence` events.

This is **reference infrastructure** for Phase 5. For production you will want TLS, proper auth, and a real database.

## Run

```bash
cd server
node index.js
# or
PORT=8787 TRACKOPS_TOKEN=supersecret node index.js
```

Point the TrackOps client at `http://localhost:8787` from **Ajustes → Sincronización**.

## HTTP API

| Method | Path                          | Description                             |
|--------|-------------------------------|-----------------------------------------|
| GET    | `/api/projects`               | List project summaries                  |
| GET    | `/api/projects/:id`           | Fetch full project                      |
| PUT    | `/api/projects/:id`           | Upsert full project JSON (body)         |
| DELETE | `/api/projects/:id`           | Delete project                          |
| GET    | `/api/events?projectId=…`     | SSE stream (updates + presence)         |

## Environment

| Variable              | Default            | Purpose                         |
|-----------------------|--------------------|---------------------------------|
| `PORT`                | `8787`             | HTTP port                       |
| `TRACKOPS_TOKEN`      | *(unset)*          | Bearer token required if set    |
| `TRACKOPS_DATA_DIR`   | `./data`           | Where project files live        |

## Conflict resolution

Last write wins at the document level. The client pushes the full project whenever its `updatedAt` changes. When the server broadcasts a `project-updated`, the client only applies it if `remote.updatedAt > local.updatedAt`.

For simultaneous edits on different fields by different people, this is a simple (and lossy) strategy. If you need finer-grained merges, swap `project-updated` for a CRDT-backed adapter.
