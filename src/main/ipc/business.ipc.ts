import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'

export function registerBusinessHandlers(): void {
  ipcMain.handle('business:get', () => {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM business_profile WHERE id = 1').get() as
      | Record<string, unknown>
      | undefined

    if (!row) return null

    let primaryActivities: string[] = []
    try {
      const parsed = JSON.parse(String(row.primary_activities ?? '[]')) as unknown
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        primaryActivities = parsed
      }
    } catch {
      primaryActivities = []
    }

    return {
      business_name: String(row.business_name ?? ''),
      business_type: String(row.business_type ?? 'other'),
      monthly_sales_target:
        row.monthly_sales_target === null || row.monthly_sales_target === undefined
          ? null
          : Number(row.monthly_sales_target),
      collection_target:
        row.collection_target === null || row.collection_target === undefined
          ? null
          : Number(row.collection_target),
      primary_activities: primaryActivities,
      team_size: Number(row.team_size ?? 1),
      language: String(row.language ?? 'en'),
    }
  })

  ipcMain.handle(
    'business:save',
    (
      _event,
      data: {
        business_name: string
        business_type: string
        monthly_sales_target?: number | null
        collection_target?: number | null
        primary_activities: string[]
        team_size: number
        language: string
      },
    ) => {
      const db = getDatabase()
      const existing = db.prepare('SELECT id FROM business_profile WHERE id = 1').get() as
        | { id: number }
        | undefined

      if (existing) {
        db.prepare(
          `
          UPDATE business_profile SET
            business_name = ?,
            business_type = ?,
            monthly_sales_target = ?,
            collection_target = ?,
            primary_activities = ?,
            team_size = ?,
            language = ?,
            updated_at = datetime('now')
          WHERE id = 1
        `,
        ).run(
          data.business_name,
          data.business_type,
          data.monthly_sales_target ?? null,
          data.collection_target ?? null,
          JSON.stringify(data.primary_activities),
          data.team_size,
          data.language,
        )
      } else {
        db.prepare(
          `
          INSERT INTO business_profile (
            id,
            business_name,
            business_type,
            monthly_sales_target,
            collection_target,
            primary_activities,
            team_size,
            language
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          data.business_name,
          data.business_type,
          data.monthly_sales_target ?? null,
          data.collection_target ?? null,
          JSON.stringify(data.primary_activities),
          data.team_size,
          data.language,
        )
      }

      return { success: true }
    },
  )
}
