-- Rollback opcional dos índices criados na migration 0002.
-- ATENÇÃO: NÃO executa DROP COLUMN em refresh_tokens por padrão para evitar
-- perda de rastreabilidade de famílias ativas ou locks desnecessários; manter
-- colunas nullable não prejudica versões anteriores da aplicação.
DROP INDEX IF EXISTS account_tokens_user_id;
DROP INDEX IF EXISTS shares_user_created;
DROP INDEX IF EXISTS backups_user_created;
DROP INDEX IF EXISTS refresh_tokens_user_family;
DROP INDEX IF EXISTS refresh_tokens_user_id;
