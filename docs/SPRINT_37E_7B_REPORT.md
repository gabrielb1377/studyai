# Sprint 37E.7B — Final Release Verification (V1.1 Beta)

**Data:** 2026-10-26
**Branch:** `v1.1-development`
**Commit base:** `1e56d76` (Sprint 37E.7A)
**Escopo:** verificação final de release, sem deploy, sem push e sem tocar em produção.
**Decisão:** ver `docs/FINAL_RELEASE_DECISION_V1_1.md`.

---

## 1. Resumo Executivo

A Sprint 37E.7B reconciliou a suíte E2E, auditou os controles de quota, rate
limit, migrações e criptografia BYOK, corrigiu defeitos reais encontrados no
caminho e documentou os limites que ainda impedem um "GO" incondicional.

**O que foi comprovado**

- Schema PostgreSQL aplica limpo e é idempotente (duas aplicações, 0 erros).
- Constraints essenciais existem: PKs de `usage_quotas`/`rate_limits`,
  índices de quota/rate limit e FKs `ON DELETE CASCADE`.
- A contagem de quota no dashboard estava **duplicada** (dia + minutos); foi
  corrigida e validada no banco isolado (3 requisições: antes 6, depois 3).
- A pré-checagem de quota no modo automático cobrava quota compartilhada mesmo
  quando o provider local (`ollama`) ou todos os providers cloud tinham BYOK;
  foi corrigida para espelhar o `ProviderManager`.
- Criptografia BYOK v1/v2 foi validada contra a **implementação real**
  (16 testes), incluindo modo misto, adulteração GCM, chave errada e o risco de
  rollback v2 → v1.
- O procedimento de rollback criptográfico documentado estava **incorreto** e
  foi corrigido; foi adicionado um script de re-encriptação v2 → v1 com
  dry-run.
- O **rate limiting crítico** passou a ser fail-closed em produção: login,
  cadastro, recuperação de senha e gerenciamento de API keys negam a requisição
  (503) quando o PostgreSQL está indisponível, em vez de cair no contador em
  memória. O fallback permanece apenas em endpoints não críticos.
- A política de quota por credencial (BYOK × fallback compartilhado) foi
  extraída para um módulo puro (`quota-policy.ts`) e exercitada por 10 testes
  unitários, cobrindo a decisão dos Cenários 6 e 7.
- `npm run typecheck` limpo e `npm run lint` com 0 erros.

**O que NÃO foi comprovado**

- Concorrência real com múltiplas conexões PostgreSQL (ver §6.1). Foi criado um
  harness reproduzível (`scripts/verify-concurrency.mjs`) para ambiente
  compatível.
- Os 3 cenários de concorrência continuam `skipped`. Os Cenários 6 e 7 têm
  cobertura da **decisão** de quota, não do fluxo HTTP completo com fallback
  real de provider.
- Deploy, backup/restore, monitoramento e configuração Railway não foram
  executados (sem autorização/acesso).
- Alertas Prometheus/Grafana não existem no produto.

---

## 2. Método e Restrições

- Nenhum `git push`, deploy, migração em produção ou alteração em `main`.
- Nenhum acesso a `D:\FitIA`.
- Nenhum segredo lido, impresso ou gravado. `AUTH_SECRET` real não foi alterado.
- Banco de teste: cluster PostgreSQL 18 isolado em
  `%LOCALAPPDATA%\Temp\opencode\pg37e7b`, porta 55432, sem relação com o serviço
  do sistema nem com produção.
- O servidor PostgreSQL isolado não conseguiu criar backends
  (`0xC0000142`, falha de inicialização de DLL no ambiente Windows). O schema e
  as consultas foram validados em **single-user mode** (`postgres --single`),
  que não cria processos-filho. Concorrência multi-conexão não pôde ser
  executada nesse modo.

---

## 3. Auditoria Git e Correção de Documentação

O checkpoint informado (`f3a2b1c`) **não existe** no repositório. O HEAD real é:

```
1e56d76 chore(release): verify v1.1 pre-launch readiness sprint 37E.7A
5dc68d0 chore(release): prepare StudyAI v1.1 operational rollout sprint 37E.6
b6610da fix(security): complete sprint 37E.5 - security completion, reliability & release gate
```

O mesmo vale para `c1a2b3d` (citado como commit da 37E.6). Os documentos
afetados receberam nota de correção:

| Documento | Correção |
|-----------|----------|
| `docs/SPRINT_37E_6_REPORT.md` | `c1a2b3d` → `5dc68d0`; contagem 189/184 revisada |
| `docs/SPRINT_37E_7A_REPORT.md` | `f3a2b1c` → `1e56d76`; contagem 203/184 revisada |
| `docs/RELEASE_GATE_V1_1_OPERATIONAL.md` | marcado como **SUPERSEDED** pela 37E.7B |
| `docs/DEPLOY_V1_1_CHECKLIST.md` | hashes, migração automática e rollback crypto |
| `docs/DEPLOY_V1_1_RUNBOOK.md` | migração automática; aviso sobre push em `main` |
| `docs/SMOKE_TEST_V1_1.md` | `/api/auth/session` → `/auth/session`; classes A/B/C |
| `docs/ROLLBACK_V1_1.md` | corrigido o falso "remover a chave mantém v2 legível" |
| `docs/MONITORING_V1_1.md` | alertas marcados como **não configurados**; query corrigida |
| `.env.example` / `.env.production.example` | adicionado `API_KEYS_ENCRYPTION_KEY` |

---

## 4. Reconciliação dos Testes E2E

### 4.1 O número "184" não fechava

A suíte de **189** testes da 37E.6 foi reportada como "184 passing". A conta
correta era:

| Item | Quantidade |
|------|-----------:|
| Aprovações diretas | 184 |
| Aprovações após retry | 2 |
| Skipped | 3 |
| **Total** | **189** |

Ou seja, **186 passing**, não 184. O relatório anterior contava apenas 1 retry.

### 4.2 A suíte de 203 testes (37E.7A)

Com os 14 testes de criptografia adicionados, o Playwright reportou:

| Status | Quantidade |
|--------|-----------:|
| `expected` (passou direto) | 197 |
| `flaky` (passou no retry) | 2 |
| `unexpected` (falhou) | 1 |
| `skipped` | 3 |
| **Total descoberto** | **203** |

Portanto: **199 passing** (197 + 2), **1 falha real**, **3 skipped**.

A falha era o teste "ciphertext adulterado falha" em
`tests/crypto-migration.spec.ts`: ele alterava o **último caractere base64url**
do ciphertext. Como base64url ignora bits de padding, a alteração podia
decodificar para os mesmos bytes e a descriptografia continuava válida — o teste
não garantia adulteração real. Foi substituído por um teste que inverte bytes
já decodificados. Não era falha do produto.

**Reconciliação final:** 184 (relatório antigo) + 2 retries + 13 testes de
criptografia que passavam = **199**. Os "16 restantes" que não apareciam na
conta antiga eram, na verdade, 2 retries + 14 testes de criptografia.

### 4.3 Execução completa (código da 37E.7B)

O arquivo de criptografia passou de 14 para **16 testes** (implementação real).
A execução completa encontrou **205 testes** — antes dos 10 testes de
`quota-policy.spec.ts`, adicionados ao final (§4.5).

| Status | Quantidade |
|--------|-----------:|
| Passou direto | 193 |
| Flaky (passou no retry) | 8 |
| Falhou | 1 |
| Skipped | 3 |
| **Total** | **205** |

A única falha foi `tests/product-polish.spec.ts:57` (timeout ao trocar para o
banco isolado). O teste passou **3/3** em execuções isoladas e novamente na
reexecução direcionada sobre o código final (§4.5). A falha coincidiu com a
recompilação a quente do `next dev` durante a suíte e não foi reproduzida.

Os 8 flakies passaram no retry. Não foi aumentado o número de retries; o
timeout de compilação da rota de autenticação em `tests/cloud-sync.spec.ts`
permaneceu em 15 s.

> **Limite de evidência:** o JSON bruto foi sobrescrito pelas reexecuções
> posteriores. A reconciliação acima vem do log da execução completa de
> 25/10/2026.

### 4.4 Reexecução direcionada no código final

Como o hardening de rate limit crítico foi concluído depois do início da
execução completa, os fluxos afetados foram reexecutados sobre o código final:

| Arquivo | Testes | Resultado |
|---------|-------:|-----------|
| `tests/quota-policy.spec.ts` | 10 | 10 passed |
| `tests/cloud-sync.spec.ts` (auth, sync, conflito, exclusão) | 4 | 4 passed |
| `tests/concurrency.spec.ts` (cenários 1–4 + 2 doc) | 6 | 6 passed |
| `tests/product-polish.spec.ts:57` | 1 | 1 passed |
| **Total** | **21** | **21 passed, 3 skipped** |

Os 3 skipped são os Cenários 5–7 (§4.5). Com os 10 testes de
`quota-policy.spec.ts`, a suíte passa a descobrir **215 testes**.

> Uma segunda execução completa (215 testes) foi **descartada**: a remoção de
> `.next` com o `next dev` ativo corrompeu o ambiente e produziu 139 timeouts
> em massa. Não é resultado de produto. O ambiente foi limpo e a reexecução
> direcionada acima passou.

### 4.5 Skipped — não aprovados

| Teste | Motivo |
|-------|--------|
| `concurrency.spec.ts:183` — Cenário 5: rate limit persistente entre instâncias | Exige duas instâncias reais + PostgreSQL multi-conexão; ambiente não permitiu |
| `concurrency.spec.ts:189` — Cenário 6: BYOK Gemini falha → fallback Groq shared consome quota | Exige mock do `ProviderManager` em nível de servidor + DB real |
| `concurrency.spec.ts:193` — Cenário 7: Groq shared sem quota | Mesmo motivo |

Nenhum desses cenários foi declarado aprovado.

---

## 5. Defeitos Encontrados e Corrigidos

| # | Defeito | Severidade | Correção |
|---|---------|-----------|----------|
| 1 | `getQuotaInfo` e `getUsageStats` somavam a linha diária **e** as linhas de minuto → uso ~2× no dashboard | Média (exibição) | Somar apenas `minute_bucket = 0` |
| 2 | `withQuotaEnforcement`/`withAIQuota` exigiam BYOK de `ollama` (que nunca tem chave) → modo automático **sempre** consumia quota compartilhada | Alta (cobrança indevida) | `ollama` tratado como keyless |
| 3 | Pré-checagem tratava `mode` ausente como automático, divergindo do `ProviderManager` | Média | Espelhar a regra: só `"automatic"` percorre o fallback; caso contrário, provider selecionado (default `gemini`) |
| 4 | `checkAndConsume` executava `ROLLBACK` fora de transação no `catch` | Baixa | Removido; erro propagado (fail-closed) |
| 5 | Documentação de rollback afirmava que remover `API_KEYS_ENCRYPTION_KEY` mantinha v2 legível | Alta (perda de BYOK) | Corrigida + script `scripts/rekey-byok-v2-to-v1.mjs` (dry-run por padrão) |
| 6 | `API_KEYS_ENCRYPTION_KEY` ausente nos `.env.example` | Média (operacional) | Adicionada com instruções |
| 7 | Docs citavam hashes inexistentes (`f3a2b1c`, `c1a2b3d`) e endpoint `/api/auth/session` | Média | Corrigidos |
| 8 | Migração documentada como manual, mas o `Dockerfile` já executa `db-migrate.mjs` no boot | Média | Docs alinhados ao comportamento real |
| 9 | `rateLimit()` caía em contador em memória em **qualquer** erro de banco, inclusive em login/cadastro/recuperação/API keys | Alta | `rateLimitStrict()` introduzido; em produção, indisponibilidade persistente → **503** (fail-closed). Fallback em memória restrito a endpoints não críticos |
| 10 | `withQuotaEnforcement()` era dead code e passava `{}` ao handler, descartando as chaves BYOK | Baixa (latente) | Mantido fora do fluxo; `withAIQuota()` (usado) preserva as chaves. Remover na 37E.8 |

---

## 6. Evidências de Verificação

### 6.1 PostgreSQL isolado (single-user mode)

| Verificação | Resultado |
|-------------|-----------|
| `schema.sql` aplicado em banco limpo | 0 erros (36 statements) |
| Segunda aplicação (idempotência) | 0 erros |
| Tabelas `rate_limits`, `usage_quotas`, `user_api_keys`, `users` | presentes |
| PK `usage_quotas(user_id,date,minute_bucket)` | confirmada |
| PK `rate_limits(key,window_bucket)` | confirmada |
| Índices `usage_quotas_user_date`, `usage_quotas_user_minute`, `rate_limits_bucket` | confirmados |
| FKs `usage_quotas→users` e `user_api_keys→users` | `ON DELETE CASCADE` |
| 3 requisições: linha diária | 3 |
| 3 requisições: linha do minuto | 3 |
| Consulta antiga (soma de todas as linhas) | 6 (duplicava) |
| Consulta corrigida (`minute_bucket = 0`) | 3 |
| Upsert de rate limit (3 chamadas) | 3 |
| PK duplicada em `rate_limits` | rejeitada |
| FK para usuário inexistente | rejeitada |
| `DELETE` do usuário → quota | 0 linhas (cascade) |

**Limite:** single-user mode não permite conexões concorrentes. O UPSERT
atômico (`ON CONFLICT ... DO UPDATE SET count = count + 1`) é o mesmo usado em
produção, mas a corrida entre backends **não foi executada**.

**Harness reproduzível:** `scripts/verify-concurrency.mjs` usa dois pools
(simulando duas instâncias) e exige `CONFIRM_TEST_DATABASE=1` + `DATABASE_URL`
de teste; recusa `NODE_ENV=production`. Cobre 50 incrementos simultâneos,
rate limit 20/30, quota diária 500/520, quota de minuto 20/30, persistência
entre pools e falha de driver em porta fechada. **Não executado neste host**
porque o PostgreSQL isolado não criou backends (`0xC0000142`); é o artefato a
rodar em CI/container antes de promover o gate.

### 6.2 Criptografia BYOK

`tests/crypto-migration.spec.ts` (16 testes) importa
`src/server/security/crypto-core.ts` — a implementação real usada por
`Crypto.ts`. Cobre:

- v1 (sem chave dedicada) e v2 (com `API_KEYS_ENCRYPTION_KEY`);
- modo misto (v1 legível com chave v2 configurada);
- v2 **ilegível** sem a chave (rollback direto quebra o BYOK);
- chave v2 errada, `AUTH_SECRET` errado, ciphertext/tag adulterados;
- formato inválido e versão desconhecida;
- IV de 12 bytes e 50 IVs únicos;
- rotação de chave e coexistência v1/v2.

### 6.3 Qualidade estática

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | limpo |
| `npm run lint` | 0 erros, 82 warnings (pré-existentes) |
| `npm run build` | ver §6.4 |
| `npm audit --omit=dev` | 4 low (`katex`), sem high/critical |
| `git diff --check` | limpo |

### 6.4 Build e audit

- `npm run build`: 46 rotas, standalone gerado, sem erro.
- `pg` e dependências (`pg-pool`, `pg-protocol`, `pg-types`, `pgpass`, etc.)
  estão presentes em `.next/standalone/node_modules`; `schema.sql` também é
  copiado para o standalone (o `Dockerfile` reforça as duas cópias).
- `npm audit --omit=dev`: exit 1 apenas por 4 advisories **low** da cadeia
  `katex` (`dompurify`/`mermaid`). Não há correção sem quebrar a versão;
  aceito como risco residual. `next@15.5.28` corrigiu o RCE crítico anterior.

### 6.5 Fail-closed em produção (standalone)

O `server.js` do standalone foi executado com `NODE_ENV=production` na porta
3210, primeiro com `DATABASE_URL` apontando para uma porta fechada e depois
sem `DATABASE_URL`:

| Cenário | `/auth/login` | `/auth/register` | `/auth/recover` | Cabeçalho |
|---------|:-------------:|:----------------:|:---------------:|-----------|
| Backend inacessível | 503 | 503 | 503 | `Retry-After: 30` |
| `DATABASE_URL` ausente | 503 | 503 | 503 | `Retry-After: 30` |

Isso confirma o fail-closed independentemente de o driver conseguir abrir
conexão. Em desenvolvimento sem `DATABASE_URL`, o comportamento anterior é
preservado para não bloquear a suíte E2E.

---

## 7. Riscos Residuais (WARNING)

1. **Quota não conhece a credencial efetiva.** A autorização acontece uma vez,
   antes da chamada. Em modo automático com BYOK parcial, a quota compartilhada
   é consumida mesmo se o provider BYOK vencer — e a requisição pode ser
   bloqueada por quota esgotada mesmo tendo BYOK válido. Comportamento
   conservador; documentado, não redesenhado.
2. **Rate limit fail-closed nos críticos, fail-open nos demais.** Login,
   cadastro, recuperação e API keys retornam 503 se o backend persistente
   estiver indisponível em produção. Apenas sync, colaboração, telemetria e
   feedback mantêm fallback em memória por instância; nesses casos o limite
   pode ser contornado entre réplicas, mas não há bypass de autenticação.
3. **Dashboard diz "BYOK Ativo" com qualquer chave**, mesmo quando a quota
   compartilhada ainda é consumida (BYOK parcial).
4. **`getDateString()` usa data UTC** e o reset exibido usa meia-noite local;
   há uma janela de até algumas horas na virada do dia.
5. **Concorrência real não testada** (§6.1).
6. **Cenários 5–7 skipped** (§4.5).
7. **Monitoramento não implantado:** não há `/metrics`, exportador Prometheus
   nem alertas ativos. Observabilidade = `/api/health` + logs Railway + SQL.
8. **Deploy não validado:** Railway, backup/restore, S3 real e SMTP não foram
   acessados.
9. **Health exige storage:** sem S3 configurado, `/api/health` retorna 503 e o
   Railway considera o container não saudável.
10. **4 advisories low** em `katex`, sem fix não-disruptivo.

---

## 8. Arquivos Alterados Nesta Sprint

```
.env.example
.env.production.example
CURRENT_HANDOFF.md
docs/DEPLOY_V1_1_CHECKLIST.md
docs/DEPLOY_V1_1_RUNBOOK.md
docs/MONITORING_V1_1.md
docs/RELEASE_GATE_V1_1_OPERATIONAL.md
docs/ROLLBACK_V1_1.md
docs/SMOKE_TEST_V1_1.md
docs/SPRINT_37E_6_REPORT.md
docs/SPRINT_37E_7A_REPORT.md
docs/SPRINT_37E_7B_REPORT.md
docs/FINAL_RELEASE_DECISION_V1_1.md
scripts/rekey-byok-v2-to-v1.mjs
scripts/verify-concurrency.mjs
src/app/api/account/api-keys/route.ts
src/app/api/account/api-keys/test/route.ts
src/app/auth/login/route.ts
src/app/auth/recover/route.ts
src/app/auth/register/route.ts
src/server/ai/ApiKeyService.ts
src/server/ai/QuotaMiddleware.ts
src/server/ai/QuotaService.ts
src/server/ai/quota-policy.ts
src/server/security/Crypto.ts
src/server/security/RateLimit.ts
src/server/security/RateLimitHttp.ts
src/server/security/crypto-core.ts
tests/cloud-sync.spec.ts
tests/crypto-migration.spec.ts
tests/quota-policy.spec.ts
```

---

## 9. Conclusão

A V1.1 está **tecnicamente consistente** para autorização de deploy, mas a
verificação não cobre concorrência real entre instâncias nem os três cenários
de fallback/quota skipados. A decisão recomendada é **CONDITIONAL**, com as
condições descritas em `docs/FINAL_RELEASE_DECISION_V1_1.md`.
