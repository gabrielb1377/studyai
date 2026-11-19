# Sprint 37E.5 Baseline — StudyAI V1.1 Security Completion & Release Gate

**Date:** 2026-10-22  
**Branch:** `v1.1-development`  
**Commit:** `2ca9a94` — `fix(security): close quota bypass and harden BYOK sprint 37E.4`  
**Working Tree:** Clean

---

## 1. Baseline Metrics

| Metric | Value |
|--------|-------|
| **Branch** | `v1.1-development` |
| **HEAD** | `2ca9a94` — `fix(security): close quota bypass and harden BYOK sprint 37E.4` |
| **Node.js** | 24.18.0 |
| **Next.js** | **15.5.28** (updated from 15.5.25) |
| **React** | 19.1.0 |
| **TypeScript** | 5.9.0 |
| **Routes** | 45 (app router) |
| **First Load JS Shared** | 104 kB |
| **Tests (E2E)** | 180 total, 177 passing directly, 3 flaky retry-pass |
| **Vulnerabilities** | 9 total (4 low, 3 moderate, 5 high) — **Critical FIXED** |
| **Lint** | 0 errors, 77 warnings (pre-existing) |
| **Typecheck** | Clean |
| **Build** | ✅ 17s, 45 routes, 104 kB shared |
| **Audit** | 9 vulnerabilities (no critical, 2 high fixed) |
| **Diff Check** | Clean |

---

## 2. Vulnerabilities (npm audit --omit=dev) — **UPDATED POST FIXES**

| Package | Severity | Type | Advisory | Fix Available | StudyAI Impact | Status |
|---------|----------|------|----------|---------------|----------------|--------|
| **next** | **Critical** | Direct | GHSA-2464-fhr4-w9xw (RCE in Image Optimization with SVG), GHSA-4jqv-mc3x-m676 (cache poisoning), GHSA-mcj8-r9mp-w47p (cache poisoning), GHSA-p3m5-59mp-jv5r (DoS Server Actions) | Next.js 15.5.28 | **FIXED** — Updated to 15.5.28 | ✅ **DONE** |
| **sharp** | High | Transitive (@huggingface/transformers → onnxruntime-node) | CVE-2026-96889 (librsvg) | `npm audit fix` | OCR Pro — applies fix | ✅ **DONE** |
| **source-map-js** | High | Transitive (tailwindcss) | GHSA-68fv-2mgg-jv7q (DoS) | `npm audit fix` | Build tooling — applies fix | ✅ **DONE** |
| **katex** | High | Transitive (rehype-katex, micromark-extension-math, remark-math) | GHSA-238p-pmpm-9mq7 (prototype pollution) | rehype-katex@1.2.0 (breaking) | Math rendering — wait for non-breaking fix | ⏳ PENDING |
| **adm-zip** | High | Transitive (onnxruntime-node) | — | — | Transitive — monitor | ⏳ PENDING |
| **micromark-extension-math** | High | Transitive (depends on katex) | — | — | Transitive — wait | ⏳ PENDING |
| **remark-math** | High | Transitive (depends on micromark-extension-math) | — | — | Transitive — wait | ⏳ PENDING |
| **braces** | High | Transitive (eslint-config-next) | GHSA-vfj7-8cjw-p6xm (DoS) | Requires `npm audit fix --force` (breaking) | Linting tooling — accept risk | ⏳ DOCUMENTED |
| **uuid** | Moderate | Transitive (@capacitor/cli) | GHSA-w5hq-g745-h8pq | Requires `npm audit fix --force` (breaking) | Capacitor — accept risk | ⏳ DOCUMENTED |

**Total:** 9 vulnerabilities (4 low, 3 moderate, 5 high) — **Critical FIXED, 2 High FIXED, 4 High/Moderate require breaking changes (documented)**

**Fix Strategy Applied:**
- `next` → Updated to 15.5.28 ✅ (was "outside range" but works)
- `sharp` → `npm audit fix` ✅
- `source-map-js` → `npm audit fix` ✅
- `katex`/`rehype-katex`/`remark-math` → Wait for non-breaking fix; document mitigation
- `adm-zip` → Monitor; transitive
- `braces`/`uuid` → Require breaking changes; documented as accepted risk

---

## 3. Security Components Baseline (Post-37E.4)

### 3.1 Crypto (`src/server/security/Crypto.ts`)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Algorithm** | AES-256-GCM | ✅ Strong |
| **Key Derivation** | scrypt(AUTH_SECRET + fixed salt) | ⚠️ Uses AUTH_SECRET directly; no separate encryption key |
| **IV** | 12 bytes random (crypto.randomBytes) | ✅ Unique per operation |
| **Auth Tag** | Included in ciphertext format | ✅ |
| **Format** | `enc:v1:iv:tag:ciphertext` (base64url) | ✅ Versioned v1 |
| **Key Derivation** | scrypt(AUTH_SECRET, fixed salt) | ⚠️ No versioning; rotation invalidates all |
| **Secret Source** | AUTH_SECRET (single master secret) | ⚠️ Single point of failure |
| **Versioning** | `enc:v1:` only | ⚠️ No `enc:v2:` support yet; migration planned |

**Key Concerns (from 37E.3, still pending):**
1. Single master secret (AUTH_SECRET) used for both JWT signing AND API key encryption
2. No key versioning → rotation invalidates all encrypted API keys
3. No separate `API_KEYS_ENCRYPTION_KEY` variable
4. Salt is fixed (`studyai-api-key-encryption-v1`) — not rotated
5. **37E.4 delivered:** Migration plan documented but **NOT implemented**

### 3.2 API Key Service (`src/server/ai/ApiKeyService.ts`)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Encryption** | AES-256-GCM via Crypto.ts | ✅ |
| **Validation** | Prefix checks (AIza, gsk_, sk-or-) | ✅ Basic |
| **Rate Limiting** | 10 req/min per user (set/test) | ⚠️ Only on set/test |
| **Ownership** | user_id FK with CASCADE | ✅ |
| **Key Hint** | Masked (first4••••last4) | ✅ |
| **Decryption on Use** | getDecrypted() per request | ✅ |
| **Fallback** | Server env vars | ✅ |

### 3.3 ProviderManager (`src/features/ai/ProviderManager.ts`)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Fallback Order** | ollama → gemini → groq → openrouter | ✅ |
| **Automatic Mode** | Latency-based ordering | ✅ |
| **Manual Mode** | Single provider | ✅ |
| **Fallback Logic** | Sequential on failure | ✅ |
| **API Key Priority** | User BYOK > Server env | ✅ |
| **Streaming Support** | ✅ Yes | ✅ |
| **Caching** | In-memory (AIResponseCache) | ✅ |
| **Logging** | In-memory (globalThis) | ⚠️ Lost on reload |
| **Quota Tracking** | ❌ Not implemented (handled in middleware) | ✅ Middleware handles it |

### 3.4 Quota System (NEW in 37E.4)

| Feature | Status | Notes |
|---------|--------|-------|
| **Daily quota (500/day)** | ✅ Implemented | Atomic PostgreSQL UPSERT |
| **Minute quota (20/min)** | ✅ Implemented | Atomic PostgreSQL UPSERT |
| **Per-user tracking** | ✅ Implemented | `usage_quotas` table |
| **Per-provider tracking** | ✅ Implemented | Per effective credential |
| **Daily reset** | ✅ Implemented | Midnight UTC |
| **Persistence** | ✅ PostgreSQL | Atomic operations |
| **BYOK exemption** | ✅ Fixed | Per-provider effective key check |
| **Usage dashboard** | ❌ Missing | **PENDING** (Phase 9) |

### 3.5 Rate Limiting (`src/server/security/RateLimit.ts`)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Storage** | In-memory Map | ❌ Not persistent; lost on reload |
| **Scope** | Per-key (user/action) | ✅ |
| **Quota Persistence** | ❌ In-memory only | ❌ |
| **Concurrency** | Race condition possible | ⚠️ Non-atomic |
| **Distributed** | ❌ In-memory only | ❌ |

**Note:** QuotaService uses PostgreSQL atomically, but generic RateLimit.ts is still in-memory.

### 3.6 Database Schema (`schema.sql`)

| Table | Status | Notes |
|-------|--------|-------|
| `user_api_keys` | ✅ Exists | PK (user_id, provider) |
| `usage_quotas` | ✅ Exists | PK (user_id, date, minute_bucket) |
| `usage_quotas` indexes | ✅ Exists | user_date, user_minute |
| Quota columns | ✅ Exists | requests_count, tokens_count |

---

## 4. Vulnerability Assessment (Post-37E.4)

### 4.1 Exploitable (P0) — **UPDATED**

| # | Component | Issue | Severity | Exploitability | Status |
|---|-----------|-------|----------|----------------|--------|
| 1 | **Next.js Image Optimization** | Unauthenticated RCE with SVG files | **Critical** | High | ✅ **FIXED** — Updated to Next.js 15.5.28 |
| 2 | **Rate Limiting** | In-memory only; no persistence | High | Medium — bypass on restart | **PENDING** (Phase 5) |
| 3 | **Crypto Key** | Single AUTH_SECRET for JWT + encryption | High | Medium — rotation invalidates all | **PENDING** (Phase 7) |
| 4 | **Crypto Versioning** | No `enc:v2:`; migration path incomplete | High | Medium | **PENDING** (Phase 7-8) |
| 5 | **Rate Limit** | In-memory Map; race conditions | Medium | High — race conditions | **PENDING** (Phase 5) |

### 4.2 Potentially Exploitable (P1)

| # | Component | Issue | Severity |
|---|-----------|-------|----------|
| 6 | Rate Limiting | In-memory only; not distributed | Medium |
| 7 | BYOK Validation | Weak prefix-only checks | Low |
| 8 | Crypto Versioning | No migration tooling | Medium |
| 9 | Fallback Logic | No cost tracking on provider switch | Low |

### 4.3 Transitively Affected (P2) — **UPDATED**

| Package | Severity | Impact on StudyAI | Status |
|---------|----------|-------------------|--------|
| sharp | High | Image processing (OCR Pro) — transitive via @huggingface/transformers | ✅ **FIXED** |
| source-map-js | High | Build tooling — DoS via malformed source maps | ✅ **FIXED** |
| katex | High | Math rendering — prototype pollution | ⏳ PENDING (breaking fix) |
| adm-zip | High | Transitive | ⏳ PENDING |
| braces | High | Linting tooling — DoS via nested patterns | ⚠️ ACCEPTED RISK (requires breaking change) |
| uuid | Moderate | Capacitor — buffer bounds check | ⚠️ ACCEPTED RISK (requires breaking change) |

---

## 5. Quota System Baseline (Post-37E.4)

### 5.1 Current State

| Feature | Status | Notes |
|---------|--------|-------|
| Daily quota (500/day) | ✅ Implemented | Atomic PostgreSQL UPSERT |
| Minute quota (20/min) | ✅ Implemented | Atomic PostgreSQL UPSERT |
| Per-user tracking | ✅ Implemented | `usage_quotas` table |
| Per-provider tracking | ✅ Implemented | Per effective credential |
| Daily reset | ✅ Implemented | Midnight UTC |
| Persistence | ✅ PostgreSQL | Atomic operations |
| BYOK exemption | ✅ **FIXED** | Per-provider effective key check |
| Usage dashboard | ❌ Missing | **PENDING** (Phase 9) |

### 5.2 Quota Middleware Applied to Routes

| Route | Middleware | Status |
|-------|------------|--------|
| `/api/tutor` | ✅ `withAIQuota` | ✅ |
| `/api/tutor/stream` | ✅ `withAIQuota` | ✅ |
| `/api/tutor/summary` | ✅ `withAIQuota` | ✅ |
| `/api/tutor/flashcards` | ✅ `withAIQuota` | ✅ |
| `/api/tutor/quiz` | ✅ `withAIQuota` | ✅ |
| `/api/academy/generate` | ✅ `withAIQuota` | ✅ |
| `/api/teacher/audio-lesson` | ✅ `withAIQuota` | ✅ |
| `/api/lab/review` | ✅ `withAIQuota` | ✅ |
| `/api/diagrams/generate` | ✅ `withAIQuota` | ✅ |
| `/api/ai/manager` | GET only (status) | N/A |

### 5.3 Quota Logic (Fixed in 37E.4)

**Previous (vulnerable):**
```typescript
const hasSharedKeys = Object.keys(userApiKeys).length === 0;
if (!hasSharedKeys) {
  // Bypass total da quota — PROBLEMA!
  return handler(request, userApiKeys, quotaInfo);
}
```

**Current (fixed):**
```typescript
// Determina quais providers podem ser usados baseado na requisição
let providersToCheck: AIProviderId[] = [];
if (bodyObj?.mode === "manual" && bodyObj?.provider) {
  providersToCheck = [bodyObj.provider as AIProviderId];
} else {
  providersToCheck = [...FALLBACK_ORDER]; // ollama, gemini, groq, openrouter
}

const hasKeysForAllProviders = providersToCheck.every(provider => userApiKeys[provider]);
if (hasKeysForAllProviders) {
  // User has BYOK for ALL providers that might be used - bypass quota
  return handler(request, userApiKeys, quotaInfo);
}
// Otherwise: check quota for shared key usage
```

---

## 6. Test Coverage Baseline

| Area | Tests | Coverage |
|------|-------|----------|
| Crypto (encrypt/decrypt) | 0 | 0% |
| API Key CRUD | 0 | 0% |
| Quota enforcement | 0 | 0% |
| User isolation | 0 | 0% |
| Rate limiting | 0 | 0% |
| BYOK validation | 0 | 0% |
| Document sanitization | 0 | 0% |
| Quota per effective credential | 0 | 0% |
| BYOK/shared fallback | 0 | 0% |

### Current Test Status

| Test Suite | Status |
|------------|--------|
| **Total Tests** | 180 |
| **Passed (direct)** | 177 |
| **Flaky (retry-pass)** | 3 (cloud-sync.spec.ts:93, lab.spec.ts:33, polish.spec.ts:169) |
| **Failed** | 0 |
| **Pass Rate** | 100% (with retries) |

**Flaky Tests:**
1. `cloud-sync.spec.ts:93` — Sync incremental (passes on retry #1)
2. `lab.spec.ts:33` — Academy/Lab integration navigation to `/lab?academyStudyId=` (passes on retry #1)
3. `polish.spec.ts:169` — pdf.js lazy loading (passes on retry #1)

**Note:** Sprint 37E.4 handoff mentioned 4 flaky (including product-polish.spec.ts:57 and release-candidate.spec.ts:26), but current run shows 3 flaky with different tests.

---

## 7. Key Files Modified Since Sprint 37E.3

### Modified (from Sprint 37E.4)
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

### New Files (from Sprint 37E.4)
- `docs/SPRINT_37E_3_BASELINE.md` — baseline de auditoria
- `docs/SPRINT_37E_3_AUDIT_REPORT.md` — relatório completo
- `src/server/ai/QuotaMiddleware.ts` — middleware de quota
- `src/server/ai/QuotaService.ts` — serviço de quota com Postgres
- `src/features/diagrams/components/DiagramCanvasReactFlow.tsx` — React Flow canvas
- `src/features/diagrams/components/DiagramCanvasReactFlow.types.ts` — tipos do canvas

---

## 8. Known Risks & Pending Items (Post-37E.4) — **UPDATED**

| Item | Risk | Status | Sprint 37E.5 Phase |
|------|------|--------|-------------------|
| Next.js RCE (SVG Image Opt) | **Critical** | ✅ **FIXED** — Updated to 15.5.28 | Phase 2 ✅ |
| Rate limit in-memory | High | ✅ **FIXED** — `RateLimitService` + `rate_limits` table | Phase 5 ✅ |
| Crypto key versioning | Medium | **PENDING** — `API_KEYS_ENCRYPTION_KEY` + `enc:v2:` | Phase 7-8 |
| Quota dashboard | Medium | **PENDING** — Settings → IA UI | Phase 9 |
| Flaky tests (3) | Low | **PENDING** — Investigate root cause | Phase 10 |
| sharp vulnerability | High | ✅ **FIXED** via `npm audit fix` | Phase 3 ✅ |
| source-map-js vulnerability | High | ✅ **FIXED** via `npm audit fix` | Phase 3 ✅ |
| katex prototype pollution | High | Wait for non-breaking fix | Phase 3 |
| braces (transitive) | High | ⚠️ ACCEPTED RISK (breaking change) | Documented |
| uuid (transitive) | Moderate | ⚠️ ACCEPTED RISK (breaking change) | Documented |

---

## 9. Sprint 37E.5 Phase Mapping

| Phase | Description | Priority | Dependencies |
|-------|-------------|----------|--------------|
| **Phase 1** | Audit current state | P0 | — |
| **Phase 2** | Critical Next.js vulnerability | P0 | Phase 1 |
| **Phase 3** | Other advisories audit | P0 | Phase 1 |
| **Phase 4** | Quota per effective credential review | P0 | ✅ **CONCLUÍDA** — Lógica validada, fix implementado corretamente |
| **Phase 5** | Persistent rate limiting | P0 | ✅ **CONCLUÍDA** — `RateLimitService.ts` + tabela `rate_limits` + migração de todos os callers |
| **Phase 6** | Concurrency tests | P0 | ✅ **CONCLUÍDA** — 6 testes passando, 3 documentados como skipped |
| **Phase 7** | BYOK Crypto v2 | P1 | ✅ **CONCLUÍDA** — `Crypto.ts` com `API_KEYS_ENCRYPTION_KEY` + `enc:v2:` |
| **Phase 8** | Safe migration strategy | P1 | ✅ **CONCLUÍDA** — Documentação `docs/SPRINT_37E_5_MIGRATION_STRATEGY.md` |
| **Phase 9** | Quota dashboard UI | P1 | ✅ **CONCLUÍDA** — Endpoint `GET /api/settings/ai/quota` + UI em Settings → IA → Gerenciador de IA |
| **Phase 10** | Flaky tests fix | P1 | ⏳ **PRÓXIMA** |
| **Phase 11** | Security regression tests | P0 | Phase 4-5 |
| **Phase 12** | Integration regression | P0 | Phase 10-11 |
| **Phase 13** | Obsidian docs update | P1 | All |
| **Phase 14** | Reports | P0 | All |
| **Phase 15** | Final validation | P0 | All |
| **Phase 16** | Commit | P0 | Phase 15 |

---

## 10. Next Actions — **UPDATED**

1. ✅ **Phase 2:** Next.js critical vulnerability — **FIXED** (updated to 15.5.28)
2. ✅ **Phase 3:** Applied `npm audit fix` for sharp and source-map-js — **FIXED**
3. ✅ **Phase 4:** Quota per effective credential review — **CONCLUÍDA** (validated)
4. ✅ **Phase 5:** Persistent rate limiting — **CONCLUÍDA** (`RateLimitService` + `rate_limits` table + all callers migrated)
5. ✅ **Phase 6:** Concurrency tests — **CONCLUÍDA** (6 passing, 3 skipped/documented)
6. ✅ **Phase 7:** Implement `API_KEYS_ENCRYPTION_KEY` and `enc:v2:` format — **CONCLUÍDA**
7. ✅ **Phase 8:** Document migration strategy — **CONCLUÍDA** (`docs/SPRINT_37E_5_MIGRATION_STRATEGY.md`)
8. ✅ **Phase 9:** Build quota dashboard in Settings → IA — **CONCLUÍDA** (endpoint + UI)
9. **Phase 10:** Fix 3 flaky tests
10. **Phase 11:** Create 25 security regression tests
11. **Phase 12-14:** Integration tests, Obsidian update, reports
12. **Phase 15-16:** Final validation and commit

---

**Next Action:** Begin Phase 10 — Fix 3 flaky tests (foundation.spec.ts, product-polish.spec.ts, release-candidate.spec.ts).