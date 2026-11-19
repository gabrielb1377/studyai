# Sprint 37E.8B — Railway Configuration & Launch Authorization Gate

**Data:** 2026-10-27 · **Base:** `03a61ee4e83d575f71a30485b45eff0e0c6e065b`
**Branch:** `v1.1-development` · **Escopo:** análise local + verificação remota somente leitura
**Resultado:** **CONDITIONAL**. Sem push, deploy, alteração Railway, acesso DB remoto, alteração de secrets ou manipulação de dados reais.

## Git e baseline

- Diretório `D:\studyai`; branch `v1.1-development`; HEAD inicial exato `03a61ee…`.
- Histórico contém os commits `03a61ee` (handoff 37E.8A), `4e94f1b` (37E.8A),
  `d0c2d63` (37E.7C). Working tree inicial limpo.
- Nenhum `AGENTS.md` encontrado na raiz `D:\`, projeto, `docs/` ou Obsidian do
  StudyAI. Handoff, contexto, relatório 37E.8A e runbooks pedidos revisados.

## Arquivos de infraestrutura: escopo e efeito

`railway.ts`/`railway.toml` não são intercambiáveis. Os links e limites oficiais
consultados e a matriz detalhada estão em
`docs/RAILWAY_CONFIGURATION_DECISION.md`. Sem config path/service state remoto,
não é possível determinar qual deles foi/seria selecionado pelo Railway.

| Artefato | Executado por / momento | Efeito local declarado | Status efetivo remoto |
|---|---|---|---|
| `.railway/railway.ts` | Railway CLI (`config plan/apply/pull`) somente quando chamado; não há chamada nos workflows | IaC de projeto; source GitHub `main`, service `studyai-web`, health `/api/health`, subset env `preserve()` | Não verificado; CLI Unauthorized; nenhum plan/apply |
| `railway.toml` | Railway deploy em service existente configurado para ler CaC; não é script local | Dockerfile builder, `/api/health/live`, timeout 120s, restart `ON_FAILURE` max 5 retries | Não verificado; caminho/uso remoto desconhecido |
| Dockerfile | Docker build/runtime | Node 22 multi-stage; build `npm ci` + `npm run build`; start CMD migra schema e roda `node server.js`; OCI health liveness; port default 3000 | Conteúdo da imagem definido; imagem/deploy ativo desconhecidos |
| `package.json` / Next config | npm/Next build/runtime | Next 15.5.28 standalone; `npm run start` = `next start`, mas Docker não usa esse script | Artifact remoto não verificado |
| `.github/workflows/ci.yml` | GitHub Actions em PR e push main/develop | quality tests; Node 22; não faz Railway IaC/deploy | Execução e secrets GitHub atuais não verificados |
| `.github/workflows/deploy.yml` | GitHub Actions em push main e workflow_dispatch; GitHub environment `production` | Constrói/pusha GHCR sha/latest; POST a `DEPLOY_WEBHOOK_URL` se secret preenchido | Secret/destino/deployment não verificados; webhook não presumido Railway |
| `scripts/db-migrate.mjs` | Docker `CMD` em cada boot; script npm manual | DDL transacional e idempotente a partir do schema SQL | Não executado remotamente |

### Precedência encontrada em documentação oficial (27/10/2026)

- Config-as-Code é deprecated; serviços existentes ainda o leem até 2026-12-01.
  Quando usado, código substitui settings de build/deploy equivalentes do
  Dashboard. Serviços novos não podem escolher CaC.
- `.railway/railway.ts` é IaC, avaliado pelo CLI e aplicado mediante comando/
  aprovação; Railway diz que não lê `.railway/` no deploy.
- Um service não pode ser gerido simultaneamente por CaC e IaC; config plan
  reporta conflito se CaC continuar configurado.
- Recomendação é migrar para IaC após owner autorizar read-only, descobrir modo
  ativo, importar config e revisar plano completo. Não gerar/aplicar plano sem
  sessão e alvo confirmados. Não mudar os arquivos agora.

## Conclusão de configuração (sem mudança nos arquivos de infra)

1. `.railway/railway.ts` é authoring spec de Railway IaC; só é avaliado pelo
   Railway CLI em `config plan/apply/pull`. Docs oficiais dizem expressamente que
   Railway **não lê `.railway/` durante deploy**. O repo não tem workflow chamando
   esses comandos. Não é correto tratá-lo como config ativa automaticamente.
2. `railway.toml` é Config-as-Code legado de escopo service. Para serviço
   existente configurado para lê-lo, configurações de build/deploy em código
   sobrepõem Dashboard. Serviço novo não pode optar por esse mecanismo; sunset
   documentado para **2026-12-01**. Config path/settings remotos não foram
   verificados.
3. Railway docs dizem que o mesmo service não pode ser gerenciado pelos dois
   modelos; `config plan` bloqueia CaC ainda ativo. Logo, presença dos dois no
   Git não prova que ambos estão ativos nem qual deles rege o deployment atual.
4. O repo prova o fluxo local/CI: workflow `Quality` testa PR e push para
   `main`/`develop`; workflow `Container Delivery`, em push/manual de `main`,
   constrói `Dockerfile`, publica tags GHCR (`sha`/`latest`) e chama um webhook
   **condicional** ao secret de GitHub `DEPLOY_WEBHOOK_URL`. Não foi possível
   verificar se o secret/destino existe nem se aponta ao Railway.
5. **Fonte conhecida:** `Dockerfile` define conteúdo da imagem, `npm run build`
   no builder e `CMD node scripts/db-migrate.mjs && node server.js`. **Fonte
   remota desconhecida:** projeto/environment/service ativos, trigger, config
   path, variáveis, domain, DB, S3, resources e restart.
6. **Recomendação pendente do owner:** migrar para IaC antes do sunset somente
   após leitura autorizada, import/plan e revisão explícita de mudanças. Até essa
   confirmação, manter imutáveis ambos os arquivos e não rodar `config apply`.
   Se o owner confirmar service legacy usando `railway.toml`, tratá-lo como
   controle temporário e não aplicar `.railway/railway.ts` ao mesmo service.

Ver matriz/justificativa e links oficiais em
`docs/RAILWAY_CONFIGURATION_DECISION.md`.

## Railway read-only

- CLI local instalado, versão `5.63.1`.
- `railway whoami` retornou `Unauthorized`/grant inválido. Não se solicitou senha,
  token, novo login; não se criou token nem sessão.
- Não há evidência de integração remota previamente autorizada disponível a esta
  sessão. Não executados `config plan`, `link`, `variables`, `status`, logs,
  deploy ou qualquer comando remoto.
- Projeto, environment, service, deployment SHA/image, source, config path,
  builder, healthcheck ativo, domínio, Postgres, S3, env var names/presence,
  resources, restart, logs e alertas: **NÃO VERIFICADOS**.

Matriz Local vs Remoto para Next, Node, Docker, port, Postgres, S3, secrets,
migrations, streaming, storage, logs e alerts consta no relatório acima e na
decisão de configuração; toda coluna remota continua **NÃO VERIFICADO**.

## Matriz local vs remoto

| Item | Configuração local | Configuração remota | Evidência | Compatibilidade / ação |
|---|---|---|---|---|
| Next.js | `next@^15.5.28`; standalone | NÃO VERIFICADO | package.json/next.config; deployment não consultado | Confirmar imagem/runtime ativo |
| Node | Docker `node:22-alpine`; CI Node 22 | NÃO VERIFICADO | Dockerfile/workflows | Igualdade local entre builder e runner; plataforma desconhecida |
| Docker/build | Docker multi-stage; `npm ci`; `npm run build` | NÃO VERIFICADO | Dockerfile; Railway config path desconhecido | Verificar builder Dockerfile e contexto/root directory |
| Start | `node scripts/db-migrate.mjs && node server.js` | NÃO VERIFICADO | Docker CMD | Reconhecer DDL no startup e provar comportamento no rollout autorizado |
| HTTP port | `HOSTNAME=0.0.0.0`, `PORT=3000` no Docker; Next server usa env | NÃO VERIFICADO | Dockerfile | Railway injeta `PORT`; confirmar target port/override real |
| Healthcheck | `/api/health/live` em Docker HEALTHCHECK e `railway.toml`; `.railway/railway.ts` divergente usa `/api/health` | NÃO VERIFICADO | arquivos versionados | Selecionar live para deployment health; readiness separada |
| Restart | `ON_FAILURE`, retry max 5 no `railway.toml` | NÃO VERIFICADO | arquivo local | Política efetiva deve ser conferida |
| PostgreSQL | `DATABASE_URL`, `pg` pool default 10, SSL em prod; migrations no boot | NÃO VERIFICADO | código/schema | Sem acesso ou dump remoto; janela + autorização DBA |
| S3 | Bucket/keys/endpoint via env; put/get/delete/HeadBucket | NÃO VERIFICADO | `ObjectStorage.ts` | Bucket, permission, retention, versioning/restore/custo desconhecidos |
| Secrets | Nomes e requisitos em config/templates; `.env.local` providers vazios | NÃO VERIFICADO | inspeção sem imprimir values | Verificar presence/health remotamente sem ler valores |
| Migrações | schema idempotente, sem migration ledger/down; `db-migrate` cada boot e initialize schema por processo | NÃO VERIFICADO | schema/migrator | Backup/restore e DDL aprovação separada |
| Streaming | Tutor NDJSON, `no-cache, no-transform` | NÃO VERIFICADO | route.ts | Validar proxy/response buffering e timeout autorizado |
| Logging | Telemetry local/memória e logs do app | NÃO VERIFICADO | código | Redaction, retenção e plataforma remota pendentes |
| Alertas | Não há prova de provider externo ativo | NÃO VERIFICADO | monitoring docs são proposta | Nomear owner/canal e testar alert sintético antes de tráfego |

## Segurança, BYOK e env vars

- `Crypto.ts` liga `crypto-core.ts` a `AUTH_SECRET` e
  `API_KEYS_ENCRYPTION_KEY`. Código suporta decrypt `enc:v1:` e `enc:v2:`;
  ausência de chave dedicada grava v1. Com chave dedicada, nova gravação é v2.
  AES-256-GCM e compatibilidade cobertos pelos testes já reportados.
- `AUTH_SECRET` deve permanecer estável e ≥32 chars; afeta autenticação e derivação
  v1. Não alterar nem imprimir.
- Perda/rotação de `API_KEYS_ENCRYPTION_KEY` pode tornar dados v2 ilegíveis.
  Artefacto v1-only não faz decrypt v2; rekey v2→v1 requer backup/autorização;
  não executar script nesta sprint.
- Names principais a confirmar remotamente sem valores: `AUTH_SECRET`,
  `API_KEYS_ENCRYPTION_KEY`, `DATABASE_URL`, `DATABASE_SSL`,
  `DATABASE_SSL_REJECT_UNAUTHORIZED`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_REGION`, `APP_URL`,
  `HEALTH_SECRET`, provider(s), SMTP se usado. A presença dessas vars em
  `.railway/railway.ts`/templates não prova existência na plataforma.
- A spec IaC lista um subset via `preserve()`; omite chave de cifra BYOK,
  providers e SMTP. Não se assumiu se o apply preservaria/deletaria variáveis
  omitidas: revisar `plan` completo e ações destrutivas antes de qualquer apply.

## PostgreSQL, backup, storage e reversibilidade

- Sem conexão, `pg_dump`, download, consulta ou migração remota.
- Schema local contém `user_api_keys` PK `(user_id, provider)` e FK cascade;
  `usage_quotas` PK `(user_id,date,minute_bucket)`, FK cascade e índices de
  user/date/minute; `rate_limits` PK `(key,window_bucket)` e índice bucket.
- Em 37E.8A foi restaurado dump PostgreSQL 18.4 em DB isolado, com canaries
  sintéticos; migration duas vezes e índices/constraints conferidos. Evidência
  local, não um backup de produção.
- Restore de DB em produção pode perder escritas pós-snapshot; schema não dispõe
  de `down`. Requer backup, restore isolado, avaliação de RPO/RTO, DBA e aprovação
  para qualquer DDL/restore. Procedimento seguro em `docs/ROLLBACK_V1_1.md`.
- App S3 não implementa backup; versioning/retention/ACL/compatibilidade endpoint
  e restore remoto pendentes. Definir backup imutável independente e canary
  sintético/hash restore; cópia de objetos reais requer escopo/autorização.

## Health e rollback

- Liveness `/api/health/live` retorna 200 sem DB/S3; readiness `/api/health`
  consulta DB/schema e `HeadBucket`, exige URL HTTPS em produção e retorna 503
  quando dependência falta. Resposta pública reduz detalhes; body detalhado exige
  `HEALTH_SECRET` correto.
- Railway healthcheck é gate de startup/deployment e não é monitor contínuo após
  ativação. Portanto, health fail pós-release não implica restart automático;
  alertas/uptime monitor precisam ser separados. Restart `ON_FAILURE` refere-se
  a falha de processo. Config remota dessas políticas não verificada.
- Docker OCI HEALTHCHECK e HTTP healthcheck Railway são mecanismos distintos.
- Failures em DB/S3 simulados localmente; live 200/readiness 503 foi validado em
  37E.8A. Restart de plataforma, rede e buffer/timeout de streaming não testados.
- Rollback de código não desfaz schema, DB nem S3; restaurar DB pode perder novos
  writes. Proteger chaves BYOK; validar compatibilidade do artifact antes de
  rollback. Sem estimativa de minutos.

## Checks nesta sprint

- Lint: PASS, 0 erros / 75 warnings. Typecheck: PASS. Build: PASS (executado duas vezes; Next 15.5.28, 45 páginas estáticas).
- `npm audit --omit=dev`: 4 low transitivos ligados a KaTeX/micromark math; nenhum high/critical. O comando terminou exit 1 por findings low; `npm audit fix --force` não foi executado (upgrade indicado é breaking).
- Playwright direcionado: 36/36 (crypto BYOK 16, health 2, quota policy 10, product/config/deploy docs e UI 8); suíte quota concurrency selecionada: 2/2. **Total: 38/38.** E2E completo não repetido.
- Migração: `npm run db:migrate` executado duas vezes só no DB local de teste `studyai_37e8a_data_restore`; preservou 1 canary em cada users, user_api_keys, usage_quotas e rate_limits.
- Standalone pós-build em `NODE_ENV=production`, loopback porta 3001, DB/S3 intencionalmente indisponíveis: liveness 200, readiness 503, ambos `available=false`, sem URL/config/segredo no body. Restart policy da plataforma não pode ser simulada sem deployment remoto; não testada.
- Histórico aprovado reaproveitado: E2E 218/218 (212 diretos, 6 retries);
  SQL concurrency 7/7; app 8/8; testes dirigidos 30/30; DB backup/restore
  sintético; health standalone; o 38/38 atual inclui cobertura direcionada
  equivalente. Não repetido E2E completo.
- Mudanças da sprint limitadas a documentação/handoff/Obsidian; nenhum código ou
  config de runtime/Railway alterado.
- Sem secret output, acesso remoto, projeto externo, nem alterações em `main`.

## Gate

**CONDITIONAL.** Remoto não verificável por sessão Unauthorized; configurações
efetivas, source trigger e presence dos secrets desconhecidos. Nenhuma mudança de
infra foi recomendada/aplicada automaticamente. Consulte
`docs/LAUNCH_AUTHORIZATION_CHECKLIST.md`; autorização para leitura, escrita de
secret, backup, DDL, deploy e rollback são aprovações distintas.
