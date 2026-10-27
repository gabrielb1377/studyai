# Handoff Atual — Sprint 37E.7C: Real Concurrency & E2E Stability

Atualizado em 26 de outubro de 2026.

## Estado

- **Branch:** `v1.1-development` (nada enviado/pushed)
- **HEAD de partida:** `58d3fab` (Sprint 37E.7B)
- **Commit desta sprint:** criado localmente com a mensagem definida; sem push
- **Deploy:** **NÃO executado**. Railway intocado.
- **Decisão:** **CONDITIONAL** — ver `docs/FINAL_RELEASE_DECISION_V1_1.md`

> Correção: os hashes `f3a2b1c` (37E.7A) e `c1a2b3d` (37E.6) citados em
> documentos anteriores **não existem**. Os reais são `1e56d76` e `5dc68d0`.

---

## Entregas da 37E.7B (baseline)

| Área | Entrega |
|------|---------|
| Reconciliação E2E | 205: 193 diretos + 8 retry, 1 falha ambiental; 3 skipped. Reexecução final: 21 passed/3 skipped; 215 descobertos com `quota-policy` |
| Criptografia | `crypto-core.ts` extraído; 16 testes na implementação real |
| Quota | contagem duplicada corrigida; `ollama` keyless; modo espelha ProviderManager |
| Rate limiting | login/cadastro/recuperação/API keys fail-closed (503); fallback em memória só em não críticos |
| Concorrência | Harness de 2 pools preparado, mas ainda sem execução no baseline |
| Rollback | falso "remover a chave mantém v2" corrigido + `scripts/rekey-byok-v2-to-v1.mjs` |
| Migrações | schema limpo/idempotente em PostgreSQL 18 isolado (single-user) |
| Documentação | `SPRINT_37E_7B_REPORT.md`, `FINAL_RELEASE_DECISION_V1_1.md` |

## Entregas 37E.7C (validação local concluída)

| Área | Estado |
|------|--------|
| PostgreSQL real | Cluster descartável `pg37e7c`, porta 55433, multi-conexão comprovada (duas sessões `pg_sleep(3)` simultâneas) |
| Harness SQL | `scripts/verify-concurrency.mjs`: **7/7 PASS**, inclui cenário A exato (restante=1; contadores 500/501; 1 autorizada) |
| Cenários de aplicação 5–7 / E-F | Standalone em duas instâncias + DB real: **8/8 PASS**, incluindo F2 com quota única e stream truncado |
| Defeito corrigido | Leitura dupla do body em Tutor/Academy/middleware causava `400 INVALID_REQUEST`; handlers agora validam clone do Request |
| Health | `/api/health/live` sem dependências; `/api/health` continua readiness DB/schema/S3; Docker/Railway apontam liveness |
| E2E | 218/218 casos únicos aprovados: 212 diretos + 6 retries; 0 falhas residuais ou skipped |
| Build/lint/typecheck | Build OK; typecheck OK; lint 0 erros e 75 warnings |
| Relatórios | `docs/SPRINT_37E_7C_REPORT.md`, `docs/CONCURRENCY_VALIDATION_V1_1.md`, `docs/E2E_STABILITY_V1_1.md` |

---

## Validação 37E.7C (E2E reconciliado)

| Check | Resultado |
|-------|-----------|
| `npm run lint` | PASS: 0 erros; 75 warnings |
| `npm run typecheck` | limpo |
| `npm run build` | PASS; produção compilada e rotas estáticas geradas |
| `npm run test:e2e` | 218 descobertos; 212 diretos + 6 após retry; 1 falha observada corrigida e aprovada direcionadamente; 0 falhas residuais/skipped |
| Harness SQL | **7/7 PASS** no PostgreSQL 18.4 multi-conexão (`studyai_37e7c`, 55433) |
| Harness app | **8/8 PASS**; duas instâncias standalone + DB de teste; Cenários 5–7, E/F e stream truncado F2 |
| Liveness/readiness | `/api/health/live`=200 sem DB/S3; `/api/health`=503 com DB indisponível |
| Fail-closed | login/register/recover/quota negados com banco indisponível |
| `npm audit --omit=dev` | 4 low transitivos (`katex`), sem high/critical; correção automática requer breaking change |
| `git diff --check` | PASS |

---

## E2E 37E.7C — reconciliação final

| Métrica | Valor |
|---------|-------|
| Descobertos | 218 |
| Aprovados diretamente | 212 |
| Aprovados após retry (flaky) | 6 |
| Falha observada/corrigida | 1 expectativa antiga de `/api/health`; passou após atualização para `/api/health/live` |
| Falhas residuais | 0 |
| Skipped | 0 |
| Interrompidos/não executados | 0; os 82 finais foram retomados e executados |

> Histórico 37E.7B: uma segunda execução completa (215) foi descartada por corrupção do
> `next dev` causada pela remoção de `.next` durante o run; não é evidência de
> produto. Depois de limpar o ambiente, a reexecução direcionada passou.

**Histórico 37E.7B (não é resultado atual):** o "184 passing" vinha da suíte de 189 testes e omitia 2 retries
(186 reais). Com os 13 testes de criptografia que passavam, o total era 199 em
203. Ver §4 do relatório.

---

## Riscos Residuais

| Risco | Sev. | Situação |
|-------|------|----------|
| Rate limit fail-open só em não críticos | Baixa | Login/cadastro/recuperação/API keys fail-closed (503); sync/colaboração/telemetria/feedback em memória |
| Quota conservadora com BYOK parcial | Média | Documentado; corrigir pós-launch |
| "BYOK Ativo" com BYOK parcial | Baixa | Cosmético; documentado |
| Monitoramento não implantado | Média | Health + logs + SQL manuais |
| `katex` 4 low | Baixa | Sem fix não-breaking |
| Readiness exige S3 | Média (op.) | Readiness retorna 503; liveness usado no healthcheck para evitar reinício por falha transitória |

---

## Próximos Passos

1. **Autorização explícita** de deploy (não concedida nesta sprint).
2. **Backup verificado** do PostgreSQL de produção + teste de restore.
3. Configurar variáveis no Railway, incluindo `API_KEYS_ENCRYPTION_KEY` e S3.
4. Deploy e smoke test (`docs/SMOKE_TEST_V1_1.md`) em até 15 min.
5. Se rollback: re-encriptar v2→v1 antes de remover a chave.
6. A suíte E2E de 218 testes está reconciliada; manter o Release Gate CONDITIONAL pelos gates operacionais.
7. Planejar alertas externos e gates operacionais; concorrência 5–7 já foi executada.

---

## Notas Importantes

- **NÃO FAZER DEPLOY** sem autorização.
- **NÃO EXECUTAR GIT PUSH** nesta sprint.
- **NÃO MODIFICAR PRODUÇÃO** (Railway intocado).
- **NÃO USAR `npm audit fix --force`**.
- **NÃO REMOVER `API_KEYS_ENCRYPTION_KEY`** sem re-encriptar v2.
- **NÃO ALTERAR `AUTH_SECRET`**.
- **NÃO ACESSAR `D:\FitIA`**.

---

## Próxima Ação

**Status:** **CONDITIONAL** — tecnicamente verificado, aguardando autorização e
cumprimento das condições obrigatórias de `docs/FINAL_RELEASE_DECISION_V1_1.md`.
