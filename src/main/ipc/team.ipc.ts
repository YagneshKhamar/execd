import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../db/database'
import {
  discardFailed,
  enqueueTaskChange,
  getMyTaskHistory,
  getTeamTaskHistory,
  enqueueTaskCreate,
  getMyTasks,
  getSyncErrors,
  getSyncInfo,
  getTaskSyncResult,
  isSyncDisabled,
  retryFailed,
  setSyncDisabled,
  settle,
  syncNow,
  updateMyTaskLocal,
} from '../supabase/syncEngine'

const TASK_STATUSES = ['pending', 'completed', 'blocked', 'awaiting_review', 'needs_changes']

export function registerTeamHandlers(): void {
  ipcMain.handle('team:get-members', () => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM team_members WHERE active = 1 ORDER BY name').all()
  })

  ipcMain.handle('team:add-member', (_e, data: { name: string; role: string; email: string }) => {
    const db = getDatabase()
    const id = uuidv4()
    db.prepare(`INSERT INTO team_members (id, name, role, email) VALUES (?, ?, ?, ?)`).run(
      id,
      data.name,
      data.role,
      data.email,
    )
    return { success: true, id }
  })

  ipcMain.handle('team:remove-member', (_e, id: string) => {
    const db = getDatabase()
    db.prepare('UPDATE team_members SET active = 0 WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('team:get-tasks', (_e, memberId: string, weekStart: string) => {
    const db = getDatabase()
    return db
      .prepare(
        `
      SELECT tt.*, tm.name as member_name 
      FROM team_tasks tt
      JOIN team_members tm ON tm.id = tt.member_id
      WHERE tt.member_id = ? AND tt.week_start = ?
      ORDER BY tt.due_date ASC
    `,
      )
      .all(memberId, weekStart)
  })

  ipcMain.handle('team:get-all-tasks', (_e, weekStart: string) => {
    const db = getDatabase()
    return db
      .prepare(
        `
      SELECT tt.*, tm.name as member_name
      FROM team_tasks tt
      JOIN team_members tm ON tm.id = tt.member_id
      WHERE tt.week_start = ?
      ORDER BY tm.name ASC, tt.due_date ASC
    `,
      )
      .all(weekStart)
  })

  ipcMain.handle(
    'team:add-task',
    async (
      _e,
      data: {
        member_id: string
        title: string
        description: string
        effort: string
        due_date: string
        week_start: string
      },
    ) => {
      const db = getDatabase()
      const id = uuidv4()
      db.transaction(() => {
        db.prepare(
          `
      INSERT INTO team_tasks (id, member_id, title, description, effort, due_date, week_start)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        ).run(
          id,
          data.member_id,
          data.title,
          data.description,
          data.effort,
          data.due_date,
          data.week_start,
        )
        enqueueTaskCreate(db, id)
      })()
      await settle(db)
      const sync = getTaskSyncResult(db, id)
      return { success: true, id, sync: sync.sync, syncError: sync.syncError }
    },
  )

  ipcMain.handle(
    'team:update-task-status',
    async (_e, taskId: string, status: string, proofValue?: string, reviewNote?: string) => {
      if (!TASK_STATUSES.includes(status)) return { success: false }
      const db = getDatabase()
      const logId = uuidv4()
      db.transaction(() => {
        const current = db.prepare('SELECT status FROM team_tasks WHERE id = ?').get(taskId) as
          | { status: string }
          | undefined
        const wasAwaitingReview = current?.status === 'awaiting_review'

        db.prepare(
          `
      UPDATE team_tasks SET status = ?, proof_value = ?,
      completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END
      WHERE id = ?
    `,
        ).run(status, proofValue || null, status, taskId)
        db.prepare(
          `
      INSERT INTO team_task_logs (id, team_task_id, action, note)
      VALUES (?, ?, ?, ?)
    `,
        ).run(logId, taskId, status, reviewNote?.trim() || '')

        // 'approved'/'rejected' are the manager's response to a review request. They're kept
        // distinct from a member's own 'completed'/'status' events so the Phase 9 notification
        // triggers can tell "you finished a task" from "your manager reviewed your task" apart.
        const eventType = wasAwaitingReview
          ? status === 'completed'
            ? 'approved'
            : status === 'needs_changes'
              ? 'rejected'
              : 'status'
          : status === 'completed'
            ? 'completed'
            : 'status'

        enqueueTaskChange(db, taskId, {
          type: eventType,
          clientEventId: logId,
          payload: {
            status,
            proof_value: proofValue || null,
            note: reviewNote?.trim() || undefined,
          },
        })
      })()
      await settle(db)
      const sync = getTaskSyncResult(db, taskId)
      return { success: true, sync: sync.sync, syncError: sync.syncError }
    },
  )

  ipcMain.handle('team:add-note', async (_e, taskId: string, note: string) => {
    const db = getDatabase()
    const logId = uuidv4()
    db.transaction(() => {
      db.prepare('UPDATE team_tasks SET notes = ? WHERE id = ?').run(note, taskId)
      db.prepare(
        `
      INSERT INTO team_task_logs (id, team_task_id, action, note)
      VALUES (?, ?, 'note', ?)
    `,
      ).run(logId, taskId, note)
      enqueueTaskChange(db, taskId, {
        type: 'note',
        clientEventId: logId,
        payload: { note },
      })
    })()
    await settle(db)
    const sync = getTaskSyncResult(db, taskId)
    return { success: true, sync: sync.sync, syncError: sync.syncError }
  })

  ipcMain.handle('team:get-followups', (_e, date: string) => {
    const db = getDatabase()
    return db
      .prepare(
        `
      SELECT tf.*, tm.name as member_name, tt.title as task_title
      FROM team_followups tf
      JOIN team_members tm ON tm.id = tf.member_id
      JOIN team_tasks tt ON tt.id = tf.team_task_id
      WHERE tf.scheduled_date = ? AND tf.done = 0
      ORDER BY tm.name ASC
    `,
      )
      .all(date)
  })

  ipcMain.handle(
    'team:add-followup',
    (
      _e,
      data: {
        member_id: string
        team_task_id: string
        note: string
        scheduled_date: string
      },
    ) => {
      const db = getDatabase()
      const id = uuidv4()
      db.prepare(
        `
      INSERT INTO team_followups (id, member_id, team_task_id, note, scheduled_date)
      VALUES (?, ?, ?, ?, ?)
    `,
      ).run(id, data.member_id, data.team_task_id, data.note, data.scheduled_date)
      return { success: true, id }
    },
  )

  ipcMain.handle('team:complete-followup', (_e, id: string) => {
    const db = getDatabase()
    db.prepare('UPDATE team_followups SET done = 1 WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('team:get-overdue', () => {
    const db = getDatabase()
    const today = new Date().toISOString().slice(0, 10)
    return db
      .prepare(
        `
      SELECT tt.*, tm.name as member_name,
        CAST(julianday(?) - julianday(tt.due_date) AS INTEGER) as days_overdue
      FROM team_tasks tt
      JOIN team_members tm ON tm.id = tt.member_id
      WHERE tt.status = 'pending' AND tt.due_date < ?
      ORDER BY days_overdue DESC
    `,
      )
      .all(today, today)
  })

  // Local-only backup export. This is not a substitute for Supabase's own project backups
  // (paid-plan point-in-time recovery) — it is a human-readable safety net a manager can take
  // themselves at any time, covering exactly what this device knows about.
  ipcMain.handle('team:export-data', () => {
    const db = getDatabase()
    const exportedAt = new Date().toISOString()
    const members = db.prepare('SELECT * FROM team_members WHERE active = 1').all()
    const tasks = db.prepare('SELECT * FROM team_tasks').all()
    const logs = db.prepare('SELECT * FROM team_task_logs').all()
    const followups = db.prepare('SELECT * FROM team_followups').all()

    const json = JSON.stringify({ exportedAt, members, tasks, logs, followups }, null, 2)
    return {
      success: true,
      json,
      filename: `execd-team-backup-${exportedAt.slice(0, 10)}.json`,
    }
  })

  ipcMain.handle('team:task-history', (_e, taskId: string) =>
    getTeamTaskHistory(getDatabase(), taskId),
  )

  ipcMain.handle('team:my-task-history', (_e, taskId: string) =>
    getMyTaskHistory(getDatabase(), taskId),
  )

  ipcMain.handle('team:sync-now', () => syncNow(getDatabase()))

  ipcMain.handle('team:sync-status', () => getSyncInfo(getDatabase()))

  ipcMain.handle('team:retry-sync', () => retryFailed(getDatabase()))

  ipcMain.handle('team:discard-failed-sync', () => discardFailed(getDatabase()))

  ipcMain.handle('team:sync-errors', () => getSyncErrors(getDatabase()))

  ipcMain.handle('team:get-sync-disabled', () => isSyncDisabled(getDatabase()))

  ipcMain.handle('team:set-sync-disabled', (_e, disabled: boolean) => {
    if (typeof disabled !== 'boolean') return { success: false }
    const db = getDatabase()
    setSyncDisabled(db, disabled)
    if (!disabled) syncNow(db).catch(console.error)
    return { success: true }
  })

  ipcMain.handle('team:my-tasks', async () => {
    const db = getDatabase()
    await settle(db)
    return getMyTasks(db)
  })

  ipcMain.handle(
    'team:my-task-update',
    async (_e, data: { taskId: string; status: string; proofValue?: string }) => {
      if (!TASK_STATUSES.includes(data?.status) || typeof data.taskId !== 'string') {
        return { success: false, error: 'Invalid update' }
      }
      const db = getDatabase()
      const result = updateMyTaskLocal(db, data.taskId, {
        status: data.status,
        proof_value: data.proofValue?.trim() || null,
      })
      if (result.success) await settle(db)
      return result
    },
  )
}
