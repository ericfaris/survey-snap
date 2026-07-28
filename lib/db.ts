import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.env.SURVEY_SNAP_ROOT || process.cwd();
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const DB_PATH = process.env.SURVEY_SNAP_DB || path.join(DATA_DIR, 'survey-snap.db');

type Global = typeof globalThis & {
  __surveySnapDb?: Database.Database;
};

const g = globalThis as Global;

/**
 * Locate schema.sql. Next bundles `lib/db.ts`, so `__dirname` is unreliable at
 * runtime — resolve from the project root first and only then fall back.
 */
function schemaSql(): string {
  const candidates = [
    path.join(ROOT, 'lib', 'db', 'schema.sql'),
    path.join(__dirname, 'db', 'schema.sql'),
    path.join(__dirname, '..', 'lib', 'db', 'schema.sql'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  }
  throw new Error(`Could not locate lib/db/schema.sql (tried: ${candidates.join(', ')})`);
}

function open(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql());
  return db;
}

/**
 * The handle is cached on `globalThis` because Next.js dev-mode HMR re-evaluates
 * modules; without this we would leak a new SQLite connection on every edit.
 */
export function getDb(): Database.Database {
  if (!g.__surveySnapDb) g.__surveySnapDb = open();
  return g.__surveySnapDb;
}

/** Test helper: point the module at a fresh database file. */
export function _resetDbForTests(file: string): Database.Database {
  g.__surveySnapDb?.close();
  process.env.SURVEY_SNAP_DB = file;
  g.__surveySnapDb = undefined;
  // re-open against the new path
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.exec(schemaSql());
  g.__surveySnapDb = db;
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
