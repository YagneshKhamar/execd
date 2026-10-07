import { Notification } from 'electron'
import type Database from 'better-sqlite3'
import type { RealtimeChannel, RealtimeChannelSendResponse } from '@supabase/supabase-js'
import { onSyncContextChange, setRealtimeStatus, syncNow, type SyncContext } from './syncEngine'

interface EventRow {
  organization_id: string
  task_id: string
  actor_id: string
  event_type: string
  payload: { title?: string; status?: string } | null
}
interface TaskRow {
  id: string
  assigned_to: string
  assigned_by: string
  title: string
}

const DEBOUNCE_MS = 400
let channel: RealtimeChannel | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let getDbRef: (() => Database.Database) | null = null

function debouncedSync(): void {
  if (!getDbRef) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (getDbRef) syncNow(getDbRef()).catch(console.error)
  }, DEBOUNCE_MS)
}

function notify(title: string, body: string): void {
  try {
    new Notification({ title, body }).show()
  } catch {
    // Notifications are a courtesy; a platform without support should not break sync.
  }
}

function notifyTaskInsert(ctx: SyncContext, row: TaskRow): void {
  if (ctx.role === 'member' && row.assigned_to === ctx.userId && row.assigned_by !== ctx.userId) {
    notify('New task assigned', row.title)
  }
}

function notifyEvent(ctx: SyncContext, row: EventRow): void {
  if (row.actor_id === ctx.userId) return
  if (ctx.role === 'member') return // members only care about tasks assigned to them (handled above)

  if (row.event_type === 'completed') {
    notify('Task completed', row.payload?.title ?? 'A team task was marked done')
  } else if (row.event_type === 'status' && row.payload?.status === 'blocked') {
    notify('Task blocked', row.payload?.title ?? 'A team member reported a blocker')
  }
}

function teardown(): void {
  if (channel) {
    channel.unsubscribe().catch(() => undefined as unknown as RealtimeChannelSendResponse)
    channel = null
  }
  setRealtimeStatus('disabled')
}

function establish(ctx: SyncContext): void {
  teardown()
  setRealtimeStatus('connecting')

  const taskFilter =
    ctx.role === 'member'
      ? `assigned_to=eq.${ctx.userId}`
      : `organization_id=eq.${ctx.organizationId}`

  channel = ctx.supabase
    .channel(`team-sync:${ctx.organizationId}:${ctx.userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'team_tasks', filter: taskFilter },
      (payload) => {
        notifyTaskInsert(ctx, payload.new as TaskRow)
        debouncedSync()
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'team_tasks', filter: taskFilter },
      () => debouncedSync(),
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'team_task_events',
        filter: `organization_id=eq.${ctx.organizationId}`,
      },
      (payload) => notifyEvent(ctx, payload.new as EventRow),
    )
    .subscribe((next) => {
      if (next === 'SUBSCRIBED') setRealtimeStatus('connected')
      else if (next === 'CLOSED') setRealtimeStatus('disabled')
      else setRealtimeStatus('disconnected')
      // Realtime is an optimization (see SUPABASE_IMPLEMENTATION_PLAN.md Phase 8): a dropped
      // channel still gets caught up by the regular heartbeat sync, so no reconnect logic is
      // needed here beyond what supabase-js already retries internally.
    })
}

/**
 * Subscribes to live task/event changes so the UI updates without waiting for the polling
 * heartbeat. Must be called once, after startSyncWorker. A dropped or never-connected channel
 * degrades silently to the existing poll — this is never the only way changes arrive.
 */
export function startRealtime(getDb: () => Database.Database): void {
  getDbRef = getDb
  onSyncContextChange((ctx) => {
    if (ctx) establish(ctx)
    else teardown()
  })
}
