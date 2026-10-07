import type Database from 'better-sqlite3'

export function addColumnIfMissing(
  database: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  try {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (!message.includes('duplicate column name')) {
      throw error
    }
  }
}
