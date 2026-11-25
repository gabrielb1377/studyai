-- StudyAI V1.2 — Lote 3A/3B: governança de tokens/orçamento de IA compartilhada
-- e reservas de cota acumulada de armazenamento (arquivos e backups).
--
-- 100% aditiva e idempotente; preserva integralmente dados, sessões e chaves BYOK existentes.
--
-- Aplicação em ambiente de teste/staging:
--   npm run db:migrate
--   ou: psql "$DATABASE_URL" -f migrations/0003_lote3_ai_budgets_and_storage_quotas.sql
--
-- Em produção com tabelas grandes:
--   - ALTER TABLE usage_quotas ADD COLUMN IF NOT EXISTS reserved_tokens BIGINT NOT NULL DEFAULT 0
--     é metadado instantâneo no PostgreSQL 11+.
--   - As novas tabelas nascem vazias (sem lock em tabelas existentes).

ALTER TABLE usage_quotas ADD COLUMN IF NOT EXISTS reserved_tokens BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ai_global_daily_budgets (
  date DATE PRIMARY KEY,
  reserved_tokens BIGINT NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  consumed_tokens BIGINT NOT NULL DEFAULT 0 CHECK (consumed_tokens >= 0),
  requests_count BIGINT NOT NULL DEFAULT 0 CHECK (requests_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_token_reservations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider TEXT NOT NULL,
  model TEXT,
  credential_origin TEXT NOT NULL CHECK (credential_origin IN ('shared','byok','local')),
  reserved_tokens BIGINT NOT NULL CHECK (reserved_tokens >= 0),
  actual_input_tokens BIGINT,
  actual_output_tokens BIGINT,
  actual_total_tokens BIGINT,
  usage_source TEXT NOT NULL DEFAULT 'reserved' CHECK (usage_source IN ('reserved','provider','estimated','unknown')),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','reconciled','failed','cancelled','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_at TIMESTAMPTZ,
  UNIQUE (user_id, request_id)
);
CREATE INDEX IF NOT EXISTS ai_token_reservations_status_expires ON ai_token_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS ai_token_reservations_user_date ON ai_token_reservations(user_id, usage_date);

CREATE TABLE IF NOT EXISTS storage_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('files','backups')),
  resource_id TEXT,
  reserved_bytes BIGINT NOT NULL CHECK (reserved_bytes >= 0),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committed','released','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS storage_reservations_user_kind_status ON storage_reservations(user_id, kind, status);
CREATE INDEX IF NOT EXISTS storage_reservations_expires ON storage_reservations(status, expires_at);
