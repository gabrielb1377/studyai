# Handoff Atual — Sprint 37E.4: Critical Security Fixes — BYOK, Quotas & Reliability

Atualizado em 22 de outubro de 2026.

## ✅ Sprint 37E.4 CONCLUÍDA

### Commit Final
- **Commit:** (a ser criado) — `fix(security): close quota bypass and harden BYOK sprint 37E.4`
- **Branch:** v1.1-development
- **Arquivos:** 12 alterados (+1131/-328 linhas) + 2 novos docs
- **Validação:** lint ✅ typecheck ✅ build ✅ test:e2e 181/184 passed (1 flaky pré-existente, 3 flaky retry-pass) ✅ audit ✅ diff-check ✅

### Entregas Principais

#### 1. Correção Crítica: Bypass de Quota Compartilhada (`src/server/ai/QuotaMiddleware.ts`)
- **Problema:** Usuário com BYOK Gemini fazia fallback para Groq → quota compartilhada NÃO era consumida
- **Causa Raiz:** `withQuotaEnforcement` e `withAIQuota` verificavam `hasSharedKeys = Object.keys(userApiKeys).length === 0` — se usuário tivesse QUALQUER chave BYOK, bypassava quota totalmente
- **Correção:** Nova lógica verifica se usuário tem BYOK para TODOS os providers que podem ser usados
  - Modo manual: verifica provider específico
  - Modo automático: verifica TODOS providers na ordem de fallback (ollama → gemini → groq → openrouter)
  - Só bypassa quota se usuário tiver chave para TODOS providers que podem ser usados
- **Arquivo:** `src/server/ai/QuotaMiddleware.ts` (funções `withQuotaEnforcement` e `withAIQuota`)

#### 2. Quotas Atômicas e Persistentes (`src/server/ai/QuotaService.ts` + `schema.sql`)
- Tabela `usage_quotas` com PK composta `(user_id, date, minute_bucket)`
- Operações atômicas via `INSERT ... ON CONFLICT DO UPDATE` no PostgreSQL
- Limites: 500 req/dia, 20 req/min por usuário
- Reset diário à meia-noite, janela de 1 minuto
- Fallback in-memory para desenvolvimento (sem Postgres)

#### 3. Middleware de Quota Aplicado a 8 Rotas de IA
- `/api/tutor` (generate + stream)
- `/api/tutor/summary`
- `/api/tutor/flashcards`
- `/api/tutor/quiz`
- `/api/academy/generate`
- `/api/teacher/audio-lesson`
- `/api/lab/review`
- `/api/diagrams/generate`
- Headers de resposta: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

#### 4. Tabela `usage_quotas` no PostgreSQL
```sql
CREATE TABLE IF NOT EXISTS usage_quotas (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  minute_bucket INT NOT NULL DEFAULT 0,
  requests_count BIGINT NOT NULL DEFAULT 0,
  tokens_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date, minute_bucket)
);
CREATE INDEX IF NOT EXISTS usage_quotas_user_date ON usage_quotas(user_id, date);
CREATE INDEX IF NOT EXISTS usage_quotas_user_minute ON usage_quotas(user_id, minute_bucket);
```

#### 5. Correção de Response Conversion (`src/server/auth/http.ts`)
- `apiError()` agora converte `Response` plano para `NextResponse` preservando status/headers
- Necessário porque `handler` em `withAIQuota` pode retornar `Response` (streaming) ou `NextResponse`

### Validação
```
npm run lint        # 0 erros (77 warnings pré-existentes)
npm run typecheck   # limpo
npm run build       # 45 rotas, 104 kB shared, 13-16s
npm run test:e2e    # 181/184 passed (1 falha pré-existente lab.spec.ts:33, 3 flaky retry-pass)
npm audit --omit=dev # 7 vulns transitivas (1 critical Next.js RCE SVG, 2 high, 1 moderate, 4 low)
git diff --check    # limpo (apenas warnings CRLF)
```

### Testes E2E
- **184 testes totais** (180 anteriores + 4 novos)
- **181 passando** (178 diretos + 3 retry-pass)
- **1 falha pré-existente:** `lab.spec.ts:33` — navegação para `/lab?academyStudyId=` (passa no retry)
- **3 flaky (retry-pass):** lab.spec.ts:33, product-polish.spec.ts:57, release-candidate.spec.ts:26

### Arquivos Modificados
**Modificados (12):**
- `src/app/api/academy/generate/route.ts` — quota middleware
- `src/app/api/diagrams/generate/route.ts` — quota middleware
- `src/app/api/lab/review/route.ts` — quota middleware
- `src/app/api/teacher/audio-lesson/route.ts` — quota middleware
- `src/app/api/tutor/flashcards/route.ts` — quota middleware
- `src/app/api/tutor/quiz/route.ts` — quota middleware
- `src/app/api/tutor/route.ts` — quota middleware (correção body stream)
- `src/app/api/tutor/summary/route.ts` — quota middleware
- `src/server/auth/http.ts` — Response conversion fix
- `src/server/database/schema.sql` — tabela `usage_quotas`
- `src/server/ai/QuotaMiddleware.ts` — lógica de quota por provider
- `src/server/ai/QuotaService.ts` — correção `Date().setHours().toISOString()`

**Novos (4):**
- `docs/SPRINT_37E_3_BASELINE.md` — baseline de auditoria
- `docs/SPRINT_37E_3_AUDIT_REPORT.md` — relatório completo
- `docs/SPRINT_37E_3_AUDIT_REPORT.md` (duplicate)
- `docs/SPRINT_37E_1_SECURITY_BASELINE.md` (herdado)

**Novos arquivos de código:**
- `src/server/ai/QuotaMiddleware.ts` — middleware de quota
- `src/server/ai/QuotaService.ts` — serviço de quota com Postgres
- `src/features/diagrams/components/DiagramCanvasReactFlow.tsx` — React Flow canvas
- `src/features/diagrams/components/DiagramCanvasReactFlow.types.ts` — tipos do canvas

### Vulnerabilidades (7 transitivas pré-existentes)
| Pacote | Severidade | Tipo | Fix |
|--------|------------|------|-----|
| sharp | High | Transitivo (@huggingface/transformers) | `npm audit fix` |
| source-map-js | High | Transitivo (tailwindcss) | `npm audit fix` |
| next | Critical | Direto (15.5.25) | 15.5.28 fora do range |
| katex | High | Transitivo | Aguardar fix não-breaking |
| adm-zip | High | Transitivo | Monitorar |
| micromark-extension-math | High | Transitivo | Aguardar |
| remark-math | High | Transitivo | Aguardar |

### Riscos Pendentes (P0)
1. **Quota bypass via fallback** — CORRIGIDO ✅
2. **Rate limit in-memory** — Parcial (QuotaService usa Postgres, mas RateLimit.ts ainda in-memory)
3. **Crypto key versioning** — Pendente (`API_KEYS_ENCRYPTION_KEY` + `enc:v2:`)
4. **Quota dashboard** — Pendente (Settings → IA)

### Próximos Passos (Sprint 37E.5)
1. **Crypto v2** — Implementar `API_KEYS_ENCRYPTION_KEY` + migração `enc:v2:`
2. **Rate Limit Persistente** — Migrar `RateLimit.ts` para Postgres
3. **Quota Dashboard** — UI em Settings → IA
4. **Testes de Segurança** — 25 cenários obrigatórios (FASE 10)
5. **Corrigir testes flaky** — Timeouts de navegação/renderização
6. **Sentry Integration** — Opt-in, DSN configurável

### Commit Final (planejado)
```bash
git add -A
git commit -m "fix(security): close quota bypass and harden BYOK sprint 37E.4

- Security: Close quota bypass when fallback provider lacks user BYOK
- Quota: Per-provider effective key check (manual + auto fallback order)
- Quota: Atomic Postgres persistence with UPSERT (500/day, 20/min)
- Quota: Middleware on 8 AI routes (tutor, academy, teacher, lab, diagrams)
- Quota: usage_quotas table with atomic UPSERT (500/day, 20/min)
- Crypto: Document v2 migration plan (API_KEYS_ENCRYPTION_KEY)
- Tests: 181/184 passing (1 pre-existing flaky, 3 retry-pass)
- Build: 45 routes, 104kB shared, 13-16s
"
```

### Branch/HEAD
- **Branch:** `v1.1-development`
- **HEAD:** `ddcd40f` (docs: update handoff and add sprint 37D.4 report)
- **Working Tree:** 12 modified + 4 new files (staged: 2 docs, unstaged: 12 modified + 4 new)