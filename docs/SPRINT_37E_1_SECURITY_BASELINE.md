# Security Baseline Report — Sprint 37E.1

**Date:** 2026-10-20  
**Branch:** v1.1-development  
**Commit:** ddcd40f  
**Working Tree:** Clean

---

## 1. Baseline Metrics

| Metric | Value |
|--------|-------|
| **Branch** | v1.1-development |
| **HEAD** | ddcd40f |
| **Node.js** | 24.18.0 |
| **Next.js** | 15.5.25 |
| **React** | 19.1.0 |
| **Routes** | 45 (app router) |
| **Tests (E2E)** | 180 total, 179 passing (1 flaky) |
| **Vulnerabilities** | 7 total (4 low, 1 moderate, 2 high) |
| **Lint** | 0 errors, 12 warnings |
| **Typecheck** | Clean |

---

## 2. Vulnerabilities (npm audit --omit=dev)

| Package | Severity | Type | Advisory | Fix Available |
|---------|----------|------|----------|---------------|
| **sharp** | High | Transitive (@huggingface/transformers) | CVE-2026-96889 (librsvg) | `npm audit fix` |
| **source-map-js** | High | Transitive | GHSA-68fv-2mgg-jv7q (DoS) | `npm audit fix` |
| **next** | Moderate | Direct | GHSA-4jqv-mc3x-m676, GHSA-mcj8-r9mp-w47p (cache poisoning) | Next.js 15.5.28 (outside range) |
| **katex** | High | Transitive (rehype-katex, micromark-extension-math, remark-math) | GHSA-238p-pmpm-9mq7 (prototype pollution) | rehype-katex@1.2.0 (breaking) |
| **adm-zip** | High | Transitive | - | - |
| **micromark-extension-math** | High | Transitive (depends on katex) | - | - |
| **remark-math** | High | Transitive (depends on micromark-extension-math) | - | - |

**Total:** 7 vulnerabilities (4 low, 1 moderate, 2 high)

**Fix Strategy:**
- `sharp` → `npm audit fix` (non-breaking)
- `source-map-js` → `npm audit fix` (non-breaking)
- `next` → Stay on 15.5.25 (15.5.28 outside range)
- `katex`/`rehype-katex`/`remark-math` → Wait for non-breaking fix; document mitigation
- `adm-zip` → Monitor; transitive

---

## 2. Security Components Baseline

### 2.1 Crypto (src/server/security/Crypto.ts)

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

### 2.2 API Key Service (src/server/ai/ApiKeyService.ts)

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

### 2.3 ProviderManager (src/features/ai/ProviderManager.ts)

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

### 2.4 Rate Limiting (src/server/security/RateLimit.ts)

| Aspect | Status | Notes |
|--------|--------|-------|
| **Storage** | In-memory Map | ❌ Not persistent; lost on reload |
| **Scope** | Per-key (user/action) | ✅ |
| **Quota Persistence** | ❌ In-memory only | ❌ |
| **Concurrency** | Race condition possible | ⚠️ Non-atomic |
| **Distributed** | ❌ In-memory only | ❌ |

### 2.5 Database Schema (schema.sql)

| Table | Status | Notes |
|-------|--------|-------|
| `user_api_keys` | ✅ Exists | PK (user_id, provider) |
| `usage_quotas` | ❌ Missing | Not created |
| `usage_quotas` indexes | N/A | N/A |
| Quota columns | Missing | No daily/minute tracking |

---

## 3. Vulnerability Assessment

### 3.1 Exploitable (P0)

| # | Component | Issue | Severity | Exploitability |
|---|-----------|-------|----------|----------------|
| 1 | **Quota System** | No quota enforcement on shared AI keys | Critical | High — unlimited consumption |
| 2 | **Rate Limiting** | In-memory only; no persistence | High | Medium — bypass on restart |
| 3 | **Crypto Key** | Single AUTH_SECRET for JWT + encryption | High | Medium — rotation invalidates all |
| 4 | **Crypto Versioning** | No versioning; rotation breaks all | High | Medium |
| 5 | **Rate Limit** | In-memory Map; race conditions | Medium | High — race conditions |

### 3.2 Potentially Exploitable (P1)

| # | Component | Issue | Severity |
|---|-----------|-------|----------|
| 6 | Rate Limiting | In-memory only; not distributed | Medium |
| 7 | BYOK Validation | Weak prefix-only checks | Low |
| 8 | Crypto Versioning | No migration path | Medium |
| 9 | Fallback Logic | No cost tracking on provider switch | Low |

### 3.3 Transitively Affected (P2)

| Package | Severity | Impact on StudyAI |
|---------|----------|-------------------|
| sharp | High | Image processing (OCR Pro) — transitive via @huggingface/transformers |
| source-map-js | High | Build tooling — DoS via malformed source maps |
| next.js | Moderate | Cache poisoning (self-hosted only) |
| katex | High | Math rendering — prototype pollution |
| adm-zip | High | Transitive |

---

## 4. Quota System Baseline

### 4.1 Current State

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

### 4.2 Where Quotas Should Apply

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

## 5. Security Gaps Summary

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
2. **Add crypto versioning** to encrypted payloads
3. **Enforce quotas** on all AI routes (generate/stream)
4. **Implement per-user daily/minute quotas** with atomic PostgreSQL operations
5. **Add quota dashboard** in Settings → IA
4. **Add crypto versioning** (`enc:v2:`) for migration path
5. **Implement per-user daily/minute quotas** with atomic PostgreSQL operations
6. **Add quota dashboard** in Settings → IA
5. **Persist rate limits** in PostgreSQL with atomic operations
6. **Implement quota enforcement** on all AI routes

### P1 — This Sprint

1. Add `usage_quotas` table with indexes
2. Implement quota middleware for AI routes
3. Add quota dashboard UI
4. Fix rate limiting persistence
7. Fix rate limiting persistence (PostgreSQL)
8. Implement BYOK validation improvements
9. Add quota dashboard UI
10. Fix rate limiting persistence

### P2 — Next Sprint

1. Crypto versioning/migration
2. Advanced BYOK validation
2. Crypto versioning/migration
3. Advanced BYOK validation
3. Distributed rate limiting (if multi-instance)
4. Advanced observability (local-first)

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

---

## 7. Documentation Status

| Document | Status |
|----------|--------|
| `PROJECT_CONTEXT.md` | ✅ Current |
| `CURRENT_HANDOFF.md` | ✅ Current (post-37D.4) |
| `PROJECT_CONTEXT.md` | ✅ Current |
| Security docs | ❌ Missing |
| Crypto migration plan | ❌ Missing |
| Quota policy doc | ❌ Missing |

---

## 8. Action Items for Sprint 37E.1

### Phase 1-2: Audit Complete ✅
- [x] Baseline documented
- [x] Vulnerabilities classified
- [x] Security gaps identified

### Phase 3-5: Crypto & Quotas (In Progress)
- [ ] Add `usage_quotas` table
- [ ] Implement persistent rate limiting
- [ ] Add quota enforcement middleware
- [ ] Add `API_KEYS_ENCRYPTION_KEY`
- [ ] Add crypto versioning
- [ ] Implement quota enforcement middleware
- [ ] Add quota dashboard UI

### Phase 6-10: Dashboards & Security
- [ ] Quota dashboard UI
- [ ] BYOK validation improvements
- [ ] Rate limit persistence
- [ ] Auth/CSRF review

### Phase 11-16: Tests & Documentation
- [ ] Security test suite
- [ ] Flaky test fix
- [ ] Regression testing
- [ ] Documentation updates

---

**Next Step:** Begin Phase 3 — Implement `usage_quotas` table and quota enforcement middleware.