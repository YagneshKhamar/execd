import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'
import { v4 as uuidv4 } from 'uuid'

export function detectBehaviorPatterns(date: string): void {
  const db = getDatabase()

  const insertFlag = db.prepare(`
    INSERT INTO behavior_flags (id, flag_type, description, task_id, detected_on)
    VALUES (?, ?, ?, ?, ?)
  `)

  const hasFlag = (flagType: string, taskId: string | null): boolean => {
    if (taskId) {
      return !!db
        .prepare(
          `SELECT id FROM behavior_flags WHERE flag_type = ? AND task_id = ? AND resolved = 0`,
        )
        .get(flagType, taskId)
    }
    return !!db
      .prepare(
        `SELECT id FROM behavior_flags WHERE flag_type = ? AND detected_on = ? AND resolved = 0`,
      )
      .get(flagType, date)
  }

  // Pattern 1: Avoidance — same task carried 3+ times
  const carriedTasks = db
    .prepare(
      `SELECT id, title, carry_count FROM tasks
       WHERE carry_count >= 3
         AND scheduled_date <= ?
         AND scheduled_date >= date(?, '-6 days')`,
    )
    .all(date, date) as { id: string; title: string; carry_count: number }[]

  for (const task of carriedTasks) {
    if (!hasFlag('avoidance', task.id)) {
      insertFlag.run(
        uuidv4(),
        'avoidance',
        `"${task.title}" has been carried ${task.carry_count} times without completion`,
        task.id,
        date,
      )
    }
  }

  // Pattern 2: Overload — execution_score < 0.4 for 3+ consecutive days
  const recentLogs = db
    .prepare(
      `SELECT date, execution_score FROM day_logs
       WHERE date <= ? AND date >= date(?, '-6 days')
       ORDER BY date ASC`,
    )
    .all(date, date) as { date: string; execution_score: number }[]

  let streak = 0
  for (const log of recentLogs) {
    if (log.execution_score < 0.4) {
      streak++
      if (streak >= 3 && !hasFlag('overload', null)) {
        insertFlag.run(
          uuidv4(),
          'overload',
          `Execution score below 40% for ${streak} consecutive days`,
          null,
          date,
        )
        break
      }
    } else {
      streak = 0
    }
  }

  // Pattern 3: Category skip — link-proof tasks never completed across the whole week
  const skippedLinkTasks = db
    .prepare(
      `SELECT title, MIN(id) as id FROM tasks
       WHERE proof_type = 'link'
         AND scheduled_date <= ?
         AND scheduled_date >= date(?, '-6 days')
       GROUP BY title
       HAVING MAX(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) = 0`,
    )
    .all(date, date) as { title: string; id: string }[]

  for (const task of skippedLinkTasks) {
    if (!hasFlag('category_skip', task.id)) {
      insertFlag.run(
        uuidv4(),
        'category_skip',
        `"${task.title}" requires a link proof but was never completed this week`,
        task.id,
        date,
      )
    }
  }
}

export function registerReportsHandlers(): void {
  ipcMain.handle('reports:week', (_event, endDate: string) => {
    const db = getDatabase()

    const days = db
      .prepare(
        `SELECT date, execution_score, tasks_completed, tasks_missed
         FROM day_logs
         WHERE date <= ? AND date >= date(?, '-6 days')
         ORDER BY date ASC`,
      )
      .all(endDate, endDate)

    const patterns = db
      .prepare(
        `SELECT t.title, COUNT(*) as miss_count
         FROM task_logs tl
         JOIN tasks t ON t.id = tl.task_id
         WHERE tl.action = 'missed'
           AND tl.date <= ?
           AND tl.date >= date(?, '-6 days')
         GROUP BY t.title
         HAVING COUNT(*) >= 2
         ORDER BY miss_count DESC`,
      )
      .all(endDate, endDate)

    return { days, patterns }
  })
}
