/**
 * In-memory SQLite database for unit tests.
 * Shares the same schema as the production db.ts so repo.ts works unchanged.
 */
import Database from 'better-sqlite3'

export const db = new Database(':memory:')

db.exec(`
  CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    display_name TEXT NOT NULL,
    url TEXT NOT NULL,
    target_path TEXT NOT NULL,
    part_path TEXT NOT NULL,
    meta_path TEXT NOT NULL,
    extract_zip INTEGER NOT NULL DEFAULT 0,
    bytes_total INTEGER,
    bytes_done INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'queued',
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    sha256_expected TEXT,
    sha256_actual TEXT,
    etag TEXT,
    extra TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_downloads_state ON downloads(state);
  CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at DESC);
`)
