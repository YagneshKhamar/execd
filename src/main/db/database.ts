import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { runInitialMigration } from './migrations/001_initial'
import { addColumnIfMissing } from './schemaUtils'
import { ensureSyncSchema } from './syncSchema'

let db: Database.Database | null = null

function ensureSchemaUpdates(database: Database.Database): void {
  const configAlterStatements = [
    `ALTER TABLE config ADD COLUMN business_goal_count INTEGER NOT NULL DEFAULT 3`,
    `ALTER TABLE config ADD COLUMN personal_goal_count INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE config ADD COLUMN family_goal_count INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE config ADD COLUMN max_daily_tasks INTEGER NOT NULL DEFAULT 5`,
  ]

  for (const statement of configAlterStatements) {
    try {
      database.exec(statement)
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      if (!message.includes('duplicate column name')) {
        throw error
      }
    }
  }

  addColumnIfMissing(database, 'tasks', 'notes', 'TEXT NOT NULL DEFAULT ""')
  addColumnIfMissing(database, 'config', 'api_key_is_encrypted', 'INTEGER NOT NULL DEFAULT 0')

  const tableCreateStatements = [
    `CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS team_tasks (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      effort TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT NOT NULL,
      week_start TEXT NOT NULL,
      proof_value TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (member_id) REFERENCES team_members(id)
    )`,
    `CREATE TABLE IF NOT EXISTS team_task_logs (
      id TEXT PRIMARY KEY,
      team_task_id TEXT NOT NULL,
      action TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      logged_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_task_id) REFERENCES team_tasks(id)
    )`,
    `CREATE TABLE IF NOT EXISTS team_followups (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      team_task_id TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      scheduled_date TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (member_id) REFERENCES team_members(id),
      FOREIGN KEY (team_task_id) REFERENCES team_tasks(id)
    )`,
  ]

  for (const statement of tableCreateStatements) {
    try {
      database.exec(statement)
    } catch (error) {
      console.error('[DB] Failed schema update statement:', statement)
      throw new Error('Schema update failed', { cause: error })
    }
  }

  ensureSyncSchema(database)
}

export function getDatabase(): Database.Database {
  if (db) return db

  const isDev = !app.isPackaged
  const dbName = isDev ? 'execd-dev.db' : 'execd.db'
  const dbPath = join(app.getPath('userData'), dbName)

  console.log(`[DB] Using database: ${dbPath}`)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runInitialMigration(db)
  ensureSchemaUpdates(db)

  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
