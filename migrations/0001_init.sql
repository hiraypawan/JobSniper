-- StartupSniper / JobSniper D1 Schema (SQLite)
-- Supports Normalized Companies, Open ATS Jobs, Live HTTP Cache (100k writes/day free on D1), and Sync Telemetry

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  sources_json TEXT NOT NULL DEFAULT '[]',
  batch TEXT,
  description TEXT NOT NULL DEFAULT '',
  one_liner TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL,
  yc_url TEXT,
  logo_url TEXT,
  location TEXT,
  team_size INTEGER,
  is_remote INTEGER NOT NULL DEFAULT 0,
  last_funding_date TEXT,
  funding_amount TEXT,
  is_funded_last_12mo INTEGER NOT NULL DEFAULT 0,
  hiring_page_url TEXT,
  hiring_provider TEXT,
  open_roles_count INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  tech_stack_json TEXT NOT NULL DEFAULT '[]',
  founder_name TEXT,
  founder_twitter TEXT,
  founder_linkedin TEXT,
  founder_email TEXT,
  sniper_score INTEGER NOT NULL DEFAULT 50,
  outreach_status TEXT NOT NULL DEFAULT 'new',
  outreach_notes TEXT NOT NULL DEFAULT '',
  pitched_at TEXT,
  enriched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_funded ON companies(is_funded_last_12mo);
CREATE INDEX IF NOT EXISTS idx_companies_remote ON companies(is_remote);
CREATE INDEX IF NOT EXISTS idx_companies_roles ON companies(open_roles_count);
CREATE INDEX IF NOT EXISTS idx_companies_source ON companies(source);
CREATE INDEX IF NOT EXISTS idx_companies_batch ON companies(batch);
CREATE INDEX IF NOT EXISTS idx_companies_score ON companies(sniper_score DESC);
CREATE INDEX IF NOT EXISTS idx_companies_outreach ON companies(outreach_status);
CREATE INDEX IF NOT EXISTS idx_companies_updated ON companies(updated_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  location TEXT,
  remote INTEGER NOT NULL DEFAULT 0,
  department TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_remote ON jobs(remote);

-- D1-backed HTTP response & metadata cache (100,000 free writes/day vs KV's 1,000/day cap)
CREATE TABLE IF NOT EXISTS http_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/json',
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_http_cache_expires ON http_cache(expires_at);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  total_fetched INTEGER NOT NULL DEFAULT 0,
  total_upserted INTEGER NOT NULL DEFAULT 0,
  enriched_count INTEGER NOT NULL DEFAULT 0,
  sources_report_json TEXT NOT NULL DEFAULT '[]'
);
