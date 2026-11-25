# Sprint 37E.8A — Railway Pre-Deployment & Operational Verification

**Data:** 2026-10-27 · **Branch:** `v1.1-development`  
**Base:** `d0c2d634b84a874ccd262fc41307cec1f87a7138`  
**Produção/Railway:** não alterados; sem deploy, push ou migração remota.

## Resultado

**Release Gate: CONDITIONAL.** Pré-deploy localmente documentado e alguns
procedimentos testados em PostgreSQL descartável; detalhes remotos, secrets e
resiliência de Object Storage permanecem pendentes. Não há autorização de
publicação neste relatório.

## Evidência e classificação

| Área | Resultado |
|---|---|
| Baseline Git | Branch e checkpoint confirmados; working tree inicial limpo; sem `AGENTS.md` encontrado na raiz/pasta docs; `PROJECT_CONTEXT.md` e documentos exigidos revisados |
| Railway remoto | **NÃO VERIFICADO**. `railway whoami` retornou Unauthorized/grant inválido; não foi feita autenticação nem chamada de deploy |
| Configuração local | Dockerfile + railway.toml lidos; conflito com `.railway/railway.ts` (branch main e `/api/health` vs liveness), registrado sem modificar IaC |
| Variáveis | Templates e presença/ausência local verificadas sem imprimir valores; secrets Railway **não verificados** |
| Migração PostgreSQL | SQL canônico aplicado duas vezes em cópia restaurada isolada; tabelas, PK/FK e índices críticos conferidos |
| Backup/restore DB local | PostgreSQL 18.4, custom dump, `pg_restore --list`, checksum e restore em outro DB; canaries sintéticos de user/BYOK placeholder/quota/rate-limit restaurados (1 linha cada) |
| Backup/restore produção | **PENDENTE**, sem acesso/autorização e sem dados reais usados |
| S3/Object Storage | Implementação local conferida; bucket, versionamento, retenção, restore e custo remotos **não verificados** |
| BYOK | AES-256-GCM confirmado em crypto-core; 16 testes direcionados passaram. Chave v2 ausente/rotacionada torna ciphertext v2 ilegível; rollback para alvo v1-only é incompatível sem re-encriptação |
| Health local | Standalone production mode: liveness 200; DB/S3 deliberadamente indisponíveis → readiness 503; resposta pública sem URL/segredos/detalhes de erro |
| Testes direcionados | 30/30 Playwright: crypto, health, política de quota e testes quota concurrency selecionados; harness app adicional 8/8 |
| Smoke tests | 21 checks revisados; execução só após deploy autorizado. Itens/rotas antigas precisam correção/registro de evidência no documento atualizado |
| Monitoramento | Health e logs da aplicação existem localmente; alertas externos e Railway metrics **não verificados/configurados** |

## Validação não extensa

- `pg_dump`/`pg_restore` 18.4 em ambiente descartável; backup fora do repo em
  `%LOCALAPPDATA%\Temp\opencode\studyai-37e8a-backup-validation`.
- Destinos DB de validação: `studyai_37e8a_restore_validation`,
  `studyai_37e8a_app_test` e `studyai_37e8a_data_restore` no cluster isolado
  `127.0.0.1:55433`; criados para teste e não produção.
- `db:migrate` passou duas vezes na cópia restaurada.
- `scripts/verify-app-concurrency.mjs`: 8/8 contra cópia de teste restaurada.
- `tests/crypto-migration.spec.ts`, `health.spec.ts`, `quota-policy.spec.ts`:
  28/28; seleção quota em `concurrency.spec.ts`: 2/2.
- A suíte E2E integral não foi repetida. Lint/typecheck/build/audit não foram
  repetidos por serem docs/configuração operacional apenas; ver evidências 37E.7C.
- Teste real local dos endpoints de health descrito acima; nenhum endpoint
  público/produção foi chamado.

## Pendências que impedem READY

1. Acesso de leitura Railway autenticado pelo responsável; confirmar projeto,
   serviço, ambiente, deployment/hash, domínio, banco, S3, rede, volumes,
   recursos e logs sem expor valores de secret.
2. Resolver divergência local da IaC: branch `main` vs branch release aprovada;
   readiness vs liveness; revisar se IaC preserva todos os secrets necessários.
3. Confirmar presença e persistência de secrets no ambiente correto. Não gerar
   nem alterar `AUTH_SECRET`/`API_KEYS_ENCRYPTION_KEY` nesta sprint.
4. Confirmar estado do schema remoto somente leitura; backup/restore real antes
   de qualquer DDL e aceite do comportamento de migração no container start.
5. Definir backup/restore S3 e confirmar versioning/retention/custo no provedor.
6. Configurar/validar monitoramento aprovado e responsável de plantão antes do
   tráfego; alertas externos não existem como evidência atual.
7. Após publicar, executar os 21 smoke checks com ficha de evidência e decidir
   manter/rollback. Esta etapa é pós-publicação e requer janela autorizada.

Referências: `docs/RAILWAY_PRE_DEPLOY_V1_1.md`,
`docs/PRODUCTION_MIGRATION_PLAN_V1_1.md`, `docs/DEPLOY_V1_1_RUNBOOK.md`,
`docs/ROLLBACK_V1_1.md`, `docs/SMOKE_TEST_V1_1.md`.
