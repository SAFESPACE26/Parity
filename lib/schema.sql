CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  source_language     TEXT NOT NULL,
  target_language     TEXT NOT NULL,
  upload_dir          TEXT,
  comparison_contract JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id),
  status                TEXT NOT NULL DEFAULT 'queued',
  input_count           INTEGER NOT NULL DEFAULT 0,
  fields_checked        INTEGER NOT NULL DEFAULT 0,
  diverging_input_count INTEGER NOT NULL DEFAULT 0,
  verdict               TEXT,
  error                 TEXT,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS test_cases (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id  UUID NOT NULL REFERENCES verification_runs(id),
  seq     INTEGER NOT NULL,
  inputs  JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS test_cases_run_id_seq_idx ON test_cases (run_id, seq);

CREATE TABLE IF NOT EXISTS legacy_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id  UUID NOT NULL REFERENCES test_cases(id),
  outputs       JSONB NOT NULL,
  exec_ms       INTEGER
);

CREATE TABLE IF NOT EXISTS migrated_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id  UUID NOT NULL REFERENCES test_cases(id),
  outputs       JSONB NOT NULL,
  exec_ms       INTEGER
);

CREATE TABLE IF NOT EXISTS field_diffs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES verification_runs(id),
  test_case_id   UUID NOT NULL REFERENCES test_cases(id),
  module_id      UUID REFERENCES modules(id),
  field_name     TEXT NOT NULL,
  legacy_value   TEXT NOT NULL,
  migrated_value TEXT NOT NULL,
  is_match       BOOLEAN NOT NULL,
  delta          NUMERIC
);
CREATE INDEX IF NOT EXISTS field_diffs_run_id_is_match_idx ON field_diffs (run_id, is_match);
CREATE INDEX IF NOT EXISTS field_diffs_run_id_field_name_idx ON field_diffs (run_id, field_name);

CREATE TABLE IF NOT EXISTS findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES verification_runs(id),
  module_id       UUID REFERENCES modules(id),
  field_name      TEXT NOT NULL,
  diverging_count INTEGER NOT NULL,
  total_count     INTEGER NOT NULL,
  divergence_rate NUMERIC NOT NULL,
  max_abs_delta   NUMERIC,
  severity        TEXT NOT NULL,
  explanation     TEXT,
  suggested_fix   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS certifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID NOT NULL UNIQUE REFERENCES verification_runs(id),
  verdict          TEXT NOT NULL,
  input_count      INTEGER NOT NULL,
  fields_checked   INTEGER NOT NULL,
  finding_count    INTEGER NOT NULL,
  coverage_summary JSONB,
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_steps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID NOT NULL REFERENCES verification_runs(id),
  seq        INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  summary    TEXT NOT NULL,
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_steps_run_id_seq_idx ON agent_steps (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_queries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID REFERENCES verification_runs(id),
  step_id       UUID REFERENCES agent_steps(id),
  question      TEXT,
  sql           TEXT NOT NULL,
  row_count     INTEGER,
  result_sample JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_queries_run_id_created_at_idx ON agent_queries (run_id, created_at);

-- Backward-compat: add upload columns to existing projects tables
ALTER TABLE projects ADD COLUMN IF NOT EXISTS upload_dir TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS comparison_contract JSONB;

-- Live pipeline progress: current stage key the worker is executing
ALTER TABLE verification_runs ADD COLUMN IF NOT EXISTS stage TEXT;
