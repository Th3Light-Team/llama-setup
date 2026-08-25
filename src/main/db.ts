import Database from 'better-sqlite3'
import { join } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'

const appDir = join(homedir(), '.llama-studio')
mkdirSync(appDir, { recursive: true })

const dbPath = join(appDir, 'studio.db')
export const db = new Database(dbPath)

// First migration
db.exec(`
  CREATE TABLE IF NOT EXISTS installs (
    id TEXT PRIMARY KEY,
    tag TEXT NOT NULL,
    backend TEXT NOT NULL,
    install_date TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    path TEXT,
    binary_path TEXT,
    health_status TEXT DEFAULT 'unknown',
    last_verified TEXT,
    version_raw TEXT,
    version_build INTEGER
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    backend TEXT,
    created_at TEXT NOT NULL,
    flags TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    author TEXT,
    downloads INTEGER,
    likes INTEGER,
    license TEXT,
    installed_variants TEXT
  );

  CREATE TABLE IF NOT EXISTS detection_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    result TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS discovery_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    result TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profile_runs (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    stopped_at TEXT,
    exit_code INTEGER
  );

  CREATE TABLE IF NOT EXISTS downloads (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    url             TEXT NOT NULL,
    target_path     TEXT NOT NULL,
    part_path       TEXT NOT NULL,
    meta_path       TEXT NOT NULL,
    extract_zip     INTEGER NOT NULL DEFAULT 0,
    bytes_total     INTEGER,
    bytes_done      INTEGER NOT NULL DEFAULT 0,
    state           TEXT NOT NULL DEFAULT 'queued',
    error_message   TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 5,
    sha256_expected TEXT,
    sha256_actual   TEXT,
    etag            TEXT,
    extra           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_downloads_state ON downloads(state);
  CREATE INDEX IF NOT EXISTS idx_downloads_created_at ON downloads(created_at);

  CREATE TABLE IF NOT EXISTS bench_runs (
    id            TEXT PRIMARY KEY,
    model_path    TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    install_path  TEXT NOT NULL,
    spec          TEXT NOT NULL,
    state         TEXT NOT NULL DEFAULT 'queued',
    progress      INTEGER NOT NULL DEFAULT 0,
    log           TEXT NOT NULL DEFAULT '',
    result        TEXT,
    error_message TEXT,
    exit_code     INTEGER,
    started_at    TEXT,
    finished_at   TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bench_runs_state ON bench_runs(state);
  CREATE INDEX IF NOT EXISTS idx_bench_runs_created_at ON bench_runs(created_at);
`)

// Migration: add new columns to installs if they don't exist
// SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check pragmatically
try {
  const columns = db.prepare("PRAGMA table_info('installs')").all() as { name: string }[]
  const columnNames = new Set(columns.map(c => c.name))
  
  if (!columnNames.has('path')) {
    db.exec('ALTER TABLE installs ADD COLUMN path TEXT')
  }
  if (!columnNames.has('binary_path')) {
    db.exec('ALTER TABLE installs ADD COLUMN binary_path TEXT')
  }
  if (!columnNames.has('health_status')) {
    db.exec("ALTER TABLE installs ADD COLUMN health_status TEXT DEFAULT 'unknown'")
  }
  if (!columnNames.has('last_verified')) {
    db.exec('ALTER TABLE installs ADD COLUMN last_verified TEXT')
  }
  if (!columnNames.has('version_raw')) {
    db.exec('ALTER TABLE installs ADD COLUMN version_raw TEXT')
  }
  if (!columnNames.has('version_build')) {
    db.exec('ALTER TABLE installs ADD COLUMN version_build INTEGER')
  }
} catch {
  // Migration errors are non-fatal for existing databases
}

