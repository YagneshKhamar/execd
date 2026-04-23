import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'
import { generateEndOfDayFeedback } from './ai.ipc'
import { detectBehaviorPatterns } from './reports.ipc'
import { v4 as uuidv4 } from 'uuid'

const EFFORT_WEIGHT: Record<string, number> = { light: 1, medium: 2, heavy: 3 }

export function registerTasksHandlers(): void {
  ipcMain.handle('tasks:get-by-date', (_event, date: string) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM tasks WHERE scheduled_date = ? ORDER BY rowid').all(date)
  })

  ipcMain.handle('tasks:get-day-plan', (_event, date: string) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM day_plans WHERE date = ?').get(date) || null
  })

  ipcMain.handle(
    'tasks:save-day-plan',
    (
      _event,
      data: {
        date: string
        available_minutes: number
      },
    ) => {
      const db = getDatabase()
      const existing = db.prepare('SELECT id FROM day_plans WHERE date = ?').get(data.date)
      if (existing) {
        db.prepare('UPDATE day_plans SET available_minutes = ? WHERE date = ?').run(
          data.available_minutes,
          data.date,
        )
      } else {
        db.prepare(
          `
        INSERT INTO day_plans (id, date, available_minutes, locked, replan_used)
        VALUES (?, ?, ?, 0, 0)
      `,
        ).run(uuidv4(), data.date, data.available_minutes)
      }
      return { success: true }
    },
  )

  ipcMain.handle(
    'tasks:save-tasks',
    (
      _event,
      tasks: {
        title: string
        effort: string
        proof_type: string
        subgoal_id: string
        scheduled_date: string
        scheduled_time_slot: string
        status: string
      }[],
    ) => {
      const db = getDatabase()

      const insert = db.prepare(`
      INSERT INTO tasks (
        id, subgoal_id, title, effort, proof_type,
        scheduled_date, scheduled_time_slot, status,
        proof_value, carried_over_from, carry_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, null, null, 0)
    `)

      const insertMany = db.transaction((items: typeof tasks) => {
        for (const t of items) {
          insert.run(
            uuidv4(),
            t.subgoal_id,
            t.title,
            t.effort,
            t.proof_type,
            t.scheduled_date,
            t.scheduled_time_slot,
            t.status,
          )
        }
      })

      insertMany(tasks)
      return { success: true }
    },
  )

  ipcMain.handle('tasks:lock-day-plan', (_event, date: string) => {
    const db = getDatabase()
    db.prepare(
      `
      UPDATE day_plans SET locked = 1, locked_at = datetime('now') WHERE date = ?
    `,
    ).run(date)
    return { success: true }
  })

  ipcMain.handle('tasks:complete', (_event, taskId: string, proofValue: string | null) => {
    const db = getDatabase()
    db.prepare(
      `
      UPDATE tasks SET
        status = 'completed',
        proof_value = ?,
        completed_at = datetime('now')
      WHERE id = ?
    `,
    ).run(proofValue, taskId)

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<
      string,
      unknown
    >

    db.prepare(
      `
      INSERT INTO task_logs (id, task_id, date, action, proof_type, proof_value, carry_count_at_time)
      VALUES (?, ?, date('now'), 'completed', ?, ?, ?)
    `,
    ).run(uuidv4(), taskId, task.proof_type, proofValue, task.carry_count)

    return { success: true }
  })

  ipcMain.handle('tasks:uncomplete', (_event, taskId: string) => {
    const db = getDatabase()
    db.prepare(
      `
    UPDATE tasks SET status = 'pending', proof_value = null, completed_at = null
    WHERE id = ?
  `,
    ).run(taskId)
    return { success: true }
  })

  ipcMain.handle('tasks:update-notes', (_event, taskId: string, notes: string) => {
    const db = getDatabase()
    db.prepare('UPDATE tasks SET notes = ? WHERE id = ?').run(notes, taskId)
    return { success: true }
  })

  ipcMain.handle('tasks:get-missed', (_event, date: string) => {
    const db = getDatabase()
    return db
      .prepare(
        `
    SELECT * FROM tasks 
    WHERE scheduled_date = ? AND status = 'pending'
    ORDER BY rowid
  `,
      )
      .all(date)
  })

  ipcMain.handle('tasks:mark-missed', (_event, date: string) => {
    const db = getDatabase()
    const tasks = db
      .prepare(
        `
    SELECT * FROM tasks WHERE scheduled_date = ? AND status = 'pending'
  `,
      )
      .all(date) as Record<string, unknown>[]

    const updateTask = db.prepare(`
    UPDATE tasks SET status = 'missed' WHERE id = ?
  `)

    const insertLog = db.prepare(`
    INSERT INTO task_logs (id, task_id, date, action, proof_type, proof_value, carry_count_at_time)
    VALUES (?, ?, ?, 'missed', null, null, ?)
  `)

    const markAll = db.transaction(() => {
      for (const task of tasks) {
        updateTask.run(task.id)
        insertLog.run(uuidv4(), task.id, date, task.carry_count)
      }
    })

    markAll()
    return { success: true }
  })

  ipcMain.handle('tasks:carry-over', (_event, taskId: string, toDate: string) => {
    const db = getDatabase()
    const original = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<
      string,
      unknown
    >
    if (!original) return { success: false }

    const newCarryCount = (original.carry_count as number) + 1
    const newId = uuidv4()

    db.prepare(
      `
    INSERT INTO tasks (
      id, subgoal_id, title, effort, proof_type,
      scheduled_date, scheduled_time_slot, status,
      proof_value, carried_over_from, carry_count, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', null, ?, ?, ?)
  `,
    ).run(
      newId,
      original.subgoal_id,
      original.title,
      original.effort,
      original.proof_type,
      toDate,
      original.scheduled_time_slot,
      taskId,
      newCarryCount,
      original.notes,
    )

    db.prepare(
      `
    INSERT INTO task_logs (id, task_id, date, action, proof_type, proof_value, carry_count_at_time)
    VALUES (?, ?, ?, 'carried', null, null, ?)
  `,
    ).run(uuidv4(), taskId, toDate, newCarryCount)

    db.prepare(`UPDATE tasks SET status = 'carried' WHERE id = ?`).run(taskId)

    return { success: true, newTaskId: newId }
  })

  ipcMain.handle('tasks:drop', (_event, taskId: string, date: string) => {
    const db = getDatabase()
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<
      string,
      unknown
    >

    db.prepare(`UPDATE tasks SET status = 'dropped' WHERE id = ?`).run(taskId)

    db.prepare(
      `
    INSERT INTO task_logs (id, task_id, date, action, proof_type, proof_value, carry_count_at_time)
    VALUES (?, ?, ?, 'dropped', null, null, ?)
  `,
    ).run(uuidv4(), taskId, date, task.carry_count)

    return { success: true }
  })

  ipcMain.handle('tasks:get-carryover-count', (_event, date: string) => {
    const db = getDatabase()
    const result = db
      .prepare(
        `
    SELECT COUNT(*) as count FROM tasks
    WHERE scheduled_date = ? AND carried_over_from IS NOT NULL AND status = 'pending'
  `,
      )
      .get(date) as { count: number }
    return result.count
  })

  ipcMain.handle('tasks:end-of-day', async (_event, date: string) => {
    const db = getDatabase()

    type TaskRow = {
      id: string
      title: string
      effort: string
      proof_type: string
      proof_value: string | null
      status: string
      carry_count: number
    }

    const allTasks = db
      .prepare(
        `SELECT * FROM tasks WHERE scheduled_date = ? AND status NOT IN ('dropped', 'carried')`,
      )
      .all(date) as TaskRow[]

    const pendingTasks = allTasks.filter((t) => t.status === 'pending')
    const completedTasks = allTasks.filter((t) => t.status === 'completed')

    // Mark pending tasks as missed
    const updateMissed = db.prepare(`UPDATE tasks SET status = 'missed' WHERE id = ?`)
    const insertLog = db.prepare(`
      INSERT INTO task_logs (id, task_id, date, action, proof_type, proof_value, carry_count_at_time)
      VALUES (?, ?, ?, 'missed', null, null, ?)
    `)
    db.transaction(() => {
      for (const task of pendingTasks) {
        updateMissed.run(task.id)
        insertLog.run(uuidv4(), task.id, date, task.carry_count)
      }
    })()

    // Compute score
    const scorable = [...completedTasks, ...pendingTasks]
    const totalWeight = scorable.reduce((s, t) => s + (EFFORT_WEIGHT[t.effort] ?? 1), 0)
    const completedWeight = completedTasks.reduce((s, t) => s + (EFFORT_WEIGHT[t.effort] ?? 1), 0)
    const score = totalWeight > 0 ? completedWeight / totalWeight : 0

    // Get AI feedback
    let feedback = ''
    try {
      feedback = await generateEndOfDayFeedback({
        score,
        completed: completedTasks.map((t) => ({ title: t.title, proof_type: t.proof_type })),
        missed: pendingTasks.map((t) => ({ title: t.title })),
        flags: [],
        history: [],
      })
    } catch {
      feedback = 'Feedback unavailable.'
    }

    // Upsert day_logs
    const existing = db.prepare(`SELECT id FROM day_logs WHERE date = ?`).get(date)
    if (existing) {
      db.prepare(
        `
        UPDATE day_logs SET
          total_weight = ?, completed_weight = ?, execution_score = ?,
          ai_feedback = ?, tasks_completed = ?, tasks_missed = ?
        WHERE date = ?
      `,
      ).run(
        totalWeight,
        completedWeight,
        score,
        feedback,
        completedTasks.length,
        pendingTasks.length,
        date,
      )
    } else {
      db.prepare(
        `INSERT INTO day_logs
          (id, date, total_weight, completed_weight, execution_score, ai_feedback, tasks_completed, tasks_missed, tasks_carried, tasks_dropped)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      ).run(
        uuidv4(),
        date,
        totalWeight,
        completedWeight,
        score,
        feedback,
        completedTasks.length,
        pendingTasks.length,
      )
    }

    detectBehaviorPatterns(date)

    return { score, feedback, completed: completedTasks, missed: pendingTasks }
  })

  ipcMain.handle(
    'tasks:get-history',
    (
      _event,
      filters: {
        month?: string
        date?: string
        status?: 'completed' | 'missed' | 'pending' | 'dropped' | 'carried' | 'all'
      },
    ) => {
      const db = getDatabase()
      const where: string[] = []
      const params: unknown[] = []

      if (filters.date) {
        where.push('tasks.scheduled_date = ?')
        params.push(filters.date)
      } else if (filters.month) {
        where.push('tasks.scheduled_date LIKE ?')
        params.push(`${filters.month}-%`)
      }

      if (filters.status && filters.status !== 'all') {
        where.push('tasks.status = ?')
        params.push(filters.status)
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

      return db
        .prepare(
          `
          SELECT
            tasks.id,
            tasks.title,
            tasks.effort,
            tasks.proof_type,
            tasks.proof_value,
            tasks.status,
            tasks.scheduled_date,
            tasks.scheduled_time_slot,
            tasks.carry_count,
            subgoals.title AS subgoal_title,
            goals.title AS goal_title,
            tasks.completed_at
          FROM tasks
          LEFT JOIN subgoals ON tasks.subgoal_id = subgoals.id
          LEFT JOIN goals ON subgoals.goal_id = goals.id
          ${whereClause}
          ORDER BY tasks.scheduled_date DESC, tasks.created_at DESC
        `,
        )
        .all(...params)
    },
  )

  ipcMain.handle('tasks:update-proof', (_event, taskId: string, proof: string) => {
    const db = getDatabase()
    const today = new Date().toISOString().slice(0, 10)

    db.prepare('UPDATE tasks SET proof_value = ? WHERE id = ?').run(proof, taskId)

    db.prepare(
      `
      INSERT INTO task_logs (id, task_id, date, action, proof_type, proof_value, carry_count_at_time)
      VALUES (?, ?, ?, 'proof_updated', (SELECT proof_type FROM tasks WHERE id = ?), ?, 0)
    `,
    ).run(uuidv4(), taskId, today, taskId, proof)

    return { success: true }
  })
}
