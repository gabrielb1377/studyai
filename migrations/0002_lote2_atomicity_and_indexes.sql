-- StudyAI V1.2 — Lote 2B/2C: atomicidade de refresh_tokens e índices por user_id.
--
-- 100% aditiva e idempotente; compatível com sessões e registros existentes.
--
-- Aplicação em banco pequeno/staging (transacional):
--   npm run db:migrate
--   ou: psql "$DATABASE_URL" -f migrations/0002_lote2_atomicity_and_indexes.sql
--
-- Produção com tabelas grandes (sem lock prolongado de escrita):
--   Aplicar os ALTER TABLE (metadado instantâneo no PostgreSQL 11+ para colunas
--   nullable sem default) e criar os índices fora de transação usando
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS.

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id TEXT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by TEXT;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_family ON refresh_tokens(user_id, family_id) WHERE family_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS backups_user_created ON backups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS shares_user_created ON shares(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_tokens_user_id ON account_tokens(user_id);
