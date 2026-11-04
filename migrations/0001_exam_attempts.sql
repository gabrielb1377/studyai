-- Sprint 41G.2A — migration versionada: tentativas protegidas do Modo Prova.
--
-- Aplicar (uma das opções):
--   npm run db:migrate                    (aplica src/server/database/schema.sql, idempotente)
--   psql "$DATABASE_URL" -f migrations/0001_exam_attempts.sql
--
-- Rollback (apenas se não houver dados a preservar; remove SOMENTE esta tabela):
--   psql "$DATABASE_URL" -f migrations/0001_exam_attempts.rollback.sql
--
-- Esta migration não altera nenhuma tabela existente.
CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','in_progress','completed')),
  title TEXT,
  questions JSONB NOT NULL,
  answers JSONB,
  score NUMERIC,
  correct_count INTEGER,
  total_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS exam_attempts_user_status ON exam_attempts(user_id, status);