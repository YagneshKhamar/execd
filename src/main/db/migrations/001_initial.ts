import type Database from 'better-sqlite3'

export function runInitialMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      ai_provider TEXT NOT NULL DEFAULT 'openai',
      api_key_encrypted TEXT NOT NULL DEFAULT '',
      api_key_is_encrypted INTEGER NOT NULL DEFAULT 0,
      working_start TEXT NOT NULL DEFAULT '09:00',
      working_end TEXT NOT NULL DEFAULT '18:00',
      working_days TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
      break_start TEXT NOT NULL DEFAULT '13:00',
      break_end TEXT NOT NULL DEFAULT '14:00',
      business_goal_count INTEGER NOT NULL DEFAULT 3,
      personal_goal_count INTEGER NOT NULL DEFAULT 1,
      family_goal_count INTEGER NOT NULL DEFAULT 1,
      ollama_model TEXT NOT NULL DEFAULT 'llama3',
      ollama_base_url TEXT NOT NULL DEFAULT 'http://localhost:11434',
      openrouter_model TEXT NOT NULL DEFAULT 'nvidia/nemotron-3-super-120b-a12b:free',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS holidays (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      is_working INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      month TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      ai_validated INTEGER NOT NULL DEFAULT 0,
      ai_validation_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subgoals (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      subgoal_id TEXT NOT NULL,
      title TEXT NOT NULL,
      effort TEXT NOT NULL DEFAULT 'medium',
      proof_type TEXT NOT NULL DEFAULT 'none',
      scheduled_date TEXT NOT NULL,
      scheduled_time_slot TEXT NOT NULL DEFAULT 'anytime',
      status TEXT NOT NULL DEFAULT 'pending',
      proof_value TEXT,
      carried_over_from TEXT,
      carry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (subgoal_id) REFERENCES subgoals(id)
    );

    CREATE TABLE IF NOT EXISTS day_plans (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      available_minutes INTEGER NOT NULL DEFAULT 480,
      locked INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      replan_used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS day_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      total_weight INTEGER NOT NULL DEFAULT 0,
      completed_weight INTEGER NOT NULL DEFAULT 0,
      execution_score REAL NOT NULL DEFAULT 0,
      ai_feedback TEXT NOT NULL DEFAULT '',
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      tasks_missed INTEGER NOT NULL DEFAULT 0,
      tasks_carried INTEGER NOT NULL DEFAULT 0,
      tasks_dropped INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_logs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      date TEXT NOT NULL,
      action TEXT NOT NULL,
      proof_type TEXT,
      proof_value TEXT,
      carry_count_at_time INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS behavior_flags (
      id TEXT PRIMARY KEY,
      flag_type TEXT NOT NULL,
      description TEXT NOT NULL,
      task_id TEXT,
      subgoal_id TEXT,
      detected_on TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_on TEXT
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS business_profile (
      id INTEGER PRIMARY KEY DEFAULT 1,
      business_name TEXT NOT NULL DEFAULT '',
      business_type TEXT NOT NULL DEFAULT 'other',
      monthly_sales_target REAL DEFAULT NULL,
      collection_target REAL DEFAULT NULL,
      primary_activities TEXT NOT NULL DEFAULT '[]',
      team_size INTEGER NOT NULL DEFAULT 1,
      language TEXT NOT NULL DEFAULT 'en',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const addColumnIfMissing = (col: string, def: string) => {
    try {
      db.exec(`ALTER TABLE config ADD COLUMN ${col} ${def}`)
    } catch {
      // column already exists, ignore
    }
  }
  addColumnIfMissing('ollama_model', "TEXT NOT NULL DEFAULT 'llama3'")
  addColumnIfMissing('ollama_base_url', "TEXT NOT NULL DEFAULT 'http://localhost:11434'")
  addColumnIfMissing(
    'openrouter_model',
    "TEXT NOT NULL DEFAULT 'nvidia/nemotron-3-super-120b-a12b:free'",
  )
  addColumnIfMissing('api_key_is_encrypted', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('fiscal_year_start', 'INTEGER NOT NULL DEFAULT 4')
}
