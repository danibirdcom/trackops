import { create } from 'zustand'
import type { Project } from '@/lib/types'
import { saveProject } from '@/lib/storage/dexie'
import { useProjectStore } from './projectStore'
import { useUiStore } from './uiStore'
import { RestSyncAdapter } from '@/lib/sync/restAdapter'
import {
  clearSyncConfig,
  defaultSyncConfig,
  loadSyncConfig,
  saveSyncConfig,
} from '@/lib/sync/config'
import { SessionStore } from '@/lib/sync/sessions'
import type {
  PresenceUser,
  RemoteProjectSummary,
  SessionToken,
  SyncAdapter,
  SyncConfig,
  SyncStatus,
} from '@/lib/sync/types'

type SyncStore = {
  enabled: boolean
  config: SyncConfig
  adapter: SyncAdapter | null
  status: SyncStatus
  statusError: string | null
  presence: PresenceUser[]
  lastPushAt: number | null
  lastPullAt: number | null
  pending: boolean
  remoteList: RemoteProjectSummary[]
  subscribedProjectId: string | null
  unsubscribe: (() => void) | null
  pushTimer: ReturnType<typeof setTimeout> | null
  suppressPushKey: string | null
  enable: (config: SyncConfig) => void
  disable: () => void
  disconnect: () => void
  updateConfig: (patch: Partial<SyncConfig>) => void
  pushNow: (project: Project) => Promise<void>
  pullNow: (id: string) => Promise<Project | null>
  listRemote: () => Promise<RemoteProjectSummary[]>
  removeRemote: (id: string) => Promise<void>
  subscribeProject: (id: string) => void
  unsubscribeProject: () => void
  schedulePush: (project: Project) => void
  getSessionToken: (projectId: string) => string | null
  login: (projectId: string, password: string) => Promise<SessionToken>
  logout: (projectId: string) => void
  setProjectPassword: (
    projectId: string,
    newPassword: string,
    currentPassword?: string,
  ) => Promise<SessionToken>
}

function buildAdapter(config: SyncConfig): SyncAdapter | null {
  if (!config.endpoint) return null
  return new RestSyncAdapter(config)
}

export const useSyncStore = create<SyncStore>((set, get) => {
  const initial = loadSyncConfig() ?? defaultSyncConfig()
  return {
    enabled: Boolean(initial.endpoint),
    config: initial,
    adapter: buildAdapter(initial),
    status: 'disconnected',
    statusError: null,
    presence: [],
    lastPushAt: null,
    lastPullAt: null,
    pending: false,
    remoteList: [],
    subscribedProjectId: null,
    unsubscribe: null,
    pushTimer: null,
    suppressPushKey: null,

    disconnect: () => {
      const { unsubscribe, pushTimer } = get()
      if (unsubscribe) unsubscribe()
      if (pushTimer) clearTimeout(pushTimer)
      set({
        status: 'disconnected',
        presence: [],
        subscribedProjectId: null,
        unsubscribe: null,
        pushTimer: null,
      })
    },

    enable: (config) => {
      get().disconnect()
      saveSyncConfig(config)
      set({
        enabled: true,
        config,
        adapter: buildAdapter(config),
        statusError: null,
      })
    },

    disable: () => {
      get().disconnect()
      clearSyncConfig()
      set({
        enabled: false,
        adapter: null,
        statusError: null,
      })
    },

    updateConfig: (patch) => {
      const config = { ...get().config, ...patch }
      get().disconnect()
      saveSyncConfig(config)
      set({
        enabled: Boolean(config.endpoint),
        config,
        adapter: buildAdapter(config),
      })
    },

    pushNow: async (project) => {
      const adapter = get().adapter
      if (!adapter) return
      const token = SessionStore.getValid(project.id)
      set({ pending: true, statusError: null, suppressPushKey: project.updatedAt })
      try {
        await adapter.push(project, token)
        set({ lastPushAt: Date.now(), pending: false })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error subiendo al servidor'
        if (/auth required|401/i.test(msg)) {
          SessionStore.drop(project.id)
        }
        set({ pending: false, statusError: msg })
      }
    },

    pullNow: async (id) => {
      const adapter = get().adapter
      if (!adapter) return null
      set({ pending: true, statusError: null })
      try {
        const project = await adapter.pull(id)
        if (project) set({ suppressPushKey: project.updatedAt })
        set({ lastPullAt: Date.now(), pending: false })
        return project
      } catch (e) {
        set({
          pending: false,
          statusError: e instanceof Error ? e.message : 'Error descargando del servidor',
        })
        return null
      }
    },

    listRemote: async () => {
      const adapter = get().adapter
      if (!adapter) return []
      try {
        const list = await adapter.list()
        set({ remoteList: list, statusError: null })
        return list
      } catch (e) {
        set({ statusError: e instanceof Error ? e.message : 'Error listando' })
        return []
      }
    },

    removeRemote: async (id) => {
      const adapter = get().adapter
      if (!adapter) return
      const token = SessionStore.getValid(id)
      await adapter.remove(id, token)
      SessionStore.drop(id)
      set({ remoteList: get().remoteList.filter((p) => p.id !== id) })
    },

    subscribeProject: (id) => {
      const state = get()
      if (state.subscribedProjectId === id && state.unsubscribe) return
      state.unsubscribe?.()
      if (!state.adapter) return

      const unsub = state.adapter.subscribe(
        id,
        (event) => {
          if (event.type === 'project-updated') {
            const local = useProjectStore.getState().current
            if (!local || local.id !== event.project.id) return
            if (event.project.updatedAt <= local.updatedAt) return
            set({ suppressPushKey: event.project.updatedAt })
            useProjectStore.getState().setProject(event.project)
            void saveProject(event.project)
          } else if (event.type === 'presence') {
            set({ presence: event.users })
          } else if (event.type === 'project-deleted') {
            const local = useProjectStore.getState().current
            if (local?.id === event.id) {
              set({ statusError: 'El proyecto ha sido eliminado remotamente.' })
            }
          }
        },
        (status, error) => {
          set({ status, statusError: error ?? null })
        },
      )

      set({ subscribedProjectId: id, unsubscribe: unsub })
    },

    unsubscribeProject: () => {
      const { unsubscribe } = get()
      if (!unsubscribe) return
      unsubscribe()
      set({
        status: 'disconnected',
        presence: [],
        subscribedProjectId: null,
        unsubscribe: null,
      })
    },

    schedulePush: (project) => {
      const { adapter, pushTimer } = get()
      if (!adapter) return
      if (pushTimer) clearTimeout(pushTimer)
      const expectedId = project.id
      const timer = setTimeout(() => {
        const latest = useProjectStore.getState().current
        if (!latest || latest.id !== expectedId) return
        void get().pushNow(latest)
      }, 1500)
      set({ pushTimer: timer })
    },

    getSessionToken: (projectId) => SessionStore.getValid(projectId),

    login: async (projectId, password) => {
      const adapter = get().adapter
      if (!adapter) throw new Error('Sincronización no disponible')
      const session = await adapter.login(projectId, password)
      SessionStore.save(projectId, session)
      return session
    },

    logout: (projectId) => {
      SessionStore.drop(projectId)
    },

    setProjectPassword: async (projectId, newPassword, currentPassword) => {
      const adapter = get().adapter
      if (!adapter) throw new Error('Sincronización no disponible')
      const existing = SessionStore.getValid(projectId)
      const session = await adapter.setPassword(projectId, newPassword, {
        currentPassword,
        sessionToken: existing,
      })
      SessionStore.save(projectId, session)
      return session
    },
  }
})

useProjectStore.subscribe((state, prev) => {
  const cur = state.current
  if (!cur) return

  const prevUpdated = prev.current?.updatedAt
  if (cur.updatedAt === prevUpdated) return

  if (useUiStore.getState().readOnly) return

  const sync = useSyncStore.getState()
  if (!sync.enabled || !sync.adapter) return

  if (sync.suppressPushKey === cur.updatedAt) {
    useSyncStore.setState({ suppressPushKey: null })
    return
  }

  sync.schedulePush(cur)
})
