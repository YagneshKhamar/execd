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
      business_description: String(row.business_description ?? ''),
      sales_target_unit: String(row.sales_target_unit ?? 'amount'),
      sales_target_unit_label: String(row.sales_target_unit_label ?? ''),
      monthly_sales_target:
        row.monthly_sales_target === null || row.monthly_sales_target === undefined
          ? null
          : Number(row.monthly_sales_target),
      collection_target:
        row.collection_target === null || row.collection_target === undefined
          ? null
          : Number(row.collection_target),
      primary_activities: primaryActivities,
      departments: (() => {
        try {
          const parsed = JSON.parse(String(row.departments ?? '[]'))
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })(),
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
        business_description?: string
        sales_target_unit?: string
        sales_target_unit_label?: string
        monthly_sales_target?: number | null
        collection_target?: number | null
        primary_activities: string[]
        departments?: string[]
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
            business_description = ?,
            sales_target_unit = ?,
            sales_target_unit_label = ?,
            monthly_sales_target = ?,
            collection_target = ?,
            primary_activities = ?,
            departments = ?,
            team_size = ?,
            language = ?,
            updated_at = datetime('now')
          WHERE id = 1
        `,
        ).run(
          data.business_name,
          data.business_type,
          data.business_description ?? '',
          data.sales_target_unit ?? 'amount',
          data.sales_target_unit_label ?? '',
          data.monthly_sales_target ?? null,
          data.collection_target ?? null,
          JSON.stringify(data.primary_activities),
          JSON.stringify(data.departments ?? []),
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
            business_description,
            sales_target_unit,
            sales_target_unit_label,
            monthly_sales_target,
            collection_target,
            primary_activities,
            departments,
            team_size,
            language
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          data.business_name,
          data.business_type,
          data.business_description ?? '',
          data.sales_target_unit ?? 'amount',
          data.sales_target_unit_label ?? '',
          data.monthly_sales_target ?? null,
          data.collection_target ?? null,
          JSON.stringify(data.primary_activities),
          JSON.stringify(data.departments ?? []),
          data.team_size,
          data.language,
        )
      }

      return { success: true }
    },
  )
}
