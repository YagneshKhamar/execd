import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db/database'
import { getSupabaseClient } from '../supabase/client'
import { enqueueTaskCreate, getStoredContext, settle, syncNow } from '../supabase/syncEngine'

interface MigrationPreview {
  eligible: boolean
  unlinkedMembersWithEmail: number
  unlinkedMembersWithoutEmail: number
  linkedMembers: number
  legacyTasks: number
}

interface MigrationResult {
  success: boolean
  error?: string
  invitationsSent: number
  invitationsSkippedNoEmail: number
  invitationsFailed: { name: string; error: string }[]
  tasksQueued: number
}

function getUnlinkedMembers(db: Database.Database): { id: string; name: string; email: string }[] {
  return db
    .prepare(`SELECT id, name, email FROM team_members WHERE active = 1 AND remote_user_id IS NULL`)
    .all() as { id: string; name: string; email: string }[]
}

function buildPreview(db: Database.Database): MigrationPreview {
  const stored = getStoredContext(db)
  if (!stored || stored.role === 'member') {
    return {
      eligible: false,
      unlinkedMembersWithEmail: 0,
      unlinkedMembersWithoutEmail: 0,
      linkedMembers: 0,
      legacyTasks: 0,
    }
  }

  const unlinked = getUnlinkedMembers(db)
  const linkedCount = db
    .prepare(
      `SELECT COUNT(*) AS n FROM team_members WHERE active = 1 AND remote_user_id IS NOT NULL`,
    )
    .get() as { n: number }
  const legacyTasks = db
    .prepare(`SELECT COUNT(*) AS n FROM team_tasks WHERE sync_status = 'local'`)
    .get() as { n: number }

  return {
    eligible: true,
    unlinkedMembersWithEmail: unlinked.filter((m) => m.email.trim()).length,
    unlinkedMembersWithoutEmail: unlinked.filter((m) => !m.email.trim()).length,
    linkedMembers: linkedCount.n,
    legacyTasks: legacyTasks.n,
  }
}

export function registerMigrationHandlers(): void {
  ipcMain.handle('migration:preview', () => buildPreview(getDatabase()))

  ipcMain.handle('migration:run', async () => {
    const db = getDatabase()
    const stored = getStoredContext(db)
    if (!stored) return { success: false, error: 'Not signed in to an organization' }
    if (stored.role === 'member') return { success: false, error: 'Only a manager can import data' }

    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }

    const result: MigrationResult = {
      success: true,
      invitationsSent: 0,
      invitationsSkippedNoEmail: 0,
      invitationsFailed: [],
      tasksQueued: 0,
    }

    // Invite every not-yet-linked member. create_invitation renews an existing invitation
    // instead of duplicating it, so running this twice for the same member is harmless.
    for (const member of getUnlinkedMembers(db)) {
      const email = member.email.trim()
      if (!email) {
        result.invitationsSkippedNoEmail++
        continue
      }
      const { error } = await supabase.rpc('create_invitation', {
        org_id: stored.organizationId,
        invite_email: email,
        invite_role: 'member',
      })
      if (error) result.invitationsFailed.push({ name: member.name, error: error.message })
      else result.invitationsSent++
    }

    // Queue every task the outbox has never seen. Re-running only picks up tasks still marked
    // 'local' — anything already queued/synced/failed from a prior run is skipped automatically,
    // so this is safe to retry. Tasks for a not-yet-linked member simply wait (Phase 7's
    // 'unlinked' state) until that member accepts their invitation.
    const legacyTasks = db
      .prepare(`SELECT id FROM team_tasks WHERE sync_status = 'local'`)
      .all() as { id: string }[]

    db.transaction(() => {
      for (const { id } of legacyTasks) {
        db.prepare(`UPDATE team_tasks SET migration_source = 'local_migration' WHERE id = ?`).run(
          id,
        )
        enqueueTaskCreate(db, id)
      }
    })()
    result.tasksQueued = legacyTasks.length

    await settle(db, 8000)
    syncNow(db).catch(console.error)

    return result
  })
}
