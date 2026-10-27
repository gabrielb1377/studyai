# Sprint 37E.7C — Relatório de Validação Técnica

**Data:** 2026-10-26  
**Branch:** `v1.1-development`  
**Checkpoint base:** `58d3fab751cb64adb30b2363c94170f441adb54c`  
**Deploy/push:** não executados; Railway e produção intocados.

## Resumo

| Área | Resultado |
|------|-----------|
| PostgreSQL multi-conexão | **PASS — 7/7** no harness SQL, 2 pools reais; cenário A (restante=1) autorizou exatamente 1 de 2 |
| Cenários de aplicação 5–7 / E-F | **8/8 PASS** em build standalone e PostgreSQL de teste; F2 confirmou quota `0→1`, evento `error` após stream truncado, e fallback finito com 4 providers únicos |
| Fail-closed | **PASS** — login/cadastro/recuperação e quota negados com banco indisponível |
| Health | **PASS** — liveness não consulta dependências; readiness mantém DB/schema/S3/URL |
| Defeito corrigido | Leitura dupla do body em rotas com `withAIQuota` causava `400`; corrigido com `Request.clone()` e comprovado por teste HTTP real |
| E2E completo | 218/218 casos únicos aprovados: 212 diretos + 6 após retry; houve uma falha observada na asserção antiga de healthcheck, corrigida e aprovada na reexecução direcionada; 0 falhas residuais, 0 skipped |
| Lint/typecheck/build | Lint PASS: 0 erros, 75 warnings; typecheck PASS; build PASS |
| Audit | `npm audit --omit=dev` encontrou 4 advisories low transitivos de `katex`; nenhum high/critical; fix automático exige breaking change |
| Diff | `git diff --check`: PASS |
| Release Gate | **CONDITIONAL** por autorização, backup/restore, alerta externo e verificações pós-deploy |

## Evidências

- `docs/CONCURRENCY_VALIDATION_V1_1.md` — ambiente, comandos, resultados e limitações dos cenários A–G / 5–7 / E–F.
- `docs/E2E_STABILITY_V1_1.md` — warm-up, execução completa e reconciliação dos estados de teste.
- `scripts/verify-concurrency.mjs` — corrida multi-conexão no SQL.
- `scripts/verify-app-concurrency.mjs` — integração real com standalone, auth, BYOK, quotas e rate limit cross-instance.

## Ambiente e segurança

- Cluster PostgreSQL 18.4 descartável em `%LOCALAPPDATA%\Temp\opencode\pg37e7c`, loopback `127.0.0.1:55433`, DB `studyai_37e7c`.
- Docker/WSL indisponíveis. O cluster PostgreSQL de sistema em 5432 não foi tocado.
- Nenhum banco/serviço de produção ou credencial válida de provider utilizado. O Cenário 6 usou uma chave Gemini deliberadamente falsa; eventual requisição pública foi rejeitada, sem consumo/cobrança de provider.
- `pg37e7b` antigo (corrompido, faltando `pg_notify`, erros 0xC0000142/487) não foi reutilizado.

## Mudanças relevantes

1. `/api/health/live` adicionado sem DB/S3; `/api/health` continua readiness detalhada.
2. `railway.toml` e Docker healthcheck usam `/api/health/live`.
3. Cenário A exato incluído em `verify-concurrency.mjs`.
4. Cenários 5–7 deixaram de ser TODO skipped e agora podem executar contra PostgreSQL e standalone; sem as variáveis de ambiente continuam skipped, não passing.
5. Warm-up sequencial de páginas/APIs para reduzir flakes causados por compilação sob demanda no `next dev`.
6. Leitura do body corrigida com clones em Tutor, Academy Generate e `withAIQuota`.

## Pendências e decisão

Não declarar `READY FOR AUTHORIZATION` enquanto a suíte E2E completa não estiver
reconciliada e sem falha crítica. Mesmo com evidência técnica aprovada, deploy
continua dependendo de autorização humana explícita, backup/restore verificado,
configuração remota revisada e smoke test pós-deploy. Nenhum deploy foi
executado nesta sprint.

**Decisão atual: CONDITIONAL.**
