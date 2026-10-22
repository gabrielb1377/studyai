# Sprint 37E.3 Baseline — StudyAI V1.1

**Date:** 2026-10-21  
**Branch:** `v1.1-development`  
**Commit:** `ddcd40f` — `docs: update handoff and add sprint 37D.4 report`  
**Working Tree:** Clean (with uncommitted changes from Sprint 37E.1-37E.2)

---

## 1. Baseline Metrics

| Metric | Value |
|--------|-------|
| **Branch** | `v1.1-development` |
| **HEAD** | `ddcd40f` — `docs: update handoff and add sprint 37D.4 report` |
| **Node.js** | 24.18.0 |
| **Next.js** | 15.5.25 |
| **React** | 19.2.8 |
| **TypeScript** | 5.9.3 |
| **Routes** | 45 (app router) |
| **First Load JS Shared** | 104 kB |
| **Tests (E2E)** | 184 total, 181 passing (1 failed pre-existing, 3 flaky retry-pass) |
| **Vulnerabilities** | 7 total (4 low, 1 moderate, 2 high) |
| **Lint** | 0 errors, 76 warnings (pre-existing) |
| **Typecheck** | Clean |
| **Build** | ✅ 13-16s, 45 routes, 104 kB shared |
| **Audit** | 7 vulnerabilities (4 low, 1 moderate, 2 high) |
| **Diff Check** | Clean (CRLF warnings only) |

---

## 2. Vulnerabilities (npm audit --omit=dev)

| Package | Severity | Type | Advisory | Fix Available |
|---------|----------|------|----------|---------------|
| **sharp** | High | Transitive (@huggingface/transformers) | CVE-2026-96889 (librsvg) | `npm audit fix` |
| **source-map-js** | High | Transitive | GHSA-68fv-2mgg-jv7q (DoS) | `npm audit fix` |
| **next** | Moderate | Direct | GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p (cache poisoning) | Next.js 15.5.28 (outside range) |
| **katex** | High | Transitive (rehype-katex, micromark-extension-math, remark-math) | GHSA-238p-pmpm-9mq7 (prototype pollution) | rehype-katex@1.2.0 (breaking) |
| **adm-zip** | High | Transitive | — | — |
| **micromark-extension-math** | High | Transitive (depends on katex) | — | — |
| **remark-math** | High | Transitive (depends on micromark-extension-math) | — | — |

**Total:** 7 vulnerabilities (4 low, 1 moderate, 2 high)

**Fix Strategy:**
- `sharp` → `npm audit fix` (non-breaking)
- `source-map-js` → `npm audit fix` (non-breaking)
- `next` → Stay on 15.5.25 (15.5.28 outside range)
- `katex`/`rehype-katex`/`remark-math` → Wait for non-breaking fix; document mitigation
- `adm-zip` → Monitor; transitive

---

## 3. Security Components Baseline

### 3.1 Crypto (`src/server/security/Crypto.ts`)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Algorithm** | AES-256-GCM | ✅ Strong |
| **Key Derivation** | scrypt (AUTH_SECRET + fixed salt) | ⚠️ Uses AUTH_SECRET directly |
| **IV** | 12 bytes random (crypto.randomBytes) | ✅ Unique per operation |
| **Auth Tag** | Included in ciphertext format | ✅ |
| **Format** | `enc:v1:iv:tag:ciphertext` (base64url) | ✅ |
| **Key Derivation** | scrypt(AUTH_SECRET, fixed salt) | ⚠️ No versioning; rotation invalidates all |
| **Secret Source** | AUTH_SECRET (single master secret) | ⚠️ Single point of failure |
| **Versioning** | None (`enc:v1:`) | ⚠️ No migration path |

**Key Concerns:**
1. Single master secret (AUTH_SECRET) used for both JWT signing AND API key encryption
2. No key versioning → rotation invalidates all encrypted API keys
3. No separate `API_KEYS_ENCRYPTION_KEY` variable
4. Salt is fixed (`studyai-api-key-encryption-v1`) — not rotated

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
| **Quota Enforcement** | ❌ Not implemented | ❌ Missing |

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
| **Quota Tracking** | ❌ Not implemented | ❌ |

### 3.4 Rate Limiting (`src/server/security/RateLimit.ts`)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Storage** | In-memory Map | ❌ Not persistent; lost on reload |
| **Scope** | Per-key (user/action) | ✅ |
| **Quota Persistence** | ❌ In-memory only | ❌ |
| **Concurrency** | Race condition possible | ⚠️ Non-atomic |
| **Distributed** | ❌ In-memory only | ❌ |

### 3.5 Database Schema (`schema.sql`)

| Table | Status | Notes |
|-------|--------|-------|
| `user_api_keys` | ✅ Exists | PK (user_id, provider) |
| `usage_quotas` | ❌ Missing | Not created |
| `usage_quotas` indexes | N/A | N/A |
| Quota columns | Missing | No daily/minute tracking |

---

## 4. Vulnerability Assessment

### 4.1 Exploitable (P0)

| # | Component | Issue | Severity | Exploitability |
|---|-----------|-------|----------|----------------|
| 1 | **Quota System** | No quota enforcement on shared AI keys | Critical | High — unlimited consumption |
| 2 | **Rate Limiting** | In-memory only; no persistence | High | Medium — bypass on restart |
| 3 | **Crypto Key** | Single AUTH_SECRET for JWT + encryption | High | Medium — rotation invalidates all |
| 4 | **Crypto Versioning** | No versioning; rotation breaks all | High | Medium |
| 5 | **Rate Limit** | In-memory Map; race conditions | Medium | High — race conditions |

### 4.2 Potentially Exploitable (P1)

| # | Component | Issue | Severity |
|---|-----------|-------|----------|
| 6 | Rate Limiting | In-memory only; not distributed | Medium |
| 7 | BYOK Validation | Weak prefix-only checks | Low |
| 8 | Crypto Versioning | No migration path | Medium |
| 9 | Fallback Logic | No cost tracking on provider switch | Low |

### 4.3 Transitively Affected (P2)

| Package | Severity | Impact on StudyAI |
|---------|----------|-------------------|
| sharp | High | Image processing (OCR Pro) — transitive via @huggingface/transformers |
| source-map-js | High | Build tooling — DoS via malformed source maps |
| next.js | Moderate | Cache poisoning (self-hosted only) |
| katex | High | Math rendering — prototype pollution |
| adm-zip | High | Transitive |

---

## 5. Quota System Baseline

### 5.1 Current State

| Feature | Status | Notes |
|---------|--------|-------|
| Daily quota (500/day) | ❌ Not implemented | Handoff claims implemented |
| Minute quota (20/min) | ❌ Not implemented | Only set/test rate limited |
| Per-user tracking | ❌ Not implemented | In-memory only |
| Per-provider tracking | ❌ Not implemented | |
| Daily reset | ❌ Not implemented | |
| Persistence | ❌ In-memory Map only | Lost on reload |
| BYOK exemption | ⚠️ Partial | Only API key resolution logic |
| Usage dashboard | ❌ Missing | Handoff claims implemented |

### 5.2 Where Quotas Should Apply

| Route | Current | Required |
|-------|---------|----------|
| `/api/tutor` | ❌ | ✅ |
| `/api/tutor/stream` | ❌ | ✅ |
| `/api/tutor/summary` | ❌ | ✅ |
| `/api/tutor/flashcards` | ❌ | ✅ |
| `/api/tutor/quiz` | ❌ | ✅ |
| `/api/academy/generate` | ❌ | ✅ |
| `/api/teacher/audio-lesson` | ❌ | ✅ |
| `/api/lab/review` | ❌ | ✅ |
| `/api/ai/manager` | ❌ | ✅ |

---

## 6. Security Gaps Summary

| Category | Gap Count | Priority |
|----------|-----------|----------|
| **Quota System** | 8 missing features | P0 |
| **Rate Limiting** | 5 gaps | P0 |
| **Crypto/Key Management** | 4 gaps | P0 |
| **User Isolation** | 3 gaps | P0 |
| **Document Security** | 5 gaps | P1 |
| **AI Core** | 4 gaps | P1 |
| **Observability** | 3 gaps | P1 |
| **Dependencies** | 7 vulns | P0-P2 |

---

## 6. Recommended Fix Priority

### P0 — Immediate (This Sprint)

1. **Implement `usage_quotas` table** with daily/minute tracking
2. **Persist rate limits** in PostgreSQL (atomic operations)
3. **Enforce quotas** on all AI routes (generate/stream)
4. **Add `API_KEYS_ENCRYPTION_KEY`** env var (separate from AUTH_SECRET)
5. **Add crypto versioning** to encrypted payloads
6. **Enforce quotas** on all AI routes (generate/stream)
7. **Implement per-user daily/minute quotas** with atomic PostgreSQL operations
8. **Add quota dashboard** in Settings → IA

### P1 — This Sprint

1. Add `usage_quotas` table with indexes
2. Implement quota middleware for AI routes
3. Add quota dashboard UI
4. Fix rate limiting persistence
5. BYOK validation improvements
6. Add crypto versioning (`enc:v2:`) for migration path

### P2 — Next Sprint

1. Crypto versioning/migration
2. Advanced BYOK validation
3. Distributed rate limiting (if multi-instance)
4. Advanced observability (local-first)

---

## 7. Test Coverage Baseline

| Area | Tests | Coverage |
|------|-------|----------|
| Crypto (encrypt/decrypt) | 0 | 0% |
| API Key CRUD | 0 | 0% |
| Quota enforcement | 0 | 0% |
| User isolation | 0 | 0% |
| Rate limiting | 0 | 0% |
| BYOK validation | 0 | 0% |
| Document sanitization | 0 | 0% |

---

## 8. Current Test Status

| Test Suite | Status |
|------------|--------|
| **Total Tests** | 184 |
| **Passed** | 181 |
| **Failed** | 1 (pre-existing: `lab.spec.ts:33`) |
| **Flaky (retry-pass)** | 3 (lab.spec.ts:33, product-polish.spec.ts:57, release-candidate.spec.ts:26) |
| **Pass Rate** | 98.9% |

**Pre-existing Flaky Test:** `lab.spec.ts:33` — `Academy abre exercício no Lab, executa em sandbox, corrige e atualiza o Learning Engine` (passes on retry)

**Flaky Tests (retry-pass):**
1. `lab.spec.ts:33` — Academy/Lab integration (navigation to /lab?academyStudyId=)
2. `product-polish.spec.ts:57` — Local data isolation on login/logout (heading visibility timing)
3. `release-candidate.spec.ts:26` — Beta Ready advanced diagnostics (button visibility timing)

**New Test Discovery:** 184 tests total (180 previously reported + 4 new tests added)

---

## 9. Key Files Modified Since Sprint 37D.4

### Modified (from Sprint 37E.1-37E.2)
- `src/app/api/academy/generate/route.ts` — quota middleware integration
- `src/app/api/diagrams/generate/route.ts` — quota middleware integration
- `src/app/api/lab/review/route.ts` — quota middleware integration
- `src/app/api/teacher/audio-lesson/route.ts` — quota middleware integration
- `src/app/api/tutor/flashcards/route.ts` — quota middleware integration
- `src/app/api/tutor/quiz/route.ts` — quota middleware integration
- `src/app/api/tutor/route.ts` — quota middleware integration
- `src/app/api/tutor/summary/route.ts` — quota middleware integration
- `src/server/auth/http.ts` — Response conversion fix
- `src/server/database/schema.sql` — `usage_quotas` table added

### New Files (from Sprint 37E.1-37E.2)
- `docs/SPRINT_37E_1_SECURITY_BASELINE.md` — Security audit baseline
- `src/features/diagrams/components/DiagramCanvasReactFlow.tsx` — React Flow canvas
- `src/features/diagrams/components/DiagramCanvasReactFlow.types.ts` — Canvas types
- `src/server/ai/QuotaMiddleware.ts` — Quota enforcement middleware
- `src/server/ai/QuotaService.ts` — Quota service with PostgreSQL persistence

---

## 10. Known Risks & Pending Items

| Item | Risk | Status |
|------|------|--------|
| React Flow integration | Medium | Adapter ready; activate in Sprint 37E.3 |
| Quota BYOK in memory | Medium | Persisted in Postgres; rate limit in generate/stream |
| Vulnerabilities (transitive) | Low | Documented; no `audit fix --force` |
| Flaky test `lab.spec.ts` | Low | Pre-existing; passes on retry |
| Crypto key versioning | Medium | No `API_KEYS_ENCRYPTION_KEY`; rotation breaks all |
| Quota dashboard | Medium | Not implemented |

---

## 11. Next Steps (Sprint 37E.3)

1. **Complete Phase 1-2 Audit** — Baseline documented, vulnerabilities classified, gaps identified
2. **Implement `usage_quotas` table** — Daily/minute tracking with atomic Postgres ops
3. **Persist rate limits** — PostgreSQL with atomic operations
4. **Enforce quotas** — Middleware on all AI routes (generate/stream)
4. **Add `API_KEYS_ENCRYPTION_KEY`** — Separate from AUTH_SECRET
5. **Add crypto versioning** — `enc:v2:` for migration path
6. **Fix rate limiting persistence** — PostgreSQL with atomic operations
7. **BYOK validation improvements** — Beyond prefix checks
7. **Add quota dashboard** — Settings → IA
8. **Investigate flaky tests** — Root cause and fix
9. **Validate React Flow integration** — Critical path testing
10. **Validate Cloud Sync** — Offline/online scenarios

---

**Next Action:** Begin Phase 2 — Vulnerability investigation and Phase 3 — BYOK/Quota implementation.