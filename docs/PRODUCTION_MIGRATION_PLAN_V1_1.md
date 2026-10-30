# Plano de Migração PostgreSQL de Produção — V1.1

**Status:** plano preparado; nenhuma conexão/alteração em produção.  
**Aplicação autorizada:** somente em janela aprovada, após backup e restore testados.

## Evidência local

- Fonte canônica: `src/server/database/schema.sql` (idempotência por
  `CREATE TABLE/INDEX IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS` e
  alterações explícitas existentes).
- Entidades críticas: `usage_quotas`, `rate_limits`, `user_api_keys`; PK
  composta, índices e FK para `users(id) ON DELETE CASCADE` conferidos no
  PostgreSQL descartável.
- `scripts/db-migrate.mjs` aplica o arquivo inteiro dentro de `BEGIN/COMMIT`,
  com `ROLLBACK` em erro. PostgreSQL 18.4 isolado aceitou aplicação duas vezes;
  restore de backup separado manteve constraints e índices.
- `npm run build` não executa `db:migrate`; o Docker CMD roda migração **em cada
  inicialização do container** antes de `server.js`. Além disso,
  `initializePostgres()` aplica `schema.sql` uma vez por processo quando há
  primeira query. Portanto build não migra banco, mas runtime atual pode fazer
  DDL automaticamente. Isso é relevante para autorizar o rollout.
- O script não possui tabela de versão/checksum de migração e não produz plano
  `down`. `CREATE IF NOT EXISTS` não valida se uma tabela existente tem o mesmo
  shape. `ALTER TABLE files ALTER COLUMN content DROP NOT NULL` é alteração de
  compatibilidade que não deve ser revertida sem análise.
- O schema local é igual ao schema no checkpoint anterior identificado; isso
  **não** prova qual schema existe na produção.

## Pré-condições obrigatórias

1. Autorização escrita, branch/commit exatos congelados e janela definida.
2. Identificar deployment e versão atualmente ativos e confirmar suporte à
   coexistência com o schema durante restart/rollback.
3. Obter backup PostgreSQL completo aprovado; verificar formato/hash e fazer
   restore de ensaio em banco isolado. Backup de teste local desta sprint não é
   backup de produção.
4. Confirmar conexão privada, TLS e permissões necessárias sem incluir URLs ou
   senhas em terminal/logs.
5. Usar preflight somente leitura para `users`, `usage_quotas`, `rate_limits`,
   `user_api_keys`, `files`, índices, constraints e versão PostgreSQL. Se houver
   drift inesperado, parar e preparar migration específica após revisão.
6. Manter `AUTH_SECRET` e `API_KEYS_ENCRYPTION_KEY` atuais inalteradas.

## Procedimento da janela autorizada

### A. Backup e ponto de recuperação

Seguir `docs/ROLLBACK_V1_1.md`: `pg_dump` custom format, checksum, `pg_restore
--list`, restore de ensaio e aprovação. Armazenar criptografado, com ACL
restritiva fora do Git e de pastas sincronizadas. Não colocar credenciais em
argumentos salvos, logs ou documentação.

### B. Preflight somente leitura

Com sessão protegida e database selecionado, confirmar a existência e a
definição real das tabelas/índices/FKs; contagens agregadas podem ser usadas,
sem selecionar payloads, emails, tokens ou ciphertexts. Confirmar espaço livre,
conexões, locks e ausência de DDL concorrente. As consultas específicas ficam
em `docs/RAILWAY_PRE_DEPLOY_V1_1.md`/checklist de janela.

Consultas preparadas (apenas leitura; executar somente depois de conexão
autorizada ao banco certo). Não selecionar valores, `payload`, email, tokens ou
ciphertexts:

```sql
SELECT current_database(), current_setting('server_version');
SELECT name, to_regclass(format('public.%I', name)) AS relation
FROM unnest(ARRAY['users','files','usage_quotas','rate_limits','user_api_keys']) AS name;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('usage_quotas','rate_limits','user_api_keys','files')
ORDER BY tablename, indexname;

SELECT conrelid::regclass AS table_name, conname, contype, convalidated
FROM pg_constraint
WHERE conrelid IN ('public.usage_quotas'::regclass,
                   'public.rate_limits'::regclass,
                   'public.user_api_keys'::regclass,
                   'public.files'::regclass)
ORDER BY 1,2;

SELECT indexrelid::regclass AS index_name, indisvalid, indisready
FROM pg_index
WHERE indrelid IN ('public.usage_quotas'::regclass,
                   'public.rate_limits'::regclass,
                   'public.user_api_keys'::regclass,
                   'public.files'::regclass)
ORDER BY 1;
```

O SQL pressupõe que as tabelas existem; para schemas anteriores, primeiro
verificar `to_regclass` e adaptar preflight, sem executar `::regclass` em uma
relação ausente. A query de constraints deve ser executada após confirmar as
quatro relações.

### C. Migração

`npm run db:migrate` aplica `schema.sql` idempotente em transação. Em deploy pelo
Docker atual, a mesma migração é executada no start; o runbook deve tratar o
primeiro start como operação mutável e acompanhar log/status. Não iniciar
réplicas concorrentes durante alteração, salvo aprovação da estratégia de lock.
Não rodar em produção fora da janela nem assumir que Railway aplicou algo.

O build (`npm run build`) não deve receber `DATABASE_URL` e não executa migração.
Confirmado pelo Dockerfile atual: etapa builder apenas roda `npm run build`;
migração está no CMD runtime.

### D. Verificação pós-DDL

Confirmar sem ler conteúdo privado:

- tabelas `usage_quotas`, `rate_limits`, `user_api_keys` e `files` existem;
- PKs compostas e FKs para users continuam válidas;
- índices `usage_quotas_user_date`, `usage_quotas_user_minute` e
  `rate_limits_bucket` existem;
- `pg_constraint` não mostra FK inválida; `pg_index.indisvalid = true`;
- readiness reports DB/schema e bucket acessíveis;
- somente então continuar com deploy/smoke tests autorizados.

Se houver erro, não executar `DROP`, não repetir operação cega e não restaurar
sobre o banco ativo. Capturar código/trecho sanitizado, preservar estado e
decidir com DBA entre correção forward ou restore em janela dedicada.

## Compatibilidade e reversibilidade

- DDL aditivo `CREATE IF NOT EXISTS` é normalmente preservável pelo código
  anterior, mas a compatibilidade total com o banco remoto é **não verificada**.
- `ALTER TABLE files ... DROP NOT NULL` amplia valores aceitos; não há `down`
  automático. Rollback de app não reverte schema.
- Não apagar `rate_limits`, `usage_quotas`, `user_api_keys` nem truncar dados como
  método de rollback.
- Restore completo sobre banco que já recebeu gravações novas é operação
  potencialmente destrutiva: requer congelar escrita, quantificar perda e
  autorização específica.
- **Classificação operacional:** selecionar deployment anterior pode ser
  reversível apenas se schema e envelopes BYOK forem suportados pelo alvo;
  DDL atual é parcialmente reversível (sem `down`, sem rollback automático);
  apagar/rotacionar `API_KEYS_ENCRYPTION_KEY` sem rekey/backup pode ser
  irreversível para BYOK v2; excluir objeto S3 é potencialmente irreversível
  quando não existe versioning/backup (estado remoto não verificado). Restaurar
  snapshot antigo pode perder escritas novas e não é reversível sem journal/merge.
- Nenhuma migração de produção, probe a DB remota ou alteração de schema Railway
  foi feita nesta sprint.
