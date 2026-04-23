import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'
import { v4 as uuidv4 } from 'uuid'

function escapeCsvField(value: unknown): string {
  const text = String(value ?? '')
  if (text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  if (text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text}"`
  }
  return text
}

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
    const config = db.prepare('SELECT fiscal_year_start FROM config WHERE id = 1').get() as
      | { fiscal_year_start?: number }
      | undefined
    const fyStart = config?.fiscal_year_start ?? 4
    const paddedStartMonth = String(fyStart).padStart(2, '0')
    const startDate = fyStart === 1 ? `${year}-01-01` : `${year}-${paddedStartMonth}-01`
    const endYear = Number(year) + 1
    const endMonth = fyStart - 1
    const endDate =
      fyStart === 1
        ? `${year}-12-31`
        : new Date(endYear, endMonth, 0).toISOString().slice(0, 10)
    const fyLabel = fyStart === 1 ? year : `${year}-${String(Number(year) + 1).slice(2)}`

    const days = db
      .prepare(
        `
    SELECT date, execution_score, tasks_completed, tasks_missed, tasks_carried
    FROM day_logs
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC
  `,
      )
      .all(startDate, endDate)

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
      .all(startDate, endDate)

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
      .all(startDate, endDate)

    return { days, months, topMissed, fy_label: fyLabel }
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

  ipcMain.handle('reports:export-tasks-csv', (_event, filters: { month?: string }) => {
    const db = getDatabase()
    const rows = (
      filters.month
        ? db
            .prepare(
              `
          SELECT
            tasks.*,
            subgoals.title as subgoal_title,
            goals.title as goal_title,
            goals.type as goal_type
          FROM tasks
          LEFT JOIN subgoals ON tasks.subgoal_id = subgoals.id
          LEFT JOIN goals ON subgoals.goal_id = goals.id
          WHERE tasks.scheduled_date LIKE ?
          ORDER BY tasks.scheduled_date DESC
        `,
            )
            .all(`${filters.month}-%`)
        : db
            .prepare(
              `
          SELECT
            tasks.*,
            subgoals.title as subgoal_title,
            goals.title as goal_title,
            goals.type as goal_type
          FROM tasks
          LEFT JOIN subgoals ON tasks.subgoal_id = subgoals.id
          LEFT JOIN goals ON subgoals.goal_id = goals.id
          ORDER BY tasks.scheduled_date DESC
        `,
            )
            .all()
    ) as Record<string, unknown>[]

    const headers = [
      'Date',
      'Day',
      'Task',
      'Goal Type',
      'Goal',
      'Subgoal',
      'Effort',
      'Status',
      'Time Slot',
      'Note',
      'Completed At',
    ]

    const csvRows = rows.map((row) => {
      const date = String(row.scheduled_date ?? '')
      const day = date
        ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
        : ''
      const effortRaw = String(row.effort ?? '')
      const effortLabels: Record<string, string> = {
        light: '30 min',
        medium: '1 hour',
        heavy: '2 hours',
      }
      const effort = effortLabels[effortRaw] ?? effortRaw
      return [
        date,
        day,
        row.title ?? '',
        row.goal_type ?? '',
        row.goal_title ?? '',
        row.subgoal_title ?? '',
        effort,
        row.status ?? '',
        row.scheduled_time_slot ?? '',
        row.notes ?? '',
        row.completed_at ?? '',
      ]
        .map(escapeCsvField)
        .join(',')
    })

    const today = new Date().toISOString().slice(0, 10)
    return {
      success: true,
      csv: `\uFEFF${[headers.join(','), ...csvRows].join('\n')}`,
      filename: `execd-tasks-${today}.csv`,
    }
  })

  ipcMain.handle('reports:export-summary-csv', (_event, filters: { year?: string }) => {
    const db = getDatabase()
    const year = filters.year || String(new Date().getFullYear())
    const rows = db
      .prepare(
        `
      SELECT *
      FROM day_logs
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC
    `,
      )
      .all(`${year}-01-01`, `${year}-12-31`) as Record<string, unknown>[]

    const headers = ['Date', 'Day', 'Score %', 'Completed', 'Missed', 'Carried', 'AI Feedback']
    const csvRows = rows.map((row) => {
      const date = String(row.date ?? '')
      const day = date
        ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
        : ''
      const scorePercent = Math.round(Number(row.execution_score ?? 0) * 100)
      return [
        date,
        day,
        scorePercent,
        Number(row.tasks_completed ?? 0),
        Number(row.tasks_missed ?? 0),
        Number(row.tasks_carried ?? 0),
        row.ai_feedback ?? '',
      ]
        .map(escapeCsvField)
        .join(',')
    })

    const today = new Date().toISOString().slice(0, 10)
    return {
      success: true,
      csv: `\uFEFF${[headers.join(','), ...csvRows].join('\n')}`,
      filename: `execd-summary-${today}.csv`,
    }
  })
}
