-- Add publication/listing metadata and explicit TrustMRR revenue signals.
-- Apply once to existing D1 databases after 0001_init.sql. Runtime schema
-- upgrades perform the same additive change when the worker first runs.
ALTER TABLE companies ADD COLUMN launch_date TEXT;
ALTER TABLE companies ADD COLUMN launch_source TEXT;
ALTER TABLE companies ADD COLUMN launch_url TEXT;
ALTER TABLE companies ADD COLUMN trustmrr_mrr REAL;
ALTER TABLE companies ADD COLUMN trustmrr_last30 REAL;
ALTER TABLE companies ADD COLUMN trustmrr_total REAL;
CREATE INDEX IF NOT EXISTS idx_companies_launch_date ON companies(launch_date DESC);
