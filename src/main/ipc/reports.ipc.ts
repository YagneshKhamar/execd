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

  ipcMain.handle('reports:day-log', (_event, date: string) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM day_logs WHERE date = ?').get(date) || null
  })

  ipcMain.handle('reports:year', (_event, year: string) => {
    const db = getDatabase()

    const days = db
      .prepare(
        `
    SELECT date, execution_score, tasks_completed, tasks_missed, tasks_carried
    FROM day_logs
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `,
      )
      .all(`${year}-01-01`, `${year}-12-31`)

    const months = db
      .prepare(
        `
    SELECT
      strftime('%m', date) as month,
      AVG(execution_score) as avg_score,
      SUM(tasks_completed) as total_completed,
      SUM(tasks_missed) as total_missed,
      COUNT(*) as days_logged
    FROM day_logs
    WHERE date >= ? AND date <= ?
    GROUP BY strftime('%m', date)
    ORDER BY month ASC
  `,
      )
      .all(`${year}-01-01`, `${year}-12-31`)

    const topMissed = db
      .prepare(
        `
    SELECT t.title, COUNT(*) as miss_count
    FROM task_logs tl
    JOIN tasks t ON t.id = tl.task_id
    WHERE tl.action = 'missed'
      AND tl.date >= ? AND tl.date <= ?
    GROUP BY t.title
    HAVING COUNT(*) >= 3
    ORDER BY miss_count DESC
    LIMIT 5
  `,
      )
      .all(`${year}-01-01`, `${year}-12-31`)

    return { days, months, topMissed }
  })

  ipcMain.handle('reports:analytics', (_event, days: number) => {
    const db = getDatabase()
    const since = new Date()
    since.setDate(since.getDate() - (days - 1))
    const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(
      since.getDate(),
    ).padStart(2, '0')}`

    const trend = db
      .prepare(
        `
    SELECT date, execution_score, tasks_completed, tasks_missed
    FROM day_logs
    WHERE date >= ?
    ORDER BY date ASC
  `,
      )
      .all(sinceStr)

    const byEffort = db
      .prepare(
        `
    SELECT effort,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'missed' THEN 1 END) as missed
    FROM tasks
    WHERE scheduled_date >= ?
    AND status IN ('completed', 'missed')
    GROUP BY effort
  `,
      )
      .all(sinceStr)

    const bySlot = db
      .prepare(
        `
    SELECT scheduled_time_slot as slot,
      COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
      COUNT(CASE WHEN status = 'missed' THEN 1 END) as missed
    FROM tasks
    WHERE scheduled_date >= ?
    AND status IN ('completed', 'missed')
    GROUP BY scheduled_time_slot
  `,
      )
      .all(sinceStr)

    const carryTrend = db
      .prepare(
        `
    SELECT date, tasks_carried
    FROM day_logs
    WHERE date >= ?
    ORDER BY date ASC
  `,
      )
      .all(sinceStr)

    return { trend, byEffort, bySlot, carryTrend }
  })
}
