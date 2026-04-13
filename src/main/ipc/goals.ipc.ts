import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'
import { v4 as uuidv4 } from 'uuid'

export function registerGoalsHandlers(): void {
  ipcMain.handle(
    'goals:save',
    (
      _event,
      goals: {
        title: string
        type: string
        month: string
      }[],
    ) => {
      const db = getDatabase()

      const insertGoal = db.prepare(`
      INSERT INTO goals (id, month, title, type, ai_validated, ai_validation_note)
      VALUES (?, ?, ?, ?, 0, '')
    `)

      const insertMany = db.transaction((items: typeof goals) => {
        const existingGoals = db
          .prepare('SELECT id FROM goals WHERE month = ?')
          .all(items[0].month) as { id: string }[]
        for (const g of existingGoals) {
          db.prepare('DELETE FROM subgoals WHERE goal_id = ?').run(g.id)
        }
        db.prepare('DELETE FROM goals WHERE month = ?').run(items[0].month)

        const ids: string[] = []
        for (const goal of items) {
          const id = uuidv4()
          insertGoal.run(id, goal.month, goal.title, goal.type)
          ids.push(id)
        }
        return ids
      })

      const ids = insertMany(goals)
      return { success: true, ids }
    },
  )

  ipcMain.handle('goals:get', (_event, month: string) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM goals WHERE month = ? ORDER BY rowid').all(month)
  })

  ipcMain.handle('goals:update-validation', (_event, id: string, note: string, valid: boolean) => {
    const db = getDatabase()
    db.prepare(
      `
      UPDATE goals SET ai_validated = ?, ai_validation_note = ? WHERE id = ?
    `,
    ).run(valid ? 1 : 0, note, id)
    return { success: true }
  })

  ipcMain.handle(
    'subgoals:save',
    (
      _event,
      subgoals: {
        goal_id: string
        title: string
        priority: string
      }[],
    ) => {
      const db = getDatabase()

      const insert = db.prepare(`
      INSERT INTO subgoals (id, goal_id, title, priority)
      VALUES (?, ?, ?, ?)
    `)

      const insertMany = db.transaction((items: typeof subgoals) => {
        for (const s of items) {
          insert.run(uuidv4(), s.goal_id, s.title, s.priority)
        }
      })

      insertMany(subgoals)
      return { success: true }
    },
  )

  ipcMain.handle('subgoals:get-by-goal', (_event, goalId: string) => {
    const db = getDatabase()
    return db.prepare('SELECT * FROM subgoals WHERE goal_id = ? ORDER BY rowid').all(goalId)
  })

  ipcMain.handle('subgoals:delete', (_event, id: string) => {
    const db = getDatabase()
    db.prepare('DELETE FROM subgoals WHERE id = ?').run(id)
    return { success: true }
  })

  ipcMain.handle('subgoals:update', (_event, id: string, title: string, priority: string) => {
    const db = getDatabase()
    db.prepare('UPDATE subgoals SET title = ?, priority = ? WHERE id = ?').run(title, priority, id)
    return { success: true }
  })
}
