PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS receipts (
  id              TEXT PRIMARY KEY,             -- uuid
  created_at      TEXT NOT NULL,                -- ISO-8601
  updated_at      TEXT NOT NULL,
  image_path      TEXT NOT NULL,                -- data/uploads/<id>.jpg
  ocr_raw_text    TEXT,
  survey_code     TEXT,                         -- 26 digits, user-corrected, no separators
  store_number    TEXT,
  register_number TEXT,
  visit_date      TEXT,                         -- ISO date, best effort
  visit_time      TEXT,                         -- HH:MM, best effort
  order_number    TEXT,
  total_amount    REAL,
  items_json      TEXT,                         -- JSON array [{qty,name,price}]
  status          TEXT NOT NULL DEFAULT 'new',  -- new|staged|submitted|error
  validation_code TEXT,
  submitted_at    TEXT,
  replay_attempts INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_code
  ON receipts(survey_code) WHERE survey_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS survey_runs (
  id           TEXT PRIMARY KEY,
  receipt_id   TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  phase        TEXT NOT NULL,     -- 'stage' | 'confirm'
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT NOT NULL,     -- running|staged|submitted|failed
  page_count   INTEGER,
  transcript_json TEXT,           -- StagedQuestion[] snapshot
  final_page_text TEXT,           -- innerText of the terminal page (validation-code safety net)
  error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_receipt ON survey_runs(receipt_id, started_at DESC);

CREATE TABLE IF NOT EXISTS answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id   TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,     -- e.g. R028000
  page_index   INTEGER NOT NULL,
  prompt       TEXT NOT NULL,
  input_type   TEXT NOT NULL,     -- radio_grid|radio_list|checkbox|text|select|unknown
  options_json TEXT,              -- [{value,label}]
  suggested    TEXT,              -- JSON: string | string[] | null
  confirmed    TEXT,              -- JSON, set at confirm time
  needs_user   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(receipt_id, question_id)
);
