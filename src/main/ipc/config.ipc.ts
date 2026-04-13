import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'
import { v4 as uuidv4 } from 'uuid'

export function registerConfigHandlers(): void {
  ipcMain.handle(
    'config:save',
    (
      _event,
      data: {
        ai_provider: string
        api_key: string
        working_start: string
        working_end: string
        working_days: string[]
        break_start: string
        break_end: string
      },
    ) => {
      const db = getDatabase()

      const existing = db.prepare('SELECT id FROM config WHERE id = 1').get()

      if (existing) {
        db.prepare(
          `
        UPDATE config SET
          ai_provider = ?,
          api_key_encrypted = ?,
          working_start = ?,
          working_end = ?,
          working_days = ?,
          break_start = ?,
          break_end = ?,
          updated_at = datetime('now')
        WHERE id = 1
      `,
        ).run(
          data.ai_provider,
          data.api_key,
          data.working_start,
          data.working_end,
          JSON.stringify(data.working_days),
          data.break_start,
          data.break_end,
        )
      } else {
        db.prepare(
          `
        INSERT INTO config (
          id, ai_provider, api_key_encrypted,
          working_start, working_end, working_days,
          break_start, break_end
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      `,
        ).run(
          data.ai_provider,
          data.api_key,
          data.working_start,
          data.working_end,
          JSON.stringify(data.working_days),
          data.break_start,
          data.break_end,
        )
      }

      return { success: true }
    },
  )

  ipcMain.handle('config:get', () => {
    const db = getDatabase()
    const config = db.prepare('SELECT * FROM config WHERE id = 1').get()
    if (!config) return null

    const row = config as Record<string, unknown>
    return {
      ...row,
      working_days: JSON.parse(row.working_days as string),
    }
  })
}

// keep uuidv4 available for future use
export { uuidv4 }
