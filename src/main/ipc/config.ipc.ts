import { ipcMain, safeStorage } from 'electron'
import { getDatabase } from '../db/database'
import { v4 as uuidv4 } from 'uuid'

export function registerConfigHandlers(): void {
  ipcMain.handle(
    'config:save',
    (
      _event,
      data: {
        api_key: string
        working_start: string
        working_end: string
        working_days: string[]
        break_start: string
        break_end: string
        business_goal_count: number
        personal_goal_count: number
        family_goal_count: number
        max_daily_tasks?: number
        fiscal_year_start?: number
      },
    ) => {
      const db = getDatabase()
      const {
        api_key,
        working_start,
        working_end,
        working_days,
        break_start,
        break_end,
        business_goal_count,
        personal_goal_count,
        family_goal_count,
        max_daily_tasks = 5,
        fiscal_year_start = 4,
      } = data
      const rawKey = api_key || ''
      let keyToStore = rawKey
      let apiKeyIsEncrypted = 0

      if (rawKey && safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(rawKey)
        keyToStore = encrypted.toString('base64')
        apiKeyIsEncrypted = 1
      }

      const existing = db.prepare('SELECT id FROM config WHERE id = 1').get()

      if (existing) {
        db.prepare(
          `
        UPDATE config SET
          api_key_encrypted = ?,
          api_key_is_encrypted = ?,
          working_start = ?,
          working_end = ?,
          working_days = ?,
          break_start = ?,
          break_end = ?,
          business_goal_count = ?,
          personal_goal_count = ?,
          family_goal_count = ?,
          max_daily_tasks = ?,
          fiscal_year_start = ?,
          updated_at = datetime('now')
        WHERE id = 1
      `,
        ).run(
          keyToStore,
          apiKeyIsEncrypted,
          working_start,
          working_end,
          JSON.stringify(working_days),
          break_start,
          break_end,
          business_goal_count,
          personal_goal_count,
          family_goal_count,
          max_daily_tasks,
          fiscal_year_start ?? 4,
        )
      } else {
        db.prepare(
          `
          INSERT INTO config (
            id, api_key_encrypted, api_key_is_encrypted,
            working_start, working_end, working_days,
            break_start, break_end, business_goal_count,
            personal_goal_count, family_goal_count, max_daily_tasks,
            fiscal_year_start
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          keyToStore,
          apiKeyIsEncrypted,
          working_start,
          working_end,
          JSON.stringify(working_days),
          break_start,
          break_end,
          business_goal_count,
          personal_goal_count,
          family_goal_count,
          max_daily_tasks,
          fiscal_year_start ?? 4,
        )
      }

      return { success: true }
    },
  )

  ipcMain.handle('config:get', () => {
    const db = getDatabase()
    const config = db.prepare('SELECT * FROM config WHERE id = 1').get() as
      | Record<string, unknown>
      | undefined
    if (!config) return null

    if (
      config.api_key_is_encrypted === 1 &&
      config.api_key_encrypted &&
      safeStorage.isEncryptionAvailable()
    ) {
      try {
        const buffer = Buffer.from(config.api_key_encrypted as string, 'base64')
        config.api_key_encrypted = safeStorage.decryptString(buffer)
      } catch {
        config.api_key_encrypted = ''
      }
    }

    const row = config as Record<string, unknown>
    const rest = { ...row }
    delete rest.ai_provider
    let workingDays: string[] = ['mon', 'tue', 'wed', 'thu', 'fri']
    try {
      const parsed = JSON.parse(String(row.working_days ?? '[]')) as unknown
      if (Array.isArray(parsed) && parsed.every((day) => typeof day === 'string')) {
        workingDays = parsed
      }
    } catch {
      // Keep defaults when stored value is invalid.
    }

    return {
      ...rest,
      ai_provider: 'openai',
      working_days: workingDays,
      business_goal_count: Number(row.business_goal_count ?? 3),
      personal_goal_count: Number(row.personal_goal_count ?? 1),
      family_goal_count: Number(row.family_goal_count ?? 1),
      max_daily_tasks: Number(row.max_daily_tasks ?? 5),
      fiscal_year_start: Number(row.fiscal_year_start ?? 4),
    }
  })
}

// keep uuidv4 available for future use
export { uuidv4 }
