import type Database from 'better-sqlite3'
import { addColumnIfMissing } from './schemaUtils'

// Local storage for Supabase sync. Requires team_members and team_tasks to exist.
//
// team_tasks / my_tasks .sync_status: 'local' (never sent: Supabase off, or predates sync),
// 'pending' (queued), 'unlinked' (assignee not yet an organization member), 'synced', 'failed'.
// A synced team_tasks row reuses its local id as the remote id.
export function ensureSyncSchema(database: Database.Database): void {
  addColumnIfMissing(database, 'team_members', 'remote_user_id', 'TEXT')
  addColumnIfMissing(database, 'team_tasks', 'sync_status', `TEXT NOT NULL DEFAULT 'local'`)
  addColumnIfMissing(database, 'team_tasks', 'sync_error', 'TEXT')
  addColumnIfMissing(database, 'team_tasks', 'remote_version', 'INTEGER')
  addColumnIfMissing(database, 'team_tasks', 'migration_source', 'TEXT')

  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      client_event_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      synced_at TEXT
    );
    CREATE INDEX IF NOT EXISTS sync_outbox_entity_idx ON sync_outbox (entity_id);
    CREATE INDEX IF NOT EXISTS sync_outbox_status_idx ON sync_outbox (user_id, status);

    CREATE TABLE IF NOT EXISTS sync_state (
      scope TEXT PRIMARY KEY,
      last_server_cursor TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS my_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      effort TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT NOT NULL,
      week_start TEXT NOT NULL,
      proof_value TEXT,
      notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      remote_version INTEGER,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      sync_error TEXT
    );
    CREATE INDEX IF NOT EXISTS my_tasks_user_idx ON my_tasks (user_id);
  `)
}
