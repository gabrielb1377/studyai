-- Rollback opcional da migration 0003 (Lote 3A/3B).
-- ATENÇÃO: remove apenas as tabelas operacionais novas de reserva/orçamento.
-- NÃO remove a coluna usage_quotas.reserved_tokens por padrão para evitar lock
-- ou perda de histórico; a coluna com DEFAULT 0 é compatível com versões anteriores.
-- Executar somente em ambiente descartável ou com backup confirmado e autorização.
DROP TABLE IF EXISTS storage_reservations;
DROP TABLE IF EXISTS ai_token_reservations;
DROP TABLE IF EXISTS ai_global_daily_budgets;
