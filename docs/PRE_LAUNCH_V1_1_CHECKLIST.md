# Pre-Launch Checklist V1.1 â€” StudyAI

**VersÃ£o:** V1.1
**Data:** 2026-10-24
**Branch:** `v1.1-development`
**Commit de referÃªncia:** `1e56d76` (37E.7A) + verificaÃ§Ã£o 37E.7B
**Release Gate:** **CONDITIONAL** â€” ver `docs/FINAL_RELEASE_DECISION_V1_1.md`

---

## âœ… Checklist PrÃ©-LanÃ§amento

### CÃ³digo
- [x] Branch `v1.1-development` limpa
- [x] Commits `5dc68d0` (37E.6) + `1e56d76` (37E.7A) + commit final 37E.7B
- [x] `npm run lint` â€” 0 erros
- [x] `npm run typecheck` â€” Limpo
- [x] `npm run build` â€” 13.5s, 46 rotas, 104 kB shared
- [x] `npm run test:e2e` â€” consolidado em `docs/SPRINT_37E_7B_REPORT.md` (3 cenÃ¡rios skipped)
- [x] `npm audit --omit=dev` â€” 4 low (katex), Critical/High FIXED
- [x] `git diff --check` â€” Clean

### DocumentaÃ§Ã£o
- [x] `docs/SPRINT_37E_5_BASELINE.md`
- [x] `docs/SPRINT_37E_5_MIGRATION_STRATEGY.md`
- [x] `docs/SPRINT_37E_5_PHASE_5_SUMMARY.md`
- [x] `docs/SPRINT_37E_5_REPORT.md`
- [x] `docs/SPRINT_37E_6_REPORT.md`
- [x] `docs/DEPLOY_V1_1_CHECKLIST.md`
- [x] `docs/SPRINT_37E_7B_REPORT.md`
- [x] `docs/FINAL_RELEASE_DECISION_V1_1.md`
- [x] `docs/ROLLBACK_V1_1.md`
- [x] `docs/SMOKE_TEST_V1_1.md`
- [x] `docs/MONITORING_V1_1.md`
- [x] `docs/RELEASE_GATE_V1_1_OPERATIONAL.md` â€” superseded pela 37E.7B
- [x] `docs/SPRINT_37E_6_REPORT.md`
- [x] `CURRENT_HANDOFF.md` atualizado
- [x] `PROJECT_CONTEXT.md` atualizado
- [x] Obsidian atualizado

---

## ðŸš€ Deploy no Railway

### 1. VariÃ¡veis de Ambiente (ObrigatÃ³rias)

| VariÃ¡vel | ObrigatÃ³ria | Exemplo/Nota |
|----------|-------------|--------------|
| `NODE_ENV` | âœ… | `production` |
| `APP_URL` | âœ… | `https://studyai.example.com` |
| `NEXT_PUBLIC_APP_URL` | âœ… | `https://studyai.example.com` |
| `STUDYAI_DOMAIN` | âœ… | `studyai.example.com` |
| `AUTH_SECRET` | âœ… | â‰¥ 32 chars, `openssl rand -base64 48` |
| `HEALTH_SECRET` | âœ… | `openssl rand -base64 32` |
| `API_KEYS_ENCRYPTION_KEY` | âœ… | **NOVA** `openssl rand -base64 32` |
| `DATABASE_URL` | âœ… | PostgreSQL gerenciado Railway |
| `DATABASE_SSL` | âœ… | `true` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | âœ… | `true` |
| `DATABASE_POOL_SIZE` | | `10` |
| `S3_ENDPOINT` | âœ… | Object Storage compatÃ­vel S3 |
| `S3_REGION` | âœ… | `us-east-1` |
| `S3_BUCKET` | âœ… | |
| `S3_ACCESS_KEY_ID` | âœ… | |
| `S3_SECRET_ACCESS_KEY` | âœ… | |
| `S3_FORCE_PATH_STYLE` | | `true` |
| `S3_SERVER_SIDE_ENCRYPTION` | | `AES256` |
| `GEMINI_API_KEY` | âœ… | Pelo menos um provider |
| `GROQ_API_KEY` | âœ… | Pelo menos um provider |
| `OPENROUTER_API_KEY` | âœ… | Pelo menos um provider |
| `OLLAMA_URL` | | Opcional |
| `SMTP_HOST` | | Email transacional |
| `SMTP_PORT` | | `587` |
| `SMTP_SECURE` | | `false` |
| `SMTP_USER` | | |
| `SMTP_PASSWORD` | | |
| `EMAIL_FROM` | | `StudyAI <noreply@example.com>` |
| `FEEDBACK_EMAIL` | | |
| `CAPACITOR_SERVER_URL` | | `https://studyai.example.com` |

### 2. Build e Deploy

```bash
# Local - build de produÃ§Ã£o
npm run build

# Deploy no Railway (via CLI ou Git push)
railway up --detach

# Ou push para branch que trigga deploy automÃ¡tico
git push railway v1.1-development:main
```

### 3. MigraÃ§Ã£o SQL (PÃ³s-Deploy Inicial)

```bash
# Conectar no PostgreSQL do Railway
railway connect postgresql

-- Executar migraÃ§Ã£o rate_limits
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  window_bucket BIGINT NOT NULL,
  count BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key, window_bucket)
);
CREATE INDEX IF NOT EXISTS rate_limits_bucket ON rate_limits(window_bucket);

-- Verificar
SELECT to_regclass('public.rate_limits');
\d rate_limits
```

### 4. Smoke Tests PÃ³s-Deploy

Executar `docs/SMOKE_TEST_V1_1.md` â€” Target: â‰¤ 15 min

| Teste | CritÃ©rio |
|-------|----------|
| Liveness | `GET /api/health/live` â†’ 200, `status: "ok"` |
| Readiness | `GET /api/health` → 200, `status: "ok"` |
| Health Detalhado | Com `HEALTH_SECRET` â†’ DB + Storage OK |
| PÃ¡gina Inicial | Carrega sem 5xx |
| Cadastro/Login | Funcionando end-to-end |
| BYOK Config | Salvar chave â†’ "BYOK Ativo" |
| Tutor Chat | Streaming funciona |
| Professor Ãudio | Iniciar aula â†’ Ã¡udio reproduz |
| Academy/Studio | Criar/editar/exportar PDF/PPTX |
| Diagram Studio | Canvas, drag-drop, export |
| OCR Pro | Upload imagem â†’ texto extraÃ­do |
| Cloud Sync | Sincronizar â†’ "Sincronizado" |
| Quotas Dashboard | Settings â†’ IA â†’ Consumo visÃ­vel |

---

## ðŸ”§ PÃ³s-Deploy (Primeiras 24h)

### Monitoramento Intensivo (Primeiras 2h)
- [ ] Health check `ok` contÃ­nuo
- [ ] Logs sem erros 5xx
- [ ] Cadastro/Login funcionando
- [ ] BYOK salvando/descriptografando
- [ ] Tutor respondendo (streaming)
- [ ] Quotas consumindo corretamente
- [ ] Rate limits funcionando
- [ ] Logs sem secrets vazados

### Monitoramento Estendido (24h)
- [ ] MÃ©tricas 5xx < 1%
- [ ] Auth failure rate < 1%
- [ ] Quota blocked < 5% usuÃ¡rios
- [ ] Rate limit hits < 20%
- [ ] Provider fallback < 20%
- [ ] Crypto errors = 0
- [ ] Memory < 85%
- [ ] CPU < 80%
- [ ] Smoke tests diÃ¡rios passam

---

## ðŸ”™ Rollback RÃ¡pido (Se NecessÃ¡rio)

| CenÃ¡rio | Comando | Tempo |
|---------|---------|-------|
| CÃ³digo | `git checkout 2ca9a94 && npm run build && railway up` | < 5 min |
| Schema `rate_limits` | `DROP TABLE rate_limits` | < 1 min |
| Crypto v2 | Remover `API_KEYS_ENCRYPTION_KEY` no Railway | < 1 min |
| Rate Limit | Reverter `RateLimit.ts` p/ in-memory | < 5 min |
| Next.js | `npm install next@15.5.25` | < 5 min |

**Gatilho de Rollback:** Health `degraded` > 2 min, 5xx > 1%, auth falhando, quotas bloqueando todos.

---

## ðŸ“‹ PÃ³s-Deploy Checklist Final

- [ ] Deploy Railway bem-sucedido
- [ ] MigraÃ§Ã£o SQL `rate_limits` executada
- [ ] Smoke tests 100% PASS
- [ ] Health check `ok` estÃ¡vel 10 min
- [ ] VariÃ¡vel `API_KEYS_ENCRYPTION_KEY` configurada
- [ ] Dashboard quotas visÃ­vel em Settings â†’ IA
- [ ] Logs sem secrets (auditoria rÃ¡pida)
- [ ] MÃ©tricas baseline coletadas
- [ ] Equipe notificada: "Deploy V1.1 concluÃ­do"
- [ ] DocumentaÃ§Ã£o Obsidian atualizada

---

## ðŸ“‹ PÃ³s-Deploy Checklist Final

- [ ] Deploy Railway bem-sucedido
- [ ] MigraÃ§Ã£o SQL `rate_limits` executada
- [ ] Smoke tests 100% PASS
- [ ] Health check `ok` estÃ¡vel 10 min
- [ ] VariÃ¡vel `API_KEYS_ENCRYPTION_KEY` configurada
- [ ] Dashboard quotas visÃ­vel em Settings â†’ IA
- [ ] Logs sem secrets (auditoria rÃ¡pida)
- [ ] MÃ©tricas baseline coletadas
- [ ] Equipe notificada: "Deploy V1.1 concluÃ­do"
- [ ] DocumentaÃ§Ã£o Obsidian atualizada

---

**Assinatura Deploy:** _________________ **Data/Hora:** _________________

**AprovaÃ§Ã£o PÃ³s-24h:** _________________ **Data/Hora:** _________________