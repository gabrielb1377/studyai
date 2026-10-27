# Estabilidade E2E V1.1 — Sprint 37E.7C

**Data:** 2026-10-26  
**Branch:** `v1.1-development`  
**Checkpoint de partida:** `58d3fab`  
**Suíte:** Playwright + Chromium, 1 worker, `retries=1`, timeout 60 s  
**Servidor E2E:** `next dev` isolado, sem `DATABASE_URL` (dados de aplicação em memória)

---

## 1. Mudanças aplicadas

### 1.1 Warm-up determinístico de rotas

`tests/global-setup.ts` pré-compila sequencialmente todas as páginas e as APIs
críticas antes do primeiro teste:

- `/`, `/academy`, `/academy/studio`, `/biblioteca`, `/configuracoes`, `/conta`,
  `/estudo`, `/importar`, `/lab`, `/organizar`, `/salas`, `/storage`, `/tutor`,
  `/compartilhar/warmup`;
- `/api/health/live`, `/api/health`, `/api/ai/manager`, `/api/tutor`,
  `/auth/login`, `/auth/register`, `/auth/recover`, `/auth/session`.

O `next dev` compila sob demanda. Sem warm-up, o primeiro teste de cada rota
pagava a compilação e podia estourar esperas — a causa provável dos flakes de
`product-polish`/`conta` na 37E.7B. O warm-up é uma otimização: se uma rota
falhar, ele registra aviso e o teste real correspondente ainda decide o
resultado. Não foram aumentados timeouts ou retries para mascarar falhas.

### 1.2 Cenários 5–7 executáveis de verdade

`tests/concurrency.spec.ts` não usa mais `test.skip` com TODO. Quando
`CONCURRENCY_DATABASE_URL` + `STUDYAI_STANDALONE_DIR` estão definidos, o
`beforeAll` executa `scripts/verify-app-concurrency.mjs` (duas instâncias
standalone + PostgreSQL descartável) e cada teste valida o marcador real do
harness:

- Cenário 5 — rate limit de login compartilhado entre duas instâncias;
- Cenário 6 — BYOK Gemini falha → Groq shared após consumir quota;
- Cenário 7 — quota esgotada → Groq shared não é executado;
- Cenários E/F — fail-closed com banco indisponível, retries limitados e stream
  real truncado no provider HTTP local de teste.

Sem as variáveis, os quatro testes aparecem como `skipped` com justificativa no
código e **não são contados como aprovados**. Na execução desta sprint as duas
variáveis foram definidas e os quatro testes passaram.

### 1.3 Teste de health separado

Novo `tests/health.spec.ts` valida:

- liveness `200` sem banco/schema/storage e sem campos de dependência;
- readiness com o contrato detalhado (`checks.database`,
  `checks.objectStorage`, `checks.application.publicUrlConfigured`).

### 1.4 Correção do corpo consumido duas vezes

O teste real do Tutor revelou `400 INVALID_REQUEST` porque `request.json()` era
lido pela rota e novamente por `withAIQuota`. A correção usa
`request.clone().json()` no middleware e nas rotas que validam antes da quota.
Detalhes em `docs/CONCURRENCY_VALIDATION_V1_1.md` §4. Isso remove uma causa de
falha real em produção que os E2E com `page.route("**/api/tutor")` não viam.

### 1.5 Healthcheck de infraestrutura

`railway.toml` e `Dockerfile` passaram a usar `/api/health/live` no
healthcheck de reinício. O readiness continua em `/api/health` para
monitoramento. Uma falha temporária de S3 não reinicia o container em loop.

---

## 2. Preparação da execução

- Nenhum `next dev`/Playwright ativo antes do run; porta 3000 livre.
- `.next` removido **somente** com o servidor parado, após copiar
  `.next/standalone` para `%LOCALAPPDATA%\Temp\opencode\studyai-standalone-37e7c`.
- Build standalone usado pelos cenários 5–7 veio da cópia, imune à recompilação
  do `next dev`.
- Suíte executada com 1 worker e reporter `list,json`.
- Banco de teste: `studyai_37e7c` em `127.0.0.1:55433`.
- Nenhum `.next` foi apagado durante o run.

Comando base:

```powershell
$env:CONCURRENCY_DATABASE_URL='postgresql://postgres@127.0.0.1:55433/studyai_37e7c'
$env:STUDYAI_STANDALONE_DIR="$env:LOCALAPPDATA\Temp\opencode\studyai-standalone-37e7c"
$env:PLAYWRIGHT_JSON_OUTPUT_NAME='D:\studyai\test-results\e2e-37e7c.json'
npx playwright test --reporter=list,json
```

---

## 3. Resultado da suíte completa

> Preenchido após a execução final. Nenhum resultado parcial é tratado como
> aprovação.

| Métrica | Valor |
|---------|-------|
| Testes descobertos | 218 |
| Execução original (encerrada pelo restart do ambiente) | Parou após o 136º caso único; log `test-results/e2e-37e7c.log` |
| Concluídos na execução original | 136 (log tem 141 eventos, incluindo 5 tentativas iniciais com retry) |
| Passed diretamente (casos únicos) | 212 |
| Passed após retry (casos únicos) | 6 |
| Failed observado antes das correções | 1 (`product-polish.spec.ts:101`, expectativa antiga `/api/health`) |
| Skipped | 0 |
| Interrupted / não executados na execução original | 82; todos foram retomados sem repetir os 136 casos concluídos |
| Revalidação direcionada | Asserção do healthcheck e teste de PDF passaram após correção/espera adequada |
| Resultado final reconciliado | **218/218 casos únicos aprovados**; 6 exigiram retry, 0 falhas residuais, 0 skipped |

---

## 4. Investigação de flakes

| Área | Investigação | Ação |
|------|--------------|------|
| `product-polish.spec.ts:101` | Esperava `/api/health`, embora o healthcheck correto de deploy seja `/api/health/live` | Expectativa corrigida; reexecução direcionada passou |
| `polish.spec.ts:169` | Inicialização lazy do worker PDF.js ocasionalmente ultrapassou a expectativa padrão de 5 s; passou no retry | Expectativa específica elevada a 15 s; teste direcionado passou em 13,2 s |
| `product-polish.spec.ts:57` | Falha anterior em `/conta` + cadastro; rota compilada sob demanda e registro real | Warm-up de `/conta` e `/auth/register`; sem falha residual nesta suíte |
| PPTX/preview | Dependem de libs carregadas sob demanda | Warm-up de `/tutor`, `/lab`, `/academy/studio`; observar na suíte final |
| Navegação | `next dev` compilando durante o teste | Warm-up sequencial |
| Quota | Quota real com DB fica fora do E2E padrão; cenários 5–7 usam harness dedicado | Wrappers 5–7 + `quota-policy.spec.ts` |
| Colaboração | IndexedDB/localStorage compartilhados | Contexto novo por teste; sem mudança de timeout |
| Streaming | Cenário 4 usa mock de browser; harness adicional usa rota real do Tutor + Ollama HTTP local que trunca JSON e reseta socket | Harness verifica evento `error`, ausência de `done`, fallback e loop; nenhum provider público válido é chamado |

Timeout global e política de retries permaneceram inalterados. Foi ampliada
somente para 15 s a expectativa do teste de PDF.js lazy, pois o worker frio
levou mais de 5 s de forma reproduzível no E2E.

---

## 5. Critério de aceite

- Todos os testes descobertos executados (nenhum skipped quando o ambiente de
  concorrência está disponível).
- Falhas residuais classificadas com causa raiz e correção, ou registradas como
  bloqueio ambiental.
- Nenhum teste removido para elevar percentual.
- Nenhuma execução inválida (`.next` removido durante o dev) usada como
  evidência.
