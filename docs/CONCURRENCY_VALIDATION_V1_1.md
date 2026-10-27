# Validação de Concorrência V1.1 — Sprint 37E.7C

**Data:** 2026-10-26  
**Branch:** `v1.1-development`  
**Checkpoint de partida:** `58d3fab`  
**Ambiente:** PostgreSQL 18.4 isolado, múltiplas conexões reais  
**Produção:** não acessada; nenhum banco/serviço de produção utilizado.

---

## 1. Ambiente PostgreSQL

O cluster isolado da Sprint 37E.7B (`pg37e7b`) estava corrompido: faltava o
diretório `pg_notify` e os backends falhavam com `0xC0000142` / erro 487
(`could not reserve shared memory region`). Ele não foi reutilizado.

Foi criado um cluster novo e descartável:

| Item | Valor |
|------|-------|
| Binários | PostgreSQL 18.4 (`C:\Program Files\PostgreSQL\18\bin`) |
| Cluster | `%LOCALAPPDATA%\Temp\opencode\pg37e7c\data` |
| Porta | `55433` |
| Autenticação | `trust` apenas em loopback |
| `shared_buffers` | 32 MB |
| `max_connections` | 25 |
| `huge_pages` | off |
| Banco | `studyai_37e7c` (descartável) |
| Schema | `src/server/database/schema.sql` aplicado via `--migrate` |

Docker e WSL não estão instalados nesta máquina. O serviço PostgreSQL do
sistema (porta 5432, `scram-sha-256`) não foi tocado, nem suas credenciais
foram procuradas/alteradas. Não foi usado o PostgreSQL do Railway.

**Prova de multi-conexão:** duas conexões independentes executaram
`pg_sleep(3)` simultaneamente e ambas retornaram com `inet_client_addr =
127.0.0.1`. O cluster aceita backends concorrentes; não é single-user.

```powershell
# cluster já iniciado em 55433
pg_ctl -D "$env:LOCALAPPDATA\Temp\opencode\pg37e7c\data" \
  -o "-p 55433 -h 127.0.0.1 -c shared_buffers=32MB -c max_connections=25 -c huge_pages=off" \
  -l pg.log start
```

---

## 2. Harness SQL — `scripts/verify-concurrency.mjs`

Execução real com dois pools independentes (`max: 8` cada), sem single-user:

```powershell
$env:NODE_ENV='test'
$env:CONFIRM_TEST_DATABASE='1'
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55433/studyai_37e7c'
$env:DATABASE_SSL='false'
node scripts/verify-concurrency.mjs --migrate
```

Resultado **8/8 PASS** na execução final de `scripts/verify-app-concurrency.mjs`:

| ID | Verificação | Resultado |
|----|-------------|-----------|
| A | Quota atômica: restante=1, 2 concorrentes → 1 autorizada | **PASS** — contadores `500,501`; exatamente 1 autorizada |
| B | 50 incrementos simultâneos em 2 pools | **PASS** — contador final `50` |
| C | Rate limit 20 compartilhado entre 2 pools, 30 tentativas | **PASS** — 20 autorizados |
| D | Quota diária 500, 520 tentativas concorrentes | **PASS** — 500 autorizadas |
| E | Quota de minuto 20, 30 tentativas concorrentes | **PASS** — 20 autorizadas |
| F | Persistência entre instâncias (pool A grava, pool B lê) | **PASS** — valor `7` |
| G | Conexão em porta fechada lança erro (fail-closed do driver) | **PASS** |

O Cenário A cobre exatamente o requisito da missão: duas conexões disputam a
última unidade e **somente uma** é autorizada. O SQL usa UPSERT atômico; não há
`SELECT` seguido de `UPDATE`.

O script recusa `NODE_ENV=production`, exige `CONFIRM_TEST_DATABASE=1`, nunca
executa `DROP` e limpa apenas `rate_limits key LIKE 'verify:%'` e
`users id LIKE 'verify_%'`.

---

## 3. Harness da aplicação — `scripts/verify-app-concurrency.mjs`

O build standalone de produção foi iniciado contra o banco descartável. O
script remove chaves reais de provider do ambiente dos filhos, assina JWT de
teste com `AUTH_SECRET`, semeia BYOK v2 com `API_KEYS_ENCRYPTION_KEY` e usa
duas instâncias reais quando necessário.

```powershell
$env:NODE_ENV='test'
$env:CONFIRM_TEST_DATABASE='1'
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55433/studyai_37e7c'
$env:DATABASE_SSL='false'
$env:STUDYAI_STANDALONE_DIR='.next/standalone'
node scripts/verify-app-concurrency.mjs
```

Resultado **8/8 PASS**:

| Cenário | Evidência |
|---------|-----------|
| **5. Rate limit compartilhado** | Duas instâncias reais, mesmo `x-forwarded-for` lógico (`203.0.113.37`): 10 tentativas permitidas; 11ª e 12ª retornaram `429`; contador persistido no PostgreSQL `12`. |
| **6. BYOK Gemini → fallback Groq** | Gemini BYOK com chave falsa falhou; Groq shared foi tentado em seguida. A quota foi consumida **antes** da cadeia: `daily 499→500`, `minute 0→1`. Logs do `ProviderManager`: `openrouter, groq, gemini, ollama`. Resposta final `503` (sem provider real disponível). |
| **7. Quota esgotada → Groq bloqueado** | Quota `500/20`; requisição manual Groq retornou `429 QUOTA_EXCEEDED`; nenhum log novo de provider (`logs=4→4`), portanto Groq shared não foi executado. |
| **E1. Liveness × readiness** | Com banco indisponível: `/api/health/live` = `200`; `/api/health` = `503` e `database.available=false`. |
| **E2. Auth fail-closed** | Banco indisponível: login, cadastro e recuperação retornaram `503` (sem fallback em memória). |
| **E3. Quota fail-closed** | Banco indisponível: requisição autenticada ao Tutor retornou `500 UNKNOWN_ERROR` e **zero** chamadas a provider. |
| **F. Retries limitados** | Exatamente 4 tentativas de provider (uma por provider da cadeia), sem duplicatas/loop. |
| **F2. Stream interrompido** | Sem BYOK/chaves válidas, quota `daily 0→1` e `minute 0→1`; Ollama local recebeu JSON truncado + reset de socket. A API emitiu `error`, sem `done`; cadeia automática terminou com 4 providers únicos (sem duplicação/loop). |

Segurança do harness: recusa `NODE_ENV=production` no processo pai, recusa
`DATABASE_URL` fora de loopback, recusa banco sem nome de teste/descartável,
nunca executa `DROP`, não imprime credenciais e remove apenas usuários
`conc37e7c_%` + o rate-limit key específico `login:203.0.113.37` do banco de teste.

---

## 4. Defeito crítico encontrado e corrigido

O primeiro teste real do Tutor contra o build standalone retornou:

```json
{"code":"INVALID_REQUEST","error":"Corpo da requisição inválido."}
```

Causa: o corpo de um `Request` só pode ser lido uma vez. `src/app/api/tutor/route.ts`
e `src/app/api/academy/generate/route.ts` liam `request.json()` para validar e
`withAIQuota` lia novamente; rotas como `diagrams/generate`, `lab/review` e
`teacher/audio-lesson` liam o corpo dentro do handler depois de `withAIQuota`.
Os E2E anteriores interceptavam `/api/tutor` no navegador e não exerciam a rota
real, por isso o defeito não havia sido detectado.

Correção:

- `withAIQuota` lê `request.clone().json()`, preservando o corpo original;
- `tutor/route.ts` e `academy/generate/route.ts` validam com `request.clone().json()`;
- handlers que releem o corpo continuam funcionando sem alteração.

Evidência após a correção: o Cenário 6 executou a rota real, consumiu quota e
acionou a cadeia de providers (resposta `503`, não `400`).

---

## 5. Limitações e cobertura restante

- **Cenário C (missão):** validado com BYOK Gemini de chave falsa e Groq shared
  sem chave. Não houve resposta bem-sucedida do Groq (endpoint externo fixo,
  sem mock server-side). A ordem “quota antes do fallback” é comprovada pela
  quota consumida e pelos logs de tentativa `gemini → groq`.
- **Cenário F (streaming/retries):** o limite é 4 providers únicos. Um provider
  Ollama HTTP local falso envia JSON truncado e reseta o socket; com modo
  automático a rota real consome quota exatamente uma vez, emite `error`, não
  emite `done` e percorre os providers restantes sem duplicatas. Sem credenciais
  válidas, nenhum provider público é consultado. A suíte também simula 429 e
  chunks no browser.
- **Providers externos:** nenhuma credencial válida/real foi usada. O cenário 6
  forneceu uma chave Gemini deliberadamente falsa para exercitar a falha e o
  fallback; pode ter ocorrido uma requisição pública rejeitada, sem credenciais
  válidas ou consumo/cobrança de provider.
- **Quota superestima tentativas negadas:** `checkAndConsume` incrementa antes
  de decidir; tentativas bloqueadas continuam contando. Não há bypass, mas o
  comportamento é conservador e está documentado como risco residual.

---

## 6. Reprodução em CI

Com Docker/WSL disponível, o equivalente é:

```bash
docker run --rm -d --name studyai-pg \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=studyai_test \
  -p 55433:5432 postgres:18
CONFIRM_TEST_DATABASE=1 \
DATABASE_URL=postgresql://postgres:test@127.0.0.1:55433/studyai_test \
  node scripts/verify-concurrency.mjs --migrate

npm run build
CONFIRM_TEST_DATABASE=1 \
DATABASE_URL=postgresql://postgres:test@127.0.0.1:55433/studyai_test \
STUDYAI_STANDALONE_DIR=.next/standalone \
  node scripts/verify-app-concurrency.mjs
```

Os testes 5–7 de `tests/concurrency.spec.ts` executam o segundo harness quando
`CONCURRENCY_DATABASE_URL` e `STUDYAI_STANDALONE_DIR` estão definidos; sem as
duas variáveis permanecem `skipped` e **não contam como aprovados**.
