import type { SupabaseClient } from '@supabase/supabase-js'
import type Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { getSupabaseClient } from './client'

export type OrgRole = 'owner' | 'manager' | 'member'
export type SyncStatus = 'local' | 'pending' | 'unlinked' | 'synced' | 'failed'

export interface StoredContext {
  userId: string
  organizationId: string
  role: OrgRole
}
export interface SyncContext extends StoredContext {
  supabase: SupabaseClient
}

export interface SyncInfo {
  enabled: boolean
  disabledByUser: boolean
  role: OrgRole | null
  online: boolean
  realtime: 'disabled' | 'connecting' | 'connected' | 'disconnected'
  syncing: boolean
  pending: number
  waiting: number
  failed: number
  lastSyncedAt: string | null
  lastError: string | null
}

type ContextResult =
  | { kind: 'disabled' }
  | { kind: 'offline'; message: string }
  | { kind: 'ok'; ctx: SyncContext }

interface Fields {
  status: string
  proof_value: string | null
  notes: string
  completed_at: string | null
}
interface EntryPayload {
  fields?: Fields
  event?: { type: string; payload: Record<string, unknown> }
  mainDone?: boolean
}
interface OutboxRow {
  id: string
  client_event_id: string
  user_id: string
  entity_type: 'team_task' | 'my_task'
  entity_id: string
  event_type: 'create' | 'update'
  payload: string
  retry_count: number
}
interface LocalTask {
  id: string
  member_id: string
  title: string
  description: string
  effort: string
  status: string
  due_date: string
  week_start: string
  proof_value: string | null
  notes: string
  completed_at: string | null
  created_at: string
  sync_status: SyncStatus
  remote_version: number | null
  migration_source: string | null
}
interface RemoteTask {
  id: string
  assigned_to: string
  title: string
  description: string
  effort: string
  status: string
  due_date: string
  week_start: string
  proof_value: string | null
  notes: string
  completed_at: string | null
  version: number
  created_at: string
  updated_at: string
}
interface RemoteError {
  code?: string
  message: string
}

const TASK_COLUMNS =
  'id, assigned_to, title, description, effort, status, due_date, week_start, proof_value, notes, completed_at, version, created_at, updated_at'
const CONTEXT_TTL_MS = 5 * 60 * 1000
const BACKOFF_MS = [5_000, 30_000, 300_000]
const MAX_ATTEMPTS = BACKOFF_MS.length + 1
const HEARTBEAT_MS = 60_000
const PAGE_SIZE = 500
const MAX_PAGES = 20
const CONFLICT_MESSAGE =
  'This task was changed by someone else. The latest version has been loaded; retry to overwrite it, or discard your change.'

const runtime = {
  online: true,
  syncing: false,
  lastError: null as string | null,
  realtime: 'disabled' as 'disabled' | 'connecting' | 'connected' | 'disconnected',
}
let activeContextKey: string | null = null
let contextListener: ((ctx: SyncContext | null) => void) | null = null

// realtime.ts registers here instead of syncEngine importing it, to avoid a circular import
// (realtime.ts already imports syncNow/getSyncContext-shaped helpers from this module).
export function onSyncContextChange(fn: (ctx: SyncContext | null) => void): void {
  contextListener = fn
}

export function setRealtimeStatus(next: typeof runtime.realtime): void {
  runtime.realtime = next
}

let cachedContext: { ctx: SyncContext; expires: number } | null = null
let running: Promise<SyncInfo> | null = null
let nextTimer: ReturnType<typeof setTimeout> | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null

// ── stored context (works offline) ────────────────────────────────────────────────────────

export function getStoredContext(db: Database.Database): StoredContext | null {
  const row = db
    .prepare(`SELECT last_server_cursor FROM sync_state WHERE scope = 'context'`)
    .get() as { last_server_cursor: string | null } | undefined
  if (!row?.last_server_cursor) return null
  try {
    return JSON.parse(row.last_server_cursor) as StoredContext
  } catch {
    return null
  }
}

function storeContext(db: Database.Database, ctx: StoredContext | null): void {
  if (!ctx) {
    db.prepare(`DELETE FROM sync_state WHERE scope = 'context'`).run()
    return
  }
  const value: StoredContext = {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    role: ctx.role,
  }
  db.prepare(
    `INSERT INTO sync_state (scope, last_server_cursor, updated_at) VALUES ('context', ?, datetime('now'))
     ON CONFLICT(scope) DO UPDATE SET last_server_cursor = excluded.last_server_cursor, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(value))
}

export function clearSyncContextCache(): void {
  cachedContext = null
}

export function clearStoredContext(db: Database.Database): void {
  cachedContext = null
  storeContext(db, null)
  if (activeContextKey !== null) {
    activeContextKey = null
    contextListener?.(null)
  }
}

// Local-only kill-switch: lets a previously-configured install fall back to local-only SQLite
// without a new build, e.g. if Supabase is unreachable for an extended period or a sync-related
// release ships broken. Distinct from "not configured" (no MAIN_VITE_SUPABASE_* set), which the
// user cannot toggle at runtime; this one is a deliberate opt-out on an otherwise-working setup.
export function isSyncDisabled(db: Database.Database): boolean {
  const row = db
    .prepare(`SELECT last_server_cursor FROM sync_state WHERE scope = 'disabled'`)
    .get() as { last_server_cursor: string | null } | undefined
  return row?.last_server_cursor === '1'
}

export function setSyncDisabled(db: Database.Database, disabled: boolean): void {
  if (disabled) {
    db.prepare(
      `INSERT INTO sync_state (scope, last_server_cursor, updated_at) VALUES ('disabled', '1', datetime('now'))
       ON CONFLICT(scope) DO UPDATE SET last_server_cursor = '1', updated_at = datetime('now')`,
    ).run()
  } else {
    db.prepare(`DELETE FROM sync_state WHERE scope = 'disabled'`).run()
  }
  clearSyncContextCache()
  if (disabled && activeContextKey !== null) {
    activeContextKey = null
    contextListener?.(null)
  }
}

async function getSyncContext(db: Database.Database): Promise<ContextResult> {
  if (isSyncDisabled(db)) return { kind: 'disabled' }

  const supabase = getSupabaseClient()
  if (!supabase) return { kind: 'disabled' }

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) return { kind: 'offline', message: error.message }
    const session = data.session
    if (!session) {
      storeContext(db, null)
      return { kind: 'disabled' }
    }

    const userId = session.user.id
    if (
      cachedContext &&
      cachedContext.ctx.userId === userId &&
      cachedContext.expires > Date.now()
    ) {
      return { kind: 'ok', ctx: cachedContext.ctx }
    }

    const { data: rows, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
    if (memberError) return { kind: 'offline', message: memberError.message }
    if (!rows?.length) {
      storeContext(db, null)
      return { kind: 'disabled' }
    }

    const ctx: SyncContext = {
      supabase,
      userId,
      organizationId: rows[0].organization_id as string,
      role: rows[0].role as OrgRole,
    }
    cachedContext = { ctx, expires: Date.now() + CONTEXT_TTL_MS }
    storeContext(db, ctx)
    return { kind: 'ok', ctx }
  } catch (err) {
    return { kind: 'offline', message: err instanceof Error ? err.message : 'Sync unavailable' }
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────────────

function toRemoteTimestamp(local: string | null, table: 'team_tasks' | 'my_tasks'): string | null {
  if (!local) return null
  return table === 'team_tasks' ? `${local.replace(' ', 'T')}Z` : local
}

function toLocalTimestamp(remote: string | null): string | null {
  return remote ? remote.replace('T', ' ').slice(0, 19) : null
}

// A response with a Postgres/PostgREST code means the server looked at the request and said no,
// so repeating it will not help. No code means the request never got a real answer (network).
function isTransient(err: RemoteError): boolean {
  if (!err.code) return true
  return (
    err.code === 'PGRST301' ||
    err.code === '40001' ||
    err.code === '40P01' ||
    err.code === '57014' ||
    err.code.startsWith('08') ||
    err.code.startsWith('53')
  )
}

function tableFor(entityType: OutboxRow['entity_type']): 'team_tasks' | 'my_tasks' {
  return entityType === 'team_task' ? 'team_tasks' : 'my_tasks'
}

function getTask(db: Database.Database, id: string): LocalTask | undefined {
  return db.prepare('SELECT * FROM team_tasks WHERE id = ?').get(id) as LocalTask | undefined
}

function insertEntry(
  db: Database.Database,
  userId: string,
  entityType: OutboxRow['entity_type'],
  entityId: string,
  eventType: OutboxRow['event_type'],
  clientEventId: string,
  payload: EntryPayload,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO sync_outbox
       (id, client_event_id, user_id, entity_type, entity_id, event_type, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(uuidv4(), clientEventId, userId, entityType, entityId, eventType, JSON.stringify(payload))
}

// Recomputes a task row's sync_status / sync_error from its outbox entries.
function refreshState(
  db: Database.Database,
  table: 'team_tasks' | 'my_tasks',
  id: string,
): SyncStatus {
  const entries = db
    .prepare(
      `SELECT status, last_error FROM sync_outbox WHERE entity_id = ? AND status != 'synced'`,
    )
    .all(id) as { status: string; last_error: string | null }[]

  const failed = entries.find((e) => e.status === 'failed')
  let status: SyncStatus
  let error: string | null = null
  if (failed) {
    status = 'failed'
    error = failed.last_error
  } else if (entries.some((e) => e.status === 'pending')) {
    status = 'pending'
  } else if (entries.some((e) => e.status === 'waiting')) {
    status = 'unlinked'
  } else {
    const row = db.prepare(`SELECT remote_version FROM ${table} WHERE id = ?`).get(id) as
      | { remote_version: number | null }
      | undefined
    status = row && row.remote_version !== null ? 'synced' : 'local'
  }

  db.prepare(`UPDATE ${table} SET sync_status = ?, sync_error = ? WHERE id = ?`).run(
    status,
    error,
    id,
  )
  return status
}

function hasOpenEntries(db: Database.Database, id: string): boolean {
  return Boolean(
    db
      .prepare(
        `SELECT 1 FROM sync_outbox WHERE entity_id = ? AND status IN ('pending', 'waiting') LIMIT 1`,
      )
      .get(id),
  )
}

// ── enqueue (local, synchronous, offline-safe) ────────────────────────────────────────────

export function enqueueTaskCreate(db: Database.Database, taskId: string): SyncStatus {
  const stored = getStoredContext(db)
  if (!stored || isSyncDisabled(db) || stored.role === 'member' || !getTask(db, taskId)) return 'local'
  insertEntry(db, stored.userId, 'team_task', taskId, 'create', `created:${taskId}`, {})
  return refreshState(db, 'team_tasks', taskId)
}

export function enqueueTaskChange(
  db: Database.Database,
  taskId: string,
  event: { type: string; clientEventId: string; payload: Record<string, unknown> },
): SyncStatus {
  const stored = getStoredContext(db)
  const task = getTask(db, taskId)
  if (
    !stored ||
    isSyncDisabled(db) ||
    stored.role === 'member' ||
    !task ||
    task.sync_status === 'local'
  )
    return 'local'

  insertEntry(db, stored.userId, 'team_task', taskId, 'update', event.clientEventId, {
    fields: {
      status: task.status,
      proof_value: task.proof_value,
      notes: task.notes,
      completed_at: task.completed_at,
    },
    event: { type: event.type, payload: event.payload },
  })
  return refreshState(db, 'team_tasks', taskId)
}

export function updateMyTaskLocal(
  db: Database.Database,
  taskId: string,
  changes: { status: string; proof_value: string | null },
): { success: boolean; error?: string } {
  const stored = getStoredContext(db)
  if (!stored) return { success: false, error: 'Not signed in to an organization' }
  if (isSyncDisabled(db)) {
    return { success: false, error: 'Cloud sync is currently disabled on this device' }
  }

  const row = db
    .prepare('SELECT notes FROM my_tasks WHERE id = ? AND user_id = ?')
    .get(taskId, stored.userId) as { notes: string } | undefined
  if (!row) return { success: false, error: 'Task not found' }

  const completedAt = changes.status === 'completed' ? new Date().toISOString() : null
  db.transaction(() => {
    db.prepare(
      'UPDATE my_tasks SET status = ?, proof_value = ?, completed_at = ? WHERE id = ? AND user_id = ?',
    ).run(changes.status, changes.proof_value, completedAt, taskId, stored.userId)
    insertEntry(db, stored.userId, 'my_task', taskId, 'update', uuidv4(), {
      fields: {
        status: changes.status,
        proof_value: changes.proof_value,
        notes: row.notes,
        completed_at: completedAt,
      },
      event: {
        type: changes.status === 'completed' ? 'completed' : 'status',
        payload: { status: changes.status, proof_value: changes.proof_value },
      },
    })
    refreshState(db, 'my_tasks', taskId)
  })()
  return { success: true }
}

// ── upload ────────────────────────────────────────────────────────────────────────────────

async function insertEvent(
  ctx: SyncContext,
  taskId: string,
  eventType: string,
  clientEventId: string,
  payload: Record<string, unknown>,
): Promise<RemoteError | null> {
  const { error } = await ctx.supabase.from('team_task_events').upsert(
    {
      organization_id: ctx.organizationId,
      task_id: taskId,
      actor_id: ctx.userId,
      event_type: eventType,
      payload,
      client_event_id: clientEventId,
    },
    { onConflict: 'client_event_id', ignoreDuplicates: true },
  )
  return error
}

async function resolveRemoteUser(
  db: Database.Database,
  ctx: SyncContext,
  memberId: string,
  links: Map<string, string | null>,
): Promise<string | null> {
  if (links.has(memberId)) return links.get(memberId) ?? null

  const member = db
    .prepare('SELECT email, remote_user_id FROM team_members WHERE id = ?')
    .get(memberId) as { email: string; remote_user_id: string | null } | undefined
  let resolved: string | null = member?.remote_user_id ?? null

  const email = member?.email.trim().toLowerCase()
  if (!resolved && email) {
    const { data: profiles, error } = await ctx.supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .limit(1)
    if (error) throw error
    const userId = profiles?.[0]?.id as string | undefined
    if (userId) {
      const { data: membership, error: memberError } = await ctx.supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', ctx.organizationId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
      if (memberError) throw memberError
      if (membership?.length) {
        resolved = userId
        db.prepare('UPDATE team_members SET remote_user_id = ? WHERE id = ?').run(userId, memberId)
      }
    }
  }

  links.set(memberId, resolved)
  return resolved
}

type MainResult =
  | { kind: 'ok' }
  | { kind: 'waiting' }
  | { kind: 'error'; message: string; transient: boolean }

function fail(err: RemoteError): MainResult {
  return { kind: 'error', message: err.message, transient: isTransient(err) }
}

async function pushCreate(
  db: Database.Database,
  ctx: SyncContext,
  entry: OutboxRow,
  links: Map<string, string | null>,
): Promise<MainResult> {
  const task = getTask(db, entry.entity_id)
  if (!task) return { kind: 'error', message: 'Task no longer exists', transient: false }

  const assignee = await resolveRemoteUser(db, ctx, task.member_id, links)
  if (!assignee) return { kind: 'waiting' }

  const { data, error } = await ctx.supabase
    .from('team_tasks')
    .insert({
      id: task.id,
      organization_id: ctx.organizationId,
      assigned_to: assignee,
      assigned_by: ctx.userId,
      title: task.title,
      description: task.description,
      effort: task.effort,
      status: task.status,
      due_date: task.due_date,
      week_start: task.week_start,
      proof_value: task.proof_value,
      notes: task.notes,
      completed_at: toRemoteTimestamp(task.completed_at, 'team_tasks'),
      created_at: toRemoteTimestamp(task.created_at, 'team_tasks'),
      import_source: task.migration_source,
    })
    .select('version')
    .single()

  let version: number | null = data ? (data.version as number) : null
  if (error) {
    // 23505: an earlier attempt succeeded but its response was lost. Adopt the remote row.
    if (error.code !== '23505') return fail(error)
    const existing = await ctx.supabase
      .from('team_tasks')
      .select('version')
      .eq('id', task.id)
      .single()
    if (!existing.data) return fail(error)
    version = existing.data.version as number
  }

  db.prepare('UPDATE team_tasks SET remote_version = ? WHERE id = ?').run(version, task.id)
  return { kind: 'ok' }
}

async function pushUpdate(
  db: Database.Database,
  ctx: SyncContext,
  entry: OutboxRow,
  fields: Fields,
): Promise<MainResult> {
  const table = tableFor(entry.entity_type)
  const row = db
    .prepare(`SELECT remote_version FROM ${table} WHERE id = ?`)
    .get(entry.entity_id) as { remote_version: number | null } | undefined
  if (!row || row.remote_version === null) {
    return { kind: 'error', message: 'Task was never created remotely', transient: false }
  }

  const { data, error } = await ctx.supabase
    .from('team_tasks')
    .update({
      status: fields.status,
      proof_value: fields.proof_value,
      notes: fields.notes,
      completed_at: toRemoteTimestamp(fields.completed_at, table),
    })
    .eq('id', entry.entity_id)
    .eq('version', row.remote_version)
    .select('version')
  if (error) return fail(error)

  if (!data?.length) {
    // Someone else changed it first: server wins locally, but the user's change stays visible
    // as a failed entry so it is not silently lost.
    const latest = await ctx.supabase
      .from('team_tasks')
      .select(TASK_COLUMNS)
      .eq('id', entry.entity_id)
      .single()
    if (latest.data) applyRemote(db, ctx, latest.data as RemoteTask, true)
    return { kind: 'error', message: CONFLICT_MESSAGE, transient: false }
  }

  db.prepare(`UPDATE ${table} SET remote_version = ? WHERE id = ?`).run(
    data[0].version as number,
    entry.entity_id,
  )
  return { kind: 'ok' }
}

function saveProgress(db: Database.Database, id: string, payload: EntryPayload): void {
  db.prepare('UPDATE sync_outbox SET payload = ? WHERE id = ?').run(JSON.stringify(payload), id)
}

function recordFailure(
  db: Database.Database,
  entry: OutboxRow,
  message: string,
  transient: boolean,
): 'retry' | 'failed' {
  const attempts = entry.retry_count + 1
  if (!transient || attempts >= MAX_ATTEMPTS) {
    db.prepare(
      `UPDATE sync_outbox SET status = 'failed', retry_count = ?, last_error = ? WHERE id = ?`,
    ).run(attempts, message, entry.id)
    return 'failed'
  }
  db.prepare(
    `UPDATE sync_outbox SET retry_count = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`,
  ).run(attempts, message, Date.now() + BACKOFF_MS[attempts - 1], entry.id)
  return 'retry'
}

type Outcome = 'done' | 'retry' | 'failed' | 'waiting'

async function processEntry(
  db: Database.Database,
  ctx: SyncContext,
  entry: OutboxRow,
  links: Map<string, string | null>,
): Promise<Outcome> {
  const payload = JSON.parse(entry.payload) as EntryPayload
  try {
    if (!payload.mainDone) {
      const main =
        entry.event_type === 'create'
          ? await pushCreate(db, ctx, entry, links)
          : await pushUpdate(db, ctx, entry, payload.fields as Fields)

      if (main.kind === 'waiting') {
        db.prepare(`UPDATE sync_outbox SET status = 'waiting', last_error = ? WHERE id = ?`).run(
          'Assignee has not joined the organization yet',
          entry.id,
        )
        return 'waiting'
      }
      if (main.kind === 'error') return recordFailure(db, entry, main.message, main.transient)

      payload.mainDone = true
      saveProgress(db, entry.id, payload)
    }

    // The task write already succeeded; a failure from here on retries only the event, so the
    // (now version-bumped) task update is never repeated.
    const event =
      payload.event ??
      (entry.event_type === 'create'
        ? { type: 'created', payload: { title: getTask(db, entry.entity_id)?.title ?? '' } }
        : undefined)
    if (event) {
      const err = await insertEvent(
        ctx,
        entry.entity_id,
        event.type,
        entry.client_event_id,
        event.payload,
      )
      if (err) return recordFailure(db, entry, err.message, isTransient(err))
    }

    db.prepare(
      `UPDATE sync_outbox SET status = 'synced', synced_at = datetime('now'), last_error = NULL WHERE id = ?`,
    ).run(entry.id)
    return 'done'
  } catch (err) {
    const remote = err as RemoteError
    return recordFailure(db, entry, remote.message ?? String(err), isTransient(remote))
  }
}

async function uploadPending(db: Database.Database, ctx: SyncContext): Promise<void> {
  const blocked = new Set<string>(
    (
      db
        .prepare(
          `SELECT DISTINCT entity_id FROM sync_outbox WHERE user_id = ? AND status = 'failed'`,
        )
        .all(ctx.userId) as { entity_id: string }[]
    ).map((r) => r.entity_id),
  )

  const due = db
    .prepare(
      `SELECT * FROM sync_outbox
       WHERE user_id = ? AND status IN ('pending', 'waiting') AND next_attempt_at <= ?
       ORDER BY created_at, rowid LIMIT 200`,
    )
    .all(ctx.userId, Date.now()) as OutboxRow[]

  const links = new Map<string, string | null>()
  for (const entry of due) {
    if (blocked.has(entry.entity_id)) continue
    const outcome = await processEntry(db, ctx, entry, links)
    refreshState(db, tableFor(entry.entity_type), entry.entity_id)
    // Later changes to the same entity must wait for this one to keep them in order.
    if (outcome !== 'done') blocked.add(entry.entity_id)
  }
}

// ── download ──────────────────────────────────────────────────────────────────────────────

function applyRemote(
  db: Database.Database,
  ctx: SyncContext,
  r: RemoteTask,
  force = false,
): boolean {
  return ctx.role === 'member'
    ? applyRemoteMyTask(db, ctx, r, force)
    : applyRemoteTeamTask(db, r, force)
}

function applyRemoteTeamTask(db: Database.Database, r: RemoteTask, force: boolean): boolean {
  const local = getTask(db, r.id)

  if (!local) {
    const member = db
      .prepare('SELECT id FROM team_members WHERE remote_user_id = ? AND active = 1')
      .get(r.assigned_to) as { id: string } | undefined
    if (!member) return false
    db.prepare(
      `INSERT INTO team_tasks
         (id, member_id, title, description, effort, status, due_date, week_start, proof_value,
          notes, created_at, completed_at, sync_status, remote_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)`,
    ).run(
      r.id,
      member.id,
      r.title,
      r.description,
      r.effort,
      r.status,
      r.due_date,
      r.week_start,
      r.proof_value,
      r.notes,
      toLocalTimestamp(r.created_at),
      toLocalTimestamp(r.completed_at),
      r.version,
    )
    return true
  }

  if (local.remote_version !== null && r.version <= local.remote_version) return false
  if (!force && hasOpenEntries(db, r.id)) return false

  db.prepare(
    `UPDATE team_tasks SET status = ?, proof_value = ?, notes = ?, completed_at = ?, remote_version = ?
     WHERE id = ?`,
  ).run(r.status, r.proof_value, r.notes, toLocalTimestamp(r.completed_at), r.version, r.id)
  refreshState(db, 'team_tasks', r.id)
  return true
}

function applyRemoteMyTask(
  db: Database.Database,
  ctx: SyncContext,
  r: RemoteTask,
  force: boolean,
): boolean {
  const local = db
    .prepare('SELECT remote_version FROM my_tasks WHERE id = ? AND user_id = ?')
    .get(r.id, ctx.userId) as { remote_version: number | null } | undefined

  if (local) {
    if (local.remote_version !== null && r.version <= local.remote_version) return false
    if (!force && hasOpenEntries(db, r.id)) return false
  }

  db.prepare(
    `INSERT INTO my_tasks
       (id, user_id, organization_id, title, description, effort, status, due_date, week_start,
        proof_value, notes, completed_at, remote_version)
     VALUES (@id, @user_id, @organization_id, @title, @description, @effort, @status, @due_date,
        @week_start, @proof_value, @notes, @completed_at, @version)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, description = excluded.description, effort = excluded.effort,
       status = excluded.status, due_date = excluded.due_date, week_start = excluded.week_start,
       proof_value = excluded.proof_value, notes = excluded.notes,
       completed_at = excluded.completed_at, remote_version = excluded.remote_version`,
  ).run({
    id: r.id,
    user_id: ctx.userId,
    organization_id: ctx.organizationId,
    title: r.title,
    description: r.description,
    effort: r.effort,
    status: r.status,
    due_date: r.due_date,
    week_start: r.week_start,
    proof_value: r.proof_value,
    notes: r.notes,
    completed_at: r.completed_at,
    version: r.version,
  })
  refreshState(db, 'my_tasks', r.id)
  return true
}

function getCursor(db: Database.Database, scope: string): string | null {
  const row = db.prepare('SELECT last_server_cursor FROM sync_state WHERE scope = ?').get(scope) as
    | { last_server_cursor: string | null }
    | undefined
  return row?.last_server_cursor ?? null
}

function setCursor(db: Database.Database, scope: string, value: string): void {
  db.prepare(
    `INSERT INTO sync_state (scope, last_server_cursor, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(scope) DO UPDATE SET last_server_cursor = excluded.last_server_cursor, updated_at = excluded.updated_at`,
  ).run(scope, value)
}

// Incremental: only rows updated at/after the saved cursor are fetched. `>=` (not `>`) plus the
// version check in applyRemote makes the boundary row harmless to re-read, and protects against
// a transaction that committed with a slightly earlier updated_at than the cursor.
async function downloadChanges(db: Database.Database, ctx: SyncContext): Promise<void> {
  const isMember = ctx.role === 'member'
  const scope = isMember ? `my_tasks:${ctx.userId}` : `team_tasks:${ctx.organizationId}`
  let cursor = getCursor(db, scope)

  for (let page = 0; page < MAX_PAGES; page++) {
    let query = ctx.supabase
      .from('team_tasks')
      .select(TASK_COLUMNS)
      .eq(isMember ? 'assigned_to' : 'organization_id', isMember ? ctx.userId : ctx.organizationId)
    if (cursor) query = query.gte('updated_at', cursor)

    const { data, error } = await query.order('updated_at', { ascending: true }).limit(PAGE_SIZE)
    if (error) throw error

    const rows = (data ?? []) as RemoteTask[]
    db.transaction(() => {
      for (const r of rows) applyRemote(db, ctx, r)
    })()

    if (rows.length) {
      cursor = rows[rows.length - 1].updated_at
      setCursor(db, scope, cursor)
    }
    if (rows.length < PAGE_SIZE) break
  }
}

// ── cycle, status, worker ─────────────────────────────────────────────────────────────────

// Tasks left 'failed'/'unlinked' by the pre-outbox sync get an outbox entry so they are not
// stranded.
function migrateLegacyState(db: Database.Database, userId: string): void {
  const rows = db
    .prepare(
      `SELECT id, remote_version FROM team_tasks
       WHERE sync_status IN ('failed', 'unlinked')
         AND id NOT IN (SELECT entity_id FROM sync_outbox)`,
    )
    .all() as { id: string; remote_version: number | null }[]

  for (const row of rows) {
    if (row.remote_version === null) {
      insertEntry(db, userId, 'team_task', row.id, 'create', `created:${row.id}`, {})
    } else {
      const task = getTask(db, row.id)
      if (!task) continue
      insertEntry(db, userId, 'team_task', row.id, 'update', uuidv4(), {
        fields: {
          status: task.status,
          proof_value: task.proof_value,
          notes: task.notes,
          completed_at: task.completed_at,
        },
      })
    }
    refreshState(db, 'team_tasks', row.id)
  }
}

function scheduleNext(db: Database.Database): void {
  if (nextTimer) clearTimeout(nextTimer)
  nextTimer = null
  const stored = getStoredContext(db)
  if (!stored) return
  const row = db
    .prepare(
      `SELECT MIN(next_attempt_at) AS next FROM sync_outbox
       WHERE user_id = ? AND status = 'pending' AND next_attempt_at > ?`,
    )
    .get(stored.userId, Date.now()) as { next: number | null }
  if (!row.next) return
  nextTimer = setTimeout(
    () => {
      syncNow(db).catch(console.error)
    },
    Math.max(1000, row.next - Date.now()),
  )
}

async function runCycle(db: Database.Database): Promise<void> {
  runtime.syncing = true
  try {
    const result = await getSyncContext(db)
    if (result.kind === 'disabled') {
      runtime.online = true
      runtime.lastError = null
      if (activeContextKey !== null) {
        activeContextKey = null
        contextListener?.(null)
      }
      return
    }
    if (result.kind === 'offline') {
      runtime.online = false
      runtime.lastError = result.message
      return
    }

    const key = `${result.ctx.userId}:${result.ctx.organizationId}:${result.ctx.role}`
    if (key !== activeContextKey) {
      activeContextKey = key
      contextListener?.(result.ctx)
    }

    migrateLegacyState(db, result.ctx.userId)
    await uploadPending(db, result.ctx)
    await downloadChanges(db, result.ctx)

    db.prepare(
      `DELETE FROM sync_outbox WHERE status = 'synced' AND synced_at < datetime('now', '-7 days')`,
    ).run()
    runtime.online = true
    runtime.lastError = null
    db.prepare(
      `INSERT INTO sync_state (scope, last_server_cursor, updated_at) VALUES ('last_sync', ?, ?)
       ON CONFLICT(scope) DO UPDATE SET last_server_cursor = excluded.last_server_cursor, updated_at = excluded.updated_at`,
    ).run(new Date().toISOString(), new Date().toISOString())
  } catch (err) {
    runtime.online = isTransient(err as RemoteError) ? false : runtime.online
    runtime.lastError = err instanceof Error ? err.message : (err as RemoteError).message
  } finally {
    runtime.syncing = false
    scheduleNext(db)
  }
}

export interface HistoryEntry {
  action: string
  note: string
  actor: string
  at: string
}

const HISTORY_LABELS: Record<string, string> = {
  created: 'Task created',
  completed: 'Marked done',
  approved: 'Approved',
  rejected: 'Changes requested',
  status: 'Status changed',
  note: 'Note added',
  pending: 'Reopened',
  blocked: 'Marked blocked',
  awaiting_review: 'Submitted for review',
  needs_changes: 'Changes requested',
}

function labelFor(eventType: string): string {
  return HISTORY_LABELS[eventType] ?? eventType
}

async function fetchRemoteHistory(ctx: SyncContext, taskId: string): Promise<HistoryEntry[]> {
  const { data, error } = await ctx.supabase
    .from('team_task_events')
    .select('event_type, payload, actor_id, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error || !data?.length) return []

  const actorIds = [...new Set(data.map((r) => r.actor_id as string))]
  const { data: profiles } = await ctx.supabase
    .from('profiles')
    .select('id, display_name, email')
    .in('id', actorIds)
  const nameById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      (p.display_name as string) || (p.email as string),
    ]),
  )

  return data.map((row) => {
    const payload = row.payload as { note?: string } | null
    return {
      action: labelFor(row.event_type as string),
      note: payload?.note ?? '',
      actor: nameById.get(row.actor_id as string) ?? 'Someone',
      at: row.created_at as string,
    }
  })
}

// Local team_task_logs has no actor column (single-operator app), so anything logged there was
// done by whoever is using this device.
function fetchLocalHistory(db: Database.Database, taskId: string): HistoryEntry[] {
  const rows = db
    .prepare(
      `SELECT action, note, logged_at FROM team_task_logs WHERE team_task_id = ? ORDER BY logged_at ASC`,
    )
    .all(taskId) as { action: string; note: string; logged_at: string }[]
  return rows.map((r) => ({
    action: labelFor(r.action),
    note: r.action === 'note' ? '' : r.note,
    actor: 'You',
    at: r.logged_at,
  }))
}

export async function getTeamTaskHistory(
  db: Database.Database,
  taskId: string,
): Promise<{ success: boolean; history?: HistoryEntry[]; error?: string }> {
  const local = fetchLocalHistory(db, taskId)
  const task = getTask(db, taskId)

  if (!task || task.remote_version === null) return { success: true, history: local }

  const result = await getSyncContext(db)
  if (result.kind !== 'ok') return { success: true, history: local }

  const remote = await fetchRemoteHistory(result.ctx, taskId)
  return { success: true, history: [...local, ...remote].sort((a, b) => a.at.localeCompare(b.at)) }
}

export async function getMyTaskHistory(
  db: Database.Database,
  taskId: string,
): Promise<{ success: boolean; history?: HistoryEntry[]; error?: string }> {
  const result = await getSyncContext(db)
  if (result.kind === 'disabled')
    return { success: false, error: 'Not signed in to an organization' }
  if (result.kind === 'offline') return { success: false, error: result.message }

  const remote = await fetchRemoteHistory(result.ctx, taskId)
  return { success: true, history: remote }
}

export function getSyncInfo(db: Database.Database): SyncInfo {
  const stored = getStoredContext(db)
  const counts = { pending: 0, waiting: 0, failed: 0 }
  if (stored) {
    const rows = db
      .prepare(
        `SELECT status, COUNT(*) AS n FROM sync_outbox
         WHERE user_id = ? AND status IN ('pending', 'waiting', 'failed') GROUP BY status`,
      )
      .all(stored.userId) as { status: 'pending' | 'waiting' | 'failed'; n: number }[]
    for (const r of rows) counts[r.status] = r.n
  }
  const last = db
    .prepare(`SELECT last_server_cursor FROM sync_state WHERE scope = 'last_sync'`)
    .get() as { last_server_cursor: string | null } | undefined

  return {
    enabled: stored !== null,
    disabledByUser: isSyncDisabled(db),
    role: stored?.role ?? null,
    online: runtime.online,
    realtime: runtime.realtime,
    syncing: runtime.syncing,
    ...counts,
    lastSyncedAt: last?.last_server_cursor ?? null,
    lastError: runtime.lastError,
  }
}

// Single-flight: callers during a running cycle share its result.
export function syncNow(db: Database.Database): Promise<SyncInfo> {
  if (!running) {
    running = runCycle(db)
      .then(() => getSyncInfo(db))
      .finally(() => {
        running = null
      })
  }
  return running
}

export async function settle(db: Database.Database, timeoutMs = 3000): Promise<void> {
  await Promise.race([
    syncNow(db).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

export function getTaskSyncResult(
  db: Database.Database,
  id: string,
): { sync: SyncStatus; syncError?: string } {
  const row = db.prepare('SELECT sync_status, sync_error FROM team_tasks WHERE id = ?').get(id) as
    | { sync_status: SyncStatus; sync_error: string | null }
    | undefined
  return { sync: row?.sync_status ?? 'local', syncError: row?.sync_error ?? undefined }
}

export function retryFailed(db: Database.Database): Promise<SyncInfo> {
  const stored = getStoredContext(db)
  if (stored) {
    const ids = db
      .prepare(
        `SELECT entity_id, entity_type FROM sync_outbox WHERE user_id = ? AND status = 'failed'`,
      )
      .all(stored.userId) as { entity_id: string; entity_type: OutboxRow['entity_type'] }[]
    db.prepare(
      `UPDATE sync_outbox SET status = 'pending', retry_count = 0, next_attempt_at = 0, last_error = NULL
       WHERE user_id = ? AND status = 'failed'`,
    ).run(stored.userId)
    for (const r of ids) refreshState(db, tableFor(r.entity_type), r.entity_id)
  }
  return syncNow(db)
}

// Drops failed changes the user does not want to retry, then re-reads the affected tasks from
// the server so the local copy matches it again.
export function discardFailed(db: Database.Database): Promise<SyncInfo> {
  const stored = getStoredContext(db)
  if (stored) {
    const rows = db
      .prepare(
        `SELECT entity_id, entity_type FROM sync_outbox WHERE user_id = ? AND status = 'failed'`,
      )
      .all(stored.userId) as { entity_id: string; entity_type: OutboxRow['entity_type'] }[]
    db.prepare(`DELETE FROM sync_outbox WHERE user_id = ? AND status = 'failed'`).run(stored.userId)
    for (const r of rows) refreshState(db, tableFor(r.entity_type), r.entity_id)
    if (rows.length) {
      db.prepare(`DELETE FROM sync_state WHERE scope IN (?, ?)`).run(
        `team_tasks:${stored.organizationId}`,
        `my_tasks:${stored.userId}`,
      )
    }
  }
  return syncNow(db)
}

export interface SyncErrorEntry {
  entityType: 'team_task' | 'my_task'
  entityId: string
  title: string
  status: 'failed' | 'waiting'
  error: string
  retryCount: number
  updatedAt: string
}

// Surfaces recent problems for a manager to diagnose without reading raw DB tables — the
// per-task badges already show this, but there is no single "what's currently wrong" view.
export function getSyncErrors(db: Database.Database): SyncErrorEntry[] {
  const stored = getStoredContext(db)
  if (!stored) return []

  const rows = db
    .prepare(
      `SELECT entity_type, entity_id, status, last_error, retry_count, created_at
       FROM sync_outbox
       WHERE user_id = ? AND status IN ('failed', 'waiting')
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(stored.userId) as {
    entity_type: OutboxRow['entity_type']
    entity_id: string
    status: 'failed' | 'waiting'
    last_error: string | null
    retry_count: number
    created_at: string
  }[]

  return rows.map((row) => {
    const table = tableFor(row.entity_type)
    const task = db.prepare(`SELECT title FROM ${table} WHERE id = ?`).get(row.entity_id) as
      | { title: string }
      | undefined
    return {
      entityType: row.entity_type,
      entityId: row.entity_id,
      title: task?.title ?? '(deleted task)',
      status: row.status,
      error: row.last_error ?? '',
      retryCount: row.retry_count,
      updatedAt: row.created_at,
    }
  })
}

export function getMyTasks(db: Database.Database): {
  success: boolean
  tasks?: unknown[]
  error?: string
} {
  const stored = getStoredContext(db)
  if (!stored) return { success: false, error: 'Not signed in to an organization' }
  const tasks = db
    .prepare(
      `SELECT id, title, description, effort, status, due_date, week_start, proof_value, notes,
              completed_at, remote_version AS version, sync_status, sync_error
       FROM my_tasks WHERE user_id = ?
       ORDER BY due_date DESC LIMIT 200`,
    )
    .all(stored.userId)
  return { success: true, tasks }
}

export function startSyncWorker(getDb: () => Database.Database): void {
  if (heartbeat) return
  setTimeout(() => {
    syncNow(getDb()).catch(console.error)
  }, 3000)
  heartbeat = setInterval(() => {
    syncNow(getDb()).catch(console.error)
  }, HEARTBEAT_MS)
}
