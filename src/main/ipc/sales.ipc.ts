import { ipcMain } from 'electron'
import { getDatabase } from '../db/database'

function getFiscalYearMonths(fiscalYearStart: number, year: number): string[] {
  const safeStart = Math.min(12, Math.max(1, Number(fiscalYearStart) || 1))
  const months: string[] = []

  for (let i = 0; i < 12; i++) {
    const monthIndex = safeStart - 1 + i
    const monthYear = year + Math.floor(monthIndex / 12)
    const month = (monthIndex % 12) + 1
    months.push(`${monthYear}-${String(month).padStart(2, '0')}`)
  }

  return months
}

export function registerSalesHandlers(): void {
  ipcMain.handle(
    'sales:get-monthly-targets',
    (_event, payload: { fiscalYearStart: number; year: number }) => {
      const db = getDatabase()
      const fiscalMonths = getFiscalYearMonths(payload.fiscalYearStart, payload.year)
      const placeholders = fiscalMonths.map(() => '?').join(', ')
      const rows = db
        .prepare(
          `
          SELECT year_month, sales_target, collection_target
          FROM monthly_targets
          WHERE year_month IN (${placeholders})
        `,
        )
        .all(...fiscalMonths) as {
        year_month: string
        sales_target: number
        collection_target: number
      }[]

      const byMonth = new Map(rows.map((row) => [row.year_month, row]))
      return fiscalMonths.map((yearMonth) => {
        const row = byMonth.get(yearMonth)
        return {
          year_month: yearMonth,
          sales_target: Number(row?.sales_target ?? 0),
          collection_target: Number(row?.collection_target ?? 0),
        }
      })
    },
  )

  ipcMain.handle(
    'sales:save-monthly-targets',
    (
      _event,
      targets: { year_month: string; sales_target: number; collection_target: number }[],
    ) => {
      const db = getDatabase()
      const upsert = db.prepare(
        `
        INSERT OR REPLACE INTO monthly_targets (
          year_month,
          sales_target,
          collection_target,
          updated_at
        ) VALUES (?, ?, ?, datetime('now'))
      `,
      )

      db.transaction((items: typeof targets) => {
        for (const target of items) {
          upsert.run(
            target.year_month,
            Number(target.sales_target ?? 0),
            Number(target.collection_target ?? 0),
          )
        }
      })(targets)

      return { success: true }
    },
  )

  ipcMain.handle('sales:get-daily-sales', (_event, payload: { month: string }) => {
    const db = getDatabase()
    return db
      .prepare(
        `
        SELECT date, sales_amount, collection_amount, notes
        FROM daily_sales
        WHERE date LIKE ?
        ORDER BY date ASC
      `,
      )
      .all(`${payload.month}-%`) as {
      date: string
      sales_amount: number
      collection_amount: number
      notes: string
    }[]
  })

  ipcMain.handle(
    'sales:save-daily-entry',
    (
      _event,
      entry: { date: string; sales_amount: number; collection_amount: number; notes?: string },
    ) => {
      const db = getDatabase()
      db.prepare(
        `
        INSERT OR REPLACE INTO daily_sales (date, sales_amount, collection_amount, notes)
        VALUES (?, ?, ?, ?)
      `,
      ).run(
        entry.date,
        Number(entry.sales_amount ?? 0),
        Number(entry.collection_amount ?? 0),
        entry.notes ?? '',
      )
      return { success: true }
    },
  )

  ipcMain.handle('sales:get-month-summary', (_event, payload: { month: string }) => {
    const db = getDatabase()
    const totals = db
      .prepare(
        `
        SELECT
          COALESCE(SUM(sales_amount), 0) as sales_done,
          COALESCE(SUM(collection_amount), 0) as collection_done,
          COUNT(*) as days_with_entry
        FROM daily_sales
        WHERE date LIKE ?
      `,
      )
      .get(`${payload.month}-%`) as {
      sales_done: number
      collection_done: number
      days_with_entry: number
    }

    const target = db
      .prepare(
        `
        SELECT sales_target, collection_target
        FROM monthly_targets
        WHERE year_month = ?
      `,
      )
      .get(payload.month) as
      | {
          sales_target: number
          collection_target: number
        }
      | undefined

    return {
      month: payload.month,
      sales_done: Number(totals?.sales_done ?? 0),
      sales_target: Number(target?.sales_target ?? 0),
      collection_done: Number(totals?.collection_done ?? 0),
      collection_target: Number(target?.collection_target ?? 0),
      days_with_entry: Number(totals?.days_with_entry ?? 0),
    }
  })

  ipcMain.handle(
    'sales:get-yearly-summary',
    (_event, payload: { fiscalYearStart: number; year: number }) => {
      const db = getDatabase()
      const fiscalMonths = getFiscalYearMonths(payload.fiscalYearStart, payload.year)
      const placeholders = fiscalMonths.map(() => '?').join(', ')

      const targets = db
        .prepare(
          `
          SELECT year_month, sales_target, collection_target
          FROM monthly_targets
          WHERE year_month IN (${placeholders})
        `,
        )
        .all(...fiscalMonths) as {
        year_month: string
        sales_target: number
        collection_target: number
      }[]

      const actuals = db
        .prepare(
          `
          SELECT
            substr(date, 1, 7) as year_month,
            COALESCE(SUM(sales_amount), 0) as sales_done,
            COALESCE(SUM(collection_amount), 0) as collection_done
          FROM daily_sales
          WHERE substr(date, 1, 7) IN (${placeholders})
          GROUP BY substr(date, 1, 7)
        `,
        )
        .all(...fiscalMonths) as {
        year_month: string
        sales_done: number
        collection_done: number
      }[]

      const targetByMonth = new Map(targets.map((row) => [row.year_month, row]))
      const actualByMonth = new Map(actuals.map((row) => [row.year_month, row]))

      return fiscalMonths.map((yearMonth) => {
        const target = targetByMonth.get(yearMonth)
        const actual = actualByMonth.get(yearMonth)
        return {
          year_month: yearMonth,
          sales_target: Number(target?.sales_target ?? 0),
          collection_target: Number(target?.collection_target ?? 0),
          sales_done: Number(actual?.sales_done ?? 0),
          collection_done: Number(actual?.collection_done ?? 0),
        }
      })
    },
  )
}
