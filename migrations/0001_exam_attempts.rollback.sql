-- Sprint 41G.2A — rollback da migration 0001.
-- Remove apenas a tabela criada pela migration. Não toca em outras tabelas.
-- ATENÇÃO: apaga tentativas de prova existentes. Executar somente em
-- ambiente de desenvolvimento/teste ou com backup confirmado.
DROP INDEX IF EXISTS exam_attempts_user_status;
DROP TABLE IF EXISTS exam_attempts;