import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { runInitialMigration } from './migrations/001_initial'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'work-planner.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runInitialMigration(db)

  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
