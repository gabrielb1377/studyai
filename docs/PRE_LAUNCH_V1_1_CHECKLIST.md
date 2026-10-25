# Pre-Launch Checklist V1.1 — StudyAI

**Versão:** V1.1  
**Data:** 2026-10-24  
**Branch:** `v1.1-development`  
**Commit:** `5dc68d0`  
**Release Gate:** **PASS** ✅

---

## ✅ Checklist Pré-Lançamento

### Código
- [x] Branch `v1.1-development` limpa
- [x] Commit `5dc68d0` (Sprint 37E.6) + `b6610da` (Sprint 37E.5)
- [x] `npm run lint` — 0 erros
- [x] `npm run typecheck` — Limpo
- [x] `npm run build` — 13.5s, 46 rotas, 104 kB shared
- [x] `npm run test:e2e` — 203 descobertos, 184 passing, 1 retry, 3 skipped, 0 falhas
- [x] `npm audit --omit=dev` — 4 low (katex), Critical/High FIXED
- [x] `git diff --check` — Clean

### Documentação
- [x] `docs/SPRINT_37E_5_BASELINE.md`
- [x] `docs/SPRINT_37E_5_MIGRATION_STRATEGY.md`
- [x] `docs/SPRINT_37E_5_PHASE_5_SUMMARY.md`
- [x] `docs/SPRINT_37E_5_REPORT.md`
- [x] `docs/SPRINT_37E_6_REPORT.md`
- [x] `docs/DEPLOY_V1_1_CHECKLIST.md` (este arquivo)
- [x] `docs/ROLLBACK_V1_1.md`
- [x] `docs/SMOKE_TEST_V1_1.md`
- [x] `docs/MONITORING_V1_1.md`
- [x] `docs/RELEASE_GATE_V1_1_OPERATIONAL.md` — **PASS**
- [x] `docs/SPRINT_37E_6_REPORT.md`
- [x] `CURRENT_HANDOFF.md` atualizado
- [x] `PROJECT_CONTEXT.md` atualizado
- [x] Obsidian atualizado

---

## 🚀 Deploy no Railway

### 1. Variáveis de Ambiente (Obrigatórias)

| Variável | Obrigatória | Exemplo/Nota |
|----------|-------------|--------------|
| `NODE_ENV` | ✅ | `production` |
| `APP_URL` | ✅ | `https://studyai.example.com` |
| `NEXT_PUBLIC_APP_URL` | ✅ | `https://studyai.example.com` |
| `STUDYAI_DOMAIN` | ✅ | `studyai.example.com` |
| `AUTH_SECRET` | ✅ | ≥ 32 chars, `openssl rand -base64 48` |
| `HEALTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `API_KEYS_ENCRYPTION_KEY` | ✅ | **NOVA** `openssl rand -base64 32` |
| `DATABASE_URL` | ✅ | PostgreSQL gerenciado Railway |
| `DATABASE_SSL` | ✅ | `true` |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | ✅ | `true` |
| `DATABASE_POOL_SIZE` | | `10` |
| `S3_ENDPOINT` | ✅ | Object Storage compatível S3 |
| `S3_REGION` | ✅ | `us-east-1` |
| `S3_BUCKET` | ✅ | |
| `S3_ACCESS_KEY_ID` | ✅ | |
| `S3_SECRET_ACCESS_KEY` | ✅ | |
| `S3_FORCE_PATH_STYLE` | | `true` |
| `S3_SERVER_SIDE_ENCRYPTION` | | `AES256` |
| `GEMINI_API_KEY` | ✅ | Pelo menos um provider |
| `GROQ_API_KEY` | ✅ | Pelo menos um provider |
| `OPENROUTER_API_KEY` | ✅ | Pelo menos um provider |
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
# Local - build de produção
npm run build

# Deploy no Railway (via CLI ou Git push)
railway up --detach

# Ou push para branch que trigga deploy automático
git push railway v1.1-development:main
```

### 3. Migração SQL (Pós-Deploy Inicial)

```bash
# Conectar no PostgreSQL do Railway
railway connect postgresql

-- Executar migração rate_limits
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

### 4. Smoke Tests Pós-Deploy

Executar `docs/SMOKE_TEST_V1_1.md` — Target: ≤ 15 min

| Teste | Critério |
|-------|----------|
| Health Check | `GET /api/health` → 200, `status: "ok"` |
| Health Detalhado | Com `HEALTH_SECRET` → DB + Storage OK |
| Página Inicial | Carrega sem 5xx |
| Cadastro/Login | Funcionando end-to-end |
| BYOK Config | Salvar chave → "BYOK Ativo" |
| Tutor Chat | Streaming funciona |
| Professor Áudio | Iniciar aula → áudio reproduz |
| Academy/Studio | Criar/editar/exportar PDF/PPTX |
| Diagram Studio | Canvas, drag-drop, export |
| OCR Pro | Upload imagem → texto extraído |
| Cloud Sync | Sincronizar → "Sincronizado" |
| Quotas Dashboard | Settings → IA → Consumo visível |

---

## 🔧 Pós-Deploy (Primeiras 24h)

### Monitoramento Intensivo (Primeiras 2h)
- [ ] Health check `ok` contínuo
- [ ] Logs sem erros 5xx
- [ ] Cadastro/Login funcionando
- [ ] BYOK salvando/descriptografando
- [ ] Tutor respondendo (streaming)
- [ ] Quotas consumindo corretamente
- [ ] Rate limits funcionando
- [ ] Logs sem secrets vazados

### Monitoramento Estendido (24h)
- [ ] Métricas 5xx < 1%
- [ ] Auth failure rate < 1%
- [ ] Quota blocked < 5% usuários
- [ ] Rate limit hits < 20%
- [ ] Provider fallback < 20%
- [ ] Crypto errors = 0
- [ ] Memory < 85%
- [ ] CPU < 80%
- [ ] Smoke tests diários passam

---

## 🔙 Rollback Rápido (Se Necessário)

| Cenário | Comando | Tempo |
|---------|---------|-------|
| Código | `git checkout 2ca9a94 && npm run build && railway up` | < 5 min |
| Schema `rate_limits` | `DROP TABLE rate_limits` | < 1 min |
| Crypto v2 | Remover `API_KEYS_ENCRYPTION_KEY` no Railway | < 1 min |
| Rate Limit | Reverter `RateLimit.ts` p/ in-memory | < 5 min |
| Next.js | `npm install next@15.5.25` | < 5 min |

**Gatilho de Rollback:** Health `degraded` > 2 min, 5xx > 1%, auth falhando, quotas bloqueando todos.

---

## 📋 Pós-Deploy Checklist Final

- [ ] Deploy Railway bem-sucedido
- [ ] Migração SQL `rate_limits` executada
- [ ] Smoke tests 100% PASS
- [ ] Health check `ok` estável 10 min
- [ ] Variável `API_KEYS_ENCRYPTION_KEY` configurada
- [ ] Dashboard quotas visível em Settings → IA
- [ ] Logs sem secrets (auditoria rápida)
- [ ] Métricas baseline coletadas
- [ ] Equipe notificada: "Deploy V1.1 concluído"
- [ ] Documentação Obsidian atualizada

---

## 📋 Pós-Deploy Checklist Final

- [ ] Deploy Railway bem-sucedido
- [ ] Migração SQL `rate_limits` executada
- [ ] Smoke tests 100% PASS
- [ ] Health check `ok` estável 10 min
- [ ] Variável `API_KEYS_ENCRYPTION_KEY` configurada
- [ ] Dashboard quotas visível em Settings → IA
- [ ] Logs sem secrets (auditoria rápida)
- [ ] Métricas baseline coletadas
- [ ] Equipe notificada: "Deploy V1.1 concluído"
- [ ] Documentação Obsidian atualizada

---

**Assinatura Deploy:** _________________ **Data/Hora:** _________________

**Aprovação Pós-24h:** _________________ **Data/Hora:** _________________