# StudyAI V1.2 — Infrastructure Readiness, Railway IaC e Preparação para Homologação (Lote 4)

**Data:** 24/11/2026  
**Branch de desenvolvimento:** `v1.1-development` (`main` preservada em `7e3d89b`)  
**Parecer para lançamento público:** **NO-GO** (Lote 4 preparado localmente; provisionamento remoto e homologação do Lote 5 aguardam autorização explícita do owner).

---

## 1. Inventário Real da Infraestrutura (Somente Leitura)

### 1.1 Railway (`railway status --json`, `variable list`, `deployment list`, `volume list`)
- **Workspace / Projeto / Ambiente:** `Gabriel Brito's Projects` / `studyai` (`74d45fe2-2b95-4edf-8f2b-bf8ae1cdf8e4`) / `production` (`b3cc0ebb-c707-4778-9f3f-2842442c943d`)
- **Plano observado no deploy:** `trial` · **Região:** `sfo` (US West, 1 réplica)
- **Serviço `studyai-web`** (`aef87d8f-6e55-4919-8386-c2d4632a6a32`):
  - Origem conectada: GitHub `gabrielb1377/studyai`, branch `main` (commit `7e3d89b`).
  - Domínio: `https://studyai-web-production.up.railway.app` (sem domínio customizado).
  - Builder: `DOCKERFILE` (`/Dockerfile`), `healthcheckPath: "/api/health"`, `healthcheckTimeout: 120`, `restartPolicyType: "ON_FAILURE"`.
  - Últimos 2 deploys (`7630b233` e `bb20b5bd`, `2026-10-28`): **`FAILED`** (`activeDeployments: []`, logs expirados pela retenção do plano trial).
  - **Achados críticos nas variáveis remotas (35 variáveis presentes; valores omitidos):**
    1. `DATABASE_URL` aponta para **`postgres.railway.internal:5432/railway`** (serviço `Postgres` interno, atualmente offline/removido).
    2. **`\tAPI_KEYS_ENCRYPTION_KEY`** possui um caractere **TAB literal** no início do nome da variável no Railway — portanto `process.env.API_KEYS_ENCRYPTION_KEY` fica indefinida em runtime e `railway config plan` detecta essa chave corrompida como destrutiva (`1 to destroy`).
    3. **`DATABASE_SSL_REJECT_UNAUTHORIZED=false`** está ativo no serviço remoto (enfraquece verificação TLS).
    4. **Ausentes no Railway:** `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_HOPS`, `DATABASE_CA_CERT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM`, `FEEDBACK_EMAIL`, `MAINTENANCE_SECRET` e todas as 8 variáveis do Lote 3 (`AI_*` / `STORAGE_*`).
    5. **Object Storage S3 já provisionado no serviço:** `S3_ENDPOINT=https://t3.storageapi.dev`, `S3_BUCKET=studyai-files-rmuyq1tg4rg`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=false`, `S3_SERVER_SIDE_ENCRYPTION` presente.
- **Serviço `Postgres`** (`6e04b0e2-6cbe-4631-a0d1-68a2384ed97b`):
  - Imagem: `ghcr.io/railwayapp-templates/postgres-ssl:18` (PostgreSQL 18).
  - Deploy mais recente (`b71def9a`, `2026-10-02`): **`REMOVED`** (`activeDeployments: []` / Offline).
  - Volume: `postgres-volume` (`62fd8aca-206f-46fc-9a62-f2df04b583f8`), `/var/lib/postgresql/data`, `500 MB` alocados / `108,10 MB` ocupados (`state: READY`).
- **Bucket Railway Object Storage:** `studyai-files` (`b289d91f-a62b-41d7-8819-dd457291b49f`, Tigris-backed `t3.storageapi.dev`).

### 1.2 GitHub (`gabrielb1377/studyai`)
- Repositório público, branch default `main` (`7e3d89b`, `protected=false`).
- Branch de trabalho: `v1.1-development` (`protected=false`).
- PR #1 aberto em modo `draft` (`v1.1-development` → `main`).
- Branch experimental preservada localmente: `exp/s3-direct-upload` (`7b7be19`).

### 1.3 Supabase (`studyai-v1`)
- **Acesso nesta sessão:** `SUPABASE_ACCESS_TOKEN` não está configurado no ambiente local (`npx supabase projects list` retornou `AccessTokenRequiredError`) e não há servidor MCP do Supabase ativo em `.mcp.json`.
- **Reconciliação honesta:** o registro anterior validado indicava o projeto Supabase `studyai-v1` com 31 das 32 tabelas pré-Lote 3 (ausente `exam_attempts` e agora também ausentes as 3 tabelas do Lote 3). **Contagens agregadas de linhas, região exata, pooler ativo, plano/custo atual e backups reais do Supabase `studyai-v1` NÃO puderam ser reconsultados ao vivo nesta sessão** e permanecem como verificação obrigatória antes da troca de `DATABASE_URL`.

---

## 2. Decisão do Banco PostgreSQL Oficial (Comparativo e Recomendação)

| Critério | Railway Postgres (`postgres-ssl:18`) | Supabase (`studyai-v1`) |
|---|---|---|
| Disponibilidade atual | **Offline (`REMOVED`)** em plano `trial`; volume `postgres-volume` (`108,1 MB`) preservado | Não reconsultável ao vivo sem `SUPABASE_ACCESS_TOKEN` (candidato gerenciado do planejamento) |
| Versão PostgreSQL | PostgreSQL 18 (alinhado ao ensaio local 18.4) | Gerenciado (confirmar versão exata via dashboard/CLI autorizado) |
| Topologia / Latência | Mesma rede privada (`postgres.railway.internal`, região `sfo`) — menor latência com Railway web | Rede pública TLS entre Railway (`sfo`) e região do projeto Supabase — confirmar mesma região (`us-west`) |
| TLS | Certificado autoassinado na imagem `postgres-ssl:18` (por isso havia `DATABASE_SSL_REJECT_UNAUTHORIZED=false`; em rede privada interna ou com CA explícita deve ser revisado) | TLS gerenciado com CA oficial do Supabase (`DATABASE_CA_CERT` + `rejectUnauthorized=true`) |
| Pooler & Locks | Conexão direta PostgreSQL — 100% compatível com `FOR UPDATE`, transações e `pg_try_advisory_xact_lock` | Compatível com **conexão direta ou Supavisor Session Mode (porta 5432)**; **EVITAR Transaction Mode (6543)** caso use prepared statements ou sessão persistente (`pg_try_advisory_xact_lock` funciona em transação, mas `pool.query` e `db:migrate` exigem Session/Direct para consistência) |
| Backups & PITR | Volume snapshots manuais/agendados no Railway (dependem de plano pago Hobby/Pro) | Backups diários automáticos gerenciados (PITR em plano Pro) |
| Dados existentes | Volume `postgres-volume` ocupa `108,1 MB` (inclui overhead inicial do PG18; precisa inspeção antes de descartar) | Registro anterior apontava 31 tabelas; contagens exatas exigem consulta autorizada |

**Recomendação fundamentada:**
1. **Arquitetura recomendada (alinhada ao planejamento):** **Railway (`studyai-web`) + Supabase (`studyai-v1` como banco oficial)**, DESDE QUE confirmados pelo owner antes da troca de `DATABASE_URL`:
   - Região próxima a `sfo` (ou migração do serviço Railway para a mesma região do Supabase).
   - Conexão via **Session Pooler (IPv4 compatível, porta 5432)** ou Direct + `DATABASE_CA_CERT` oficial do Supabase com **`DATABASE_SSL=true` e `DATABASE_SSL_REJECT_UNAUTHORIZED=true`**.
   - Verificação prévia de existência de dados relevantes no `postgres-volume` do Railway (dump/contagem agregada antes de desativar ou remover).
2. **Alternativa de menor latência/custo consolidado:** manter **Railway Postgres 18** em plano pago com backups configurados e CA TLS válida, caso `studyai-v1` no Supabase esteja vazio ou em região distante.
3. **Ação pendente de autorização:** nenhuma alteração em `DATABASE_URL`, migração de dados ou exclusão de banco foi executada.

---

## 3. Plano de Migrations (`0001`–`0003`) e Ensaio Local

- **Ordem canônica de aplicação:**
  1. `migrations/0001_exam_attempts.sql` — cria `exam_attempts` + índice `(user_id, status)` + `ENABLE ROW LEVEL SECURITY`.
  2. `migrations/0002_lote2_atomicity_and_indexes.sql` — adiciona `family_id`, `replaced_by`, `rotated_at` em `refresh_tokens` (metadado instantâneo) + 5 índices por `user_id`.
  3. `migrations/0003_lote3_ai_budgets_and_storage_quotas.sql` — adiciona `usage_quotas.reserved_tokens BIGINT NOT NULL DEFAULT 0` (metadado instantâneo no PG 11+) + 3 tabelas novas (`ai_global_daily_budgets`, `ai_token_reservations`, `storage_reservations`).
  - Alternativamente, `npm run db:migrate` aplica `src/server/database/schema.sql` de forma transacional e idempotente (35 tabelas totais).
- **Cuidados para produção com tabelas já populadas:**
  - Fazer backup lógico (`pg_dump`) antes de aplicar.
  - Em tabelas grandes (`refresh_tokens`, `backups`, `shares`, `account_tokens`), executar os `CREATE INDEX` da `0002` fora de transação com `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.
  - **RLS e role da aplicação:** `exam_attempts` possui `ENABLE ROW LEVEL SECURITY` sem policies públicas (default-deny para roles `anon`/`authenticated` do PostgREST/Supabase). O role da conexão server-side (`DATABASE_URL`) deve ser dono da tabela ou possuir `BYPASSRLS` (padrão do role `postgres` no Supabase/Railway).
- **Resultado do ensaio local em PostgreSQL 18.4 (`tests/lote4-infrastructure-readiness.spec.ts` — `PG4-1`):**
  - Banco novo + `schema.sql` (2×): **35 tabelas exatas**, RLS ativo em `exam_attempts`, 100% idempotente.
  - Banco legado pré-0001 (31 tabelas) com dados semeados (`users`, `refresh_tokens`, `usage_quotas`) → `0001` → `0002` → `0003` (2×): **35 tabelas**, 100% dos registros preservados (`requests_count=12`, `tokens_count=4500`, `reserved_tokens=0`).
  - Rollback reverso (`0003.rollback` → `0002.rollback` → `0001.rollback`) → preserva integralmente dados base (`users`, `refresh_tokens`) e permite reaplicação limpa.

---

## 4. Railway IaC — Validação do Plano e Transição Antes de `2026-12-01`

- **Prazo confirmado oficialmente (documentação Railway):** Config as Code (`railway.toml` / `railway.json`) entra em **sunset em 2026-12-01** (arquivos legados deixam de ser lidos).
- **Solução para `railway config plan` no Windows (sem alterar `node_modules`):**
  - Causa raiz: `@railway/cli` instala o shim `railway.cmd` em `%APPDATA%\npm`, enquanto `node_modules/railway/dist/iac/index.js` executa `execFileSync("railway", ["--version"])` sem `shell: true`, exigindo `railway.exe` no `PATH`.
  - Procedimento reproduzível (somente leitura):
    ```powershell
    $env:PATH = "$env:APPDATA\npm\node_modules\@railway\cli\bin;$env:PATH"
    railway config plan --verbose
    ```
- **Resultado real do `railway config plan --verbose` (executado em 24/11/2026 contra `studyai` / `production`):**
  - `export const partial = "studyai-web"` limita o escopo ao serviço `studyai-web` (não toca `Postgres`, `postgres-volume` ou bucket `studyai-files`).
  - **`Plan: 0 to add, 0 to change, 1 to destroy`**
  - Único item no diff: **`- Delete variable studyai-web.\tAPI_KEYS_ENCRYPTION_KEY`** (a chave corrompida com TAB inicial!).
  - **0 bancos, 0 volumes, 0 buckets, 0 domínios e 0 segredos válidos seriam removidos.**
  - Todas as **42 variáveis V1.2** estão protegidas com `preserve()`.
- **Transição segura (somente após autorização do owner):**
  1. Corrigir manualmente no dashboard do Railway a variável `\tAPI_KEYS_ENCRYPTION_KEY` → `API_KEYS_ENCRYPTION_KEY` (com a mesma chave criptográfica válida).
  2. Reexecutar `railway config plan --verbose` e confirmar `0 to add, 0 to change, 0 to destroy`.
  3. Executar `railway config apply` autorizado.
  4. Somente após confirmar deploy bem-sucedido gerenciado por `.railway/railway.ts`, remover `railway.toml` e limpar o campo legado de Config File no serviço.

---

## 5. Proxy Confiável, TLS e Healthchecks

- **Proxy confiável no Railway:** o edge do Railway adiciona o IP real do cliente no final de `X-Forwarded-For` (1 hop confiável).
  - Configuração recomendada para staging/produção: `TRUST_PROXY_HEADERS=true` e `TRUSTED_PROXY_HOPS=1`.
  - Proteção anti-spoofing validada: `requestAddress()` lê o último hop confiável (à direita), descartando entradas forjadas à esquerda pelo cliente; sem `TRUST_PROXY_HEADERS=true`, ignora totalmente `X-Forwarded-For` e `/api/health` responde `503 degraded` em produção.
- **TLS PostgreSQL:**
  - `Postgres.ts`, `scripts/db-migrate.mjs` e `scripts/run-operational-cleanup.mjs` normalizam `\n` escapados em `DATABASE_CA_CERT` e aplicam `rejectUnauthorized: true` por padrão em produção.
  - Emissão de alerta explícito em produção se `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (atualmente ativo no Railway e **deve ser removido/alterado para `true`** com CA válida antes de homologação).
- **Liveness vs Readiness:**
  - `GET /api/health/live` (liveness, usado no `Dockerfile` `HEALTHCHECK`): retorna `200` sem tocar PG/S3.
  - `GET /api/health` (readiness, usado no deploy do Railway): valida `APP_URL` HTTPS, `TRUST_PROXY_HEADERS`, PostgreSQL disponível, **11 tabelas críticas incluindo as 3 do Lote 3** (`ai_global_daily_budgets`, `ai_token_reservations`, `storage_reservations`) e Object Storage S3; expõe `emailConfigured` como informativo.

---

## 6. Object Storage S3 e SMTP

- **S3 (`ObjectStorage.ts` + `CloudDatabase.ts` + `StorageQuota.ts`):**
  - Provedor atual no Railway: **Railway Object Storage (`https://t3.storageapi.dev`, bucket `studyai-files-rmuyq1tg4rg`, `S3_REGION=auto`, `S3_FORCE_PATH_STYLE=false`, `AES256`)**.
  - Isolamento por usuário no prefixo `users/<safeUserId>/materials/<safeFileId>/<safeHash>` com sanitização contra traversal, `CacheControl: private, max-age=31536000, immutable`, cotas acumuladas (1.024 MiB arquivos / 200 MiB backups) e compensação explícita PG/S3 em falhas parciais.
  - `exp/s3-direct-upload` (`7b7be19`) permanece fora da aplicação; upload direto não foi ativado.
- **SMTP (`EmailService.ts` + `/auth/verify`, `/auth/verify/resend`, `/auth/recover`, `/auth/reset`):**
  - Endurecimento aplicado: suporte a `SMTP_PASSWORD` / `SMTP_PASS` e `EMAIL_FROM` / `SMTP_FROM`, timeouts explícitos e **`requireTLS: true` em produção na porta 587** (impede downgrade silencioso para texto plano).
  - Novo endpoint `POST /auth/verify/resend` protegido por CSRF + sessão ativa + rate limit estrito (`5/15min` por IP e `3/15min` por usuário), emitindo token de uso único (24h) sem vazar o token em produção.
  - `/auth/recover` mantém resposta genérica anti-enumeração; tokens de verificação (24h) e recuperação (1h) são single-use e invalidam sessões no reset de senha.
  - Recomendações para staging/produção (ex.: Resend SMTP, Postmark ou Brevo): configurar `SMTP_HOST`, `SMTP_PORT=587` (`SMTP_SECURE=false` com STARTTLS) ou `465` (`SMTP_SECURE=true`), `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` em domínio próprio com **SPF, DKIM e DMARC (`p=quarantine` ou `p=reject`)**.

---

## 7. Limites Conservadores de IA Propostos para Homologação (Lote 5)

*(Valores sugeridos para homologação controlada; exigem aprovação explícita do owner — nenhuma chave paga foi ativada.)*

| Variável | Padrão de código | Sugestão Staging (Lote 5) | Observação |
|---|---:|---:|---|
| `AI_USER_MINUTE_REQUEST_LIMIT` | `20` | `10` | Evita rajadas acidentais em testes |
| `AI_USER_DAILY_REQUEST_LIMIT` | `500` | `100` | Suficiente para validação funcional por conta |
| `AI_USER_DAILY_TOKEN_LIMIT` | `150000` | `50000` | Teto conservador por usuário/dia na IA compartilhada |
| `AI_GLOBAL_DAILY_TOKEN_BUDGET` | `2000000` | `250000` | Teto global diário para homologação fechada |
| `AI_RESERVATION_TTL_MS` | `300000` (5 min) | `300000` | Reservas expiradas recuperadas automaticamente; reconciliação tardia ainda contabiliza consumo real |
| `STORAGE_FILES_QUOTA_BYTES` | `1073741824` (1.024 MiB) | `1073741824` | Convenção MiB binário |
| `STORAGE_BACKUPS_QUOTA_BYTES` | `209715200` (200 MiB) | `209715200` | Convenção MiB binário |
| `STORAGE_RESERVATION_TTL_MS` | `300000` (5 min) | `300000` | Liberação automática de reservas de upload órfãs |

---

## 8. Plano Operacional de Manutenção (`OperationalCleanup`)

- **Mecanismo preferencial:** job agendado executando `npm run db:cleanup` (`scripts/run-operational-cleanup.mjs`, disponível dentro da imagem Docker runner) a cada **6 horas** (ou diário fora do pico). Alternativa HTTP: `POST /api/internal/maintenance/cleanup` com header `x-maintenance-secret`.
- **Segurança e concorrência:** `pg_try_advisory_xact_lock` impede execuções sobrepostas entre réplicas; lotes limitados (`CLEANUP_BATCH_LIMIT=10000`, teto `50000`); piso rígido de **2h** para `rate_limits` (preserva janelas ativas de 1m/15m/1h); preserva integralmente `usage_quotas` diário (`minute_bucket = 0`), histórico recente de reservas (30d IA / 7d storage) e sessões ativas.

---

## 9. Arquitetura de Staging (Lote 5), Matriz de 42 Variáveis e Custos

- **Isolamento obrigatório para Staging (Lote 5):**
  - Ambiente separado no Railway (`staging`, conectado à branch `v1.1-development`, domínio próprio `studyai-staging...up.railway.app`).
  - Banco PostgreSQL dedicado de staging (projeto/branch Supabase separado ou serviço Postgres staging — **nunca** o banco de produção).
  - Bucket S3 dedicado de staging (`studyai-files-staging` — **nunca** `studyai-files-rmuyq1tg4rg`).
  - Segredos exclusivos (`AUTH_SECRET`, `API_KEYS_ENCRYPTION_KEY`, `HEALTH_SECRET`, `MAINTENANCE_SECRET`), cookies isolados por origem HTTPS e sandbox SMTP (ex.: Mailtrap/Mailpit ou destinatário controlado).
- **Matriz completa de 42 variáveis (preservadas em `.railway/railway.ts`, sem valores):**
  - *Aplicação/Proxy (6):* `NODE_ENV`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `STUDYAI_DOMAIN`, `CAPACITOR_SERVER_URL`, `NEXT_TELEMETRY_DISABLED`, `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_HOPS`.
  - *Segurança/Auth (4):* `AUTH_SECRET`, `API_KEYS_ENCRYPTION_KEY`, `HEALTH_SECRET`, `MAINTENANCE_SECRET`.
  - *PostgreSQL (5):* `DATABASE_URL`, `DATABASE_POOL_SIZE`, `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_CA_CERT`.
  - *S3 (7):* `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_SERVER_SIDE_ENCRYPTION`.
  - *SMTP (7):* `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `EMAIL_FROM`, `FEEDBACK_EMAIL`.
  - *IA & Quotas (8):* `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `AI_USER_MINUTE_REQUEST_LIMIT`, `AI_USER_DAILY_REQUEST_LIMIT`, `AI_USER_DAILY_TOKEN_LIMIT`, `AI_GLOBAL_DAILY_TOKEN_BUDGET`, `AI_RESERVATION_TTL_MS`.
  - *Armazenamento (3):* `STORAGE_FILES_QUOTA_BYTES`, `STORAGE_BACKUPS_QUOTA_BYTES`, `STORAGE_RESERVATION_TTL_MS`.
- **Custos conhecidos vs desconhecidos:**
  - *Railway:* conta atual está em plano `trial` (exige upgrade para Hobby US\$ 5/mês + uso sob demanda para manter `studyai-web` e eventual staging continuamente ativos; valor exato mensal depende de vCPU/RAM/egress reais — **desconhecido até medição em staging**).
  - *Supabase:* Free tier cobre staging leve (pausa após inatividade); produção contínua recomenda Pro (US\$ 25/mês base) — **plano atual do `studyai-v1` não verificável sem token**.
  - *S3 / SMTP / IA compartilhada:* dependem de volume real; estimativa final condicionada à escolha de provedor SMTP e tetos de IA aprovados pelo owner.

---

## 10. Segurança de Dependências (`npm audit --omit=dev`)

- **Corrigido nesta etapa:** atualização compatível `next@15.5.28` → **`next@15.5.29`** eliminando a vulnerabilidade `moderate` (3 advisories: `GHSA-7qx7-33qx-rqx2`, `GHSA-f3mh-rxg3-f5g2`, `GHSA-pc58-hwjq-p385`).
- **Residual aceito e classificado (4 `low`):** `katex` transitivo via `rehype-katex` / `remark-math` (`GHSA-238p-pmpm-9mq7` — exige prototype pollution pré-existente para contornar restrições de `trust`; única correção automática sugerida pelo npm faz downgrade breaking para `rehype-katex@1.2.0`). **Exposição:** baixa (StudyAI usa KaTeX sem `trust: true` e sanitiza Markdown). **Mitigação:** não executar `npm audit fix --force`; acompanhar release upstream compatível de `rehype-katex` / `katex`.
- **`SA-01`..`SA-06`:** permanecem explicitamente como **`Sem definição recuperável`** (não inventados).

---

## 11. Ações que Exigem Autorização Explícita do Owner (Pré-requisitos do Lote 5)

1. Confirmar banco oficial (**Supabase `studyai-v1` vs Railway `Postgres`**) e autorizar inspeção/dump do `postgres-volume` (`108,1 MB`) e do `studyai-v1`.
2. Autorizar plano pago do Railway (saída do `trial`), criação do ambiente isolado de `staging` (DB + bucket S3 + segredos próprios) e aplicação do `railway config apply` após corrigir `\tAPI_KEYS_ENCRYPTION_KEY`.
3. Definir e aprovar provedor SMTP + domínio remetente (`EMAIL_FROM`, SPF/DKIM/DMARC).
4. Aprovar valores finais de `AI_GLOBAL_DAILY_TOKEN_BUDGET` e `AI_USER_DAILY_TOKEN_LIMIT` para homologação.
5. Autorizar aplicação remota das migrations `0001`–`0003` em staging (e futuramente em produção com backup prévio) e configuração de `TRUST_PROXY_HEADERS=true`, `TRUSTED_PROXY_HOPS=1`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true` + `DATABASE_CA_CERT`.
