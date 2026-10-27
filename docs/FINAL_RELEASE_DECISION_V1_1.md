# Decisão Final de Release — StudyAI V1.1 Beta

**Data:** 2026-10-26
**Sprint:** 37E.7C — Real Concurrency, E2E Stability & Technical Gate
**Branch:** `v1.1-development`
**Checkpoint verificado:** `58d3fab` (37E.7B) + alterações 37E.7C (commit pendente)
**Responsável pela verificação:** agente de engenharia (sem autoridade de deploy)

---

## Decisão

> ## ⚠️ CONDITIONAL — NÃO É UM "GO" AUTOMÁTICO
>
> A V1.1 está tecnicamente consistente e pode ser **submetida para
> autorização** de deploy. O deploy **não está autorizado por este documento**.
> A execução depende das condições obrigatórias abaixo.

---

## 1. O que foi verificado e passou

| Área | Evidência |
|------|-----------|
| Código | `typecheck` limpo; `lint` 0 erros (75 warnings); `build` OK; `git diff --check` limpo |
| Testes E2E | Baseline 37E.7B: 205 descobertos, 193 diretos + 8 retry, 1 falha ambiental, 3 skipped. 37E.7C: **218/218 casos únicos aprovados** (212 diretos + 6 retry), 0 falhas residuais, 0 skipped; uma asserção obsoleta foi corrigida e aprovada direcionadamente |
| Migrações | `schema.sql` limpo e idempotente em PostgreSQL 18 isolado |
| Constraints | PKs, índices e FKs `ON DELETE CASCADE` confirmados |
| Quota | contagem duplicada corrigida (3 vs 6); UPSERT diário/minuto validado |
| Rate limit | UPSERT atômico validado; login/cadastro/recuperação/API keys **fail-closed** (503 + `Retry-After: 30`) em produção, confirmado no standalone com `DATABASE_URL` inválida e ausente; PK/falhas de FK rejeitadas |
| Criptografia | 16 testes na implementação real v1/v2, incluindo adulteração e rollback |
| Segurança de quota | falha de banco em produção propaga erro (fail-closed) |
| Dependências | `npm audit --omit=dev`: 4 advisories **low** transitivos (`katex`); sem high/critical. Fix automático requer breaking change e não foi aplicado |
| Concorrência SQL | PostgreSQL 18.4 isolado, múltiplas conexões; **7/7 PASS**, incluindo disputa restante=1 e rate limit compartilhado entre pools |
| Concorrência da aplicação | Standalone, duas instâncias, PostgreSQL real; **8/8 PASS** (cenários 5–7, E/F e F2) |
| Health | `/api/health/live` independente de DB/S3; `/api/health` continua readiness detalhada; Docker/Railway apontam liveness |
| Bug de request body | Corrigido consumo duplo do body em Tutor/Academy/middleware; evidenciado por rota real no standalone |
| Documentação | hashes, endpoint de sessão, migração automática e rollback corrigidos |

---

## 2. Condições Obrigatórias Antes do Deploy

Estas condições **não** foram executadas nesta sprint (sem acesso/autorização).

1. **Autorização humana explícita** para deploy no Railway.
   Este documento não substitui a aprovação do responsável pelo produto.
2. **Backup verificado** do PostgreSQL de produção, com teste de restore.
   Sem backup, não executar migração.
3. **Variáveis de ambiente completas** no Railway, incluindo:
   - `AUTH_SECRET` (≥ 32 chars) e `HEALTH_SECRET`;
   - `API_KEYS_ENCRYPTION_KEY` (se BYOK v2 for habilitado);
   - `DATABASE_URL` e SSL;
   - **S3 completo** (`S3_ENDPOINT`, `S3_BUCKET`, credenciais) — sem storage,
     `/api/health` responde 503 e o container é considerado não saudável;
   - pelo menos um provider de IA.
4. **Smoke test pós-deploy** em até 15 min (`docs/SMOKE_TEST_V1_1.md`),
   começando por health, cadastro, login, BYOK e quota.
5. **Plano de rollback criptográfico:** se houver `enc:v2:` e a versão de
   destino não ler v2, executar `scripts/rekey-byok-v2-to-v1.mjs --apply`
   **antes** de remover a chave. Nunca remover `API_KEYS_ENCRYPTION_KEY`
   diretamente.
6. **Aceite formal dos riscos residuais** da §4 por quem autorizar o deploy.

---

## 3. O que impede um "READY FOR AUTHORIZATION" pleno

| # | Gap | Impacto | Pode ir para produção? |
|---|-----|---------|------------------------|
| 1 | Rate limit fail-open **apenas** em endpoints não críticos | Limite pode ser contornado entre réplicas em sync/colaboração/telemetria/feedback; auth e API keys são fail-closed | Sim, risco baixo |
| 2 | Quota conservadora com BYOK parcial | Em modo automático pode consumir quota compartilhada antes de saber se fallback será usado | Sim (UX), corrigir depois |
| 3 | Monitoramento não implantado | Sem alertas automáticos; dependência de logs/SQL | Sim, com operação manual |
| 4 | Deploy/Railway/backup não testados | Falhas operacionais só aparecem no deploy | **Requer as condições da §2** |
| 5 | Execução E2E final | 218/218 casos únicos aprovados; 6 retries, 0 falhas residuais, 0 skipped | Gate local atendido; gates operacionais ainda pendentes |

---

## 4. Riscos Residuais Aceitos (com ressalvas)

- **Quota conservadora:** autorizada uma vez por requisição; não conhece a
  credencial efetiva. Em modo automático com BYOK parcial pode cobrar quota
  compartilhada indevidamente.
- **Rate limit fail-open restrito:** login, cadastro, recuperação e API keys
  falham fechados (503) quando o banco está indisponível em produção. Sync,
  colaboração, telemetria e feedback ainda usam contador em memória por
  instância; não há bypass de autenticação nesses fluxos.
- **Dashboard "BYOK Ativo":** reflete a existência de qualquer chave, não
  necessariamente o bypass da quota.
- **Fuso:** a chave de data é UTC e o reset exibido é local.
- **`katex` 4 low:** sem correção não-disruptiva.
- **Readiness dependente de S3:** storage é pré-requisito para tráfego; Railway/Docker usam liveness sem dependências para evitar reinício por falha transitória.

---

## 5. Critérios para Promover a "READY FOR AUTHORIZATION"

1. Concorrência real SQL e cenários 5–7: **concluído nesta sprint**, evidência em `docs/CONCURRENCY_VALIDATION_V1_1.md`.
2. Configurar ao menos um alerta externo (readiness/5xx) antes do tráfego real.
3. Suíte E2E reconciliada nesta sprint; 218 casos únicos aprovados, com retries reportados separadamente em `docs/E2E_STABILITY_V1_1.md`.
4. Manter autorização humana, backup/restore e smoke test pós-deploy como gates operacionais.

**Estado atual:** concorrência real, healthchecks e suíte E2E reconciliada foram verificados nesta sprint. A decisão permanece **CONDITIONAL** até backup/restore e verificações pós-deploy operacionais; nenhum deploy foi executado ou autorizado.

---

## 6. Assinaturas

| Papel | Nome | Decisão | Data |
|-------|------|---------|------|
| Engenharia / verificação | agente 37E.7B | **CONDITIONAL** | 2026-10-25 |
| Autorização de deploy | _pendente_ | — | — |
| Produto | _pendente_ | — | — |

---

**Referências:** `docs/SPRINT_37E_7B_REPORT.md`,
`docs/ROLLBACK_V1_1.md`, `docs/SMOKE_TEST_V1_1.md`,
`docs/DEPLOY_V1_1_CHECKLIST.md`.
