# Monitoramento Pós-Deploy V1.1 — StudyAI

**Versão:** V1.1  
**Data:** 2026-10-24  
**Período Crítico:** Primeiras 24h → 7 dias → 30 dias

---

## Métricas Críticas (Alertas Imediatos)

| Métrica | Threshold Crítico | Threshold Warning | Fonte | Ação |
|---------|-------------------|-------------------|-------|------|
| **Health Check** | `degraded` ou 503 por > 2 min | `degraded` por > 30s | `/api/health` | Alerta imediato, investigar DB/Storage |
| **Erro 5xx Rate** | > 1% das requisições | > 0.1% | Logs/nginx | Investigar logs, rollback se > 5% |
| **Auth Failure Rate** | > 5% falhas login | > 1% | Logs auth | Verificar auth service, DB |
| **Quota Blocked Rate** | > 10% usuários bloqueados | > 5% | QuotaService logs | Verificar quotas, DB, fallback |
| **Rate Limit Hits** | > 50% requests limitados | > 20% | RateLimitService logs | Verificar ataque ou config |
| **Provider Fallback Rate** | > 50% requests usam fallback | > 20% | ProviderManager logs | Verificar providers primários |
| **Crypto Errors** | Qualquer erro de decrypt | Qualquer | Logs Crypto | Investigar chave, rollback crypto |
| **Sync Failures** | > 5% syncs falhando | > 1% | SyncService logs | Verificar conflitos, storage |
| **Export Failures** | > 5% PDF/PPTX falham | > 1% | Export logs | Verificar template, libs |
| **Memory Usage** | > 85% container | > 70% | Railway metrics | Scale up, restart |
| **CPU Usage** | > 90% por > 5 min | > 80% | Railway metrics | Scale up, otimizar queries |

---

## Dashboards Recomendados

### 1. Health Overview (Grafana/Datadog/Railway)
- Health check status (ok/degraded/down)
- DB latency (p50, p95, p99)
- Storage latency
- Public URL readiness

### 2. Auth & Security
- Login success rate
- Registration rate
- Failed login attempts (por IP/usuário)
- JWT validation errors
- CSRF failures
- Crypto errors (por tipo: v1, v2, tag, iv)

### 3. AI Core
- Requests por provider (Gemini, Groq, OpenRouter, Ollama)
- Latência por provider (p50, p95, p99)
- Fallback rate (% requisições que usam fallback)
- Streaming success rate
- Tokens por request
- Errors por tipo (rate limit, timeout, invalid key, unavailable)

### 4. Quotas & Rate Limits
- Quota diária usada/limite (por usuário, agregado)
- Quota por minuto usada/limite
- Quota blocked count
- Rate limit hits (por endpoint, por usuário)
- Rate limit blocked count
- Fallback shared key usage

### 5. Features
- **Tutor:** Conversas iniciadas, mensagens, streaming success, errors
- **Professor:** Aulas iniciadas, áudio reproduzido, exercícios
- **Academy:** Estudos criados, exportações PDF/PPTX, Studio edits
- **Diagram Studio:** Diagramas criados, nós/arestas, exports SVG/PNG/PDF/PPTX
- **OCR:** Imagens processadas, chars extraídos, tempo médio
- **Cloud Sync:** Syncs iniciados, conflitos, bytes transferidos, duração
- **Export:** PDF/PPTX gerados, tamanho médio, tempo, erros

---

## Alertas Propostos (ainda NÃO configurados)

> **Estado real (Sprint 37E.7B):** o StudyAI não expõe `/metrics` nem envia
> métricas para Prometheus/Grafana. As regras abaixo são um modelo para
> configuração manual futura; até lá, a observabilidade depende de
> `/api/health`, logs do Railway e consultas SQL pontuais. Não trate estes
> alertas como ativos.

```yaml
groups:
  - name: studyai-critical
    rules:
      - alert: HealthCheckDown
        expr: up{job="studyai"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "StudyAI health check down"
          
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate (>1%)"
          
      - alert: AuthFailureSpike
        expr: rate(auth_failures_total[5m]) > 0.05
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Authentication failure rate >5%"
          
      - alert: QuotaBlockingUsers
        expr: rate(quota_blocked_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Quota blocking >10% of requests"
          
      - alert: ProviderFallbackHigh
        expr: rate(ai_fallback_total[5m]) / rate(ai_requests_total[5m]) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Provider fallback rate >50%"
          
      - alert: CryptoDecryptFailures
        expr: rate(crypto_decrypt_failures_total[5m]) > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Crypto decryption failures detected"
          
      - alert: HighMemoryUsage
        expr: (container_memory_usage_bytes / container_spec_memory_limit_bytes) > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Container memory usage >85%"
          
      - alert: HighCPUUsage
        expr: rate(container_cpu_usage_seconds_total[5m]) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Container CPU usage >90%"
```

---

## Logs Estruturados (Campos Obrigatórios)

Todos os logs devem ser JSON estruturado com:

```json
{
  "timestamp": "2026-10-24T10:30:00.000Z",
  "level": "info|warn|error",
  "service": "studyai",
  "version": "1.1.0",
  "trace_id": "abc123...",
  "span_id": "def456...",
  "user_id": "user_123",           // se autenticado
  "request_id": "req_789...",
  "endpoint": "/api/tutor",
  "method": "POST",
  "status_code": 200,
  "latency_ms": 1250,
  "provider": "gemini",           // se AI
  "model": "gemini-3.7-flash",    // se AI
  "fallback": false,              // se AI
  "tokens_input": 150,            // se AI
  "tokens_output": 850,           // se AI
  "quota_mode": "byok",           // se quota
  "quota_daily_used": 42,         // se quota
  "quota_daily_limit": 500,       // se quota
  "rate_limit_key": "tutor:user_123",
  "rate_limit_remaining": 15,
  "crypto_version": "v2",         // se crypto
  "crypto_op": "encrypt",         // se crypto
  "error": {                      // se error
    "message": "Rate limited",
    "code": "RATE_LIMITED",
    "provider": "groq"
  }
}
```

**NUNCA logar:**
- API Keys (BYOK ou server-side)
- JWTs completos
- Senhas
- Documentos privados dos usuários
- Transcrições de áudio
- Conteúdo de documentos
- `AUTH_SECRET`, `API_KEYS_ENCRYPTION_KEY`, `DATABASE_URL`, `SMTP_PASSWORD`, etc.

---

## Retenção de Logs

| Tipo | Retenção | Armazenamento |
|------|----------|---------------|
| Access logs (nginx) | 30 dias | Railway/CloudWatch |
| Application logs | 30 dias | Railway/CloudWatch |
| Error logs | 90 dias | Railway/CloudWatch |
| Audit logs (auth, crypto, quotas) | 1 ano | PostgreSQL / S3 |
| Security events | 1 ano | PostgreSQL / S3 |
| Metrics (Prometheus) | 30 dias | Prometheus/Thanos |

---

## Ferramentas de Observabilidade

| Ferramenta | Uso | Configuração |
|------------|-----|--------------|
| **Railway Metrics** | CPU, Memory, Network, Disk | Built-in |
| **Railway Logs** | Application logs, stdout/stderr | Built-in |
| **PostgreSQL pg_stat_statements** | Query performance | `CREATE EXTENSION pg_stat_statements;` |
| **pg_stat_activity** | Active connections, locks | `SELECT * FROM pg_stat_activity;` |
| **Telemetry (local)** | AI metrics, cache hits, timing | `src/server/observability/Telemetry.ts` |
| **Browser DevTools** | Frontend performance, network | Development only |

---

## Comandos Úteis para Debug

```bash
# Ver logs Railway
railway logs --tail 100

# Conectar no PostgreSQL
railway connect postgresql

# Ver queries lentas
psql $DATABASE_URL -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;"

# Ver conexões ativas
psql $DATABASE_URL -c "SELECT pid, state, query_start, query FROM pg_stat_activity WHERE state != 'idle';"

# Ver locks
psql $DATABASE_URL -c "SELECT * FROM pg_locks WHERE NOT granted;"

# Ver tamanho tabelas
psql $DATABASE_URL -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size FROM pg_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"

# Ver quotas atuais (apenas a linha consolidada do dia, minute_bucket = 0)
psql $DATABASE_URL -c "SELECT user_id, date, requests_count AS daily_requests FROM usage_quotas WHERE minute_bucket = 0 ORDER BY date DESC LIMIT 20;"

# Ver rate limits atuais
psql $DATABASE_URL -c "SELECT key, window_bucket, count FROM rate_limits ORDER BY window_bucket DESC LIMIT 20;"
```

---

## Runbook de Incidentes Comuns

| Incidente | Diagnóstico | Resolução |
|-----------|-------------|-----------|
| Health check `degraded` | Verificar `database.available`, `storage.available`, `publicUrlReady` | Ver logs DB, Storage, DNS/SSL |
| Erro 5xx em `/api/tutor` | Ver logs AI, provider status, quota | Ver provider status, quota, fallback |
| Quota bloqueando usuários | Ver `usage_quotas`, `rate_limits` | Ajustar limites, verificar bug |
| BYOK não funciona | Ver `user_api_keys`, `Crypto.ts`, provider | Ver chave, descriptografia, provider |
| Export PDF/PPTX falha | Ver logs export, template, libs | Ver template, pdf-lib, jszip |
| Cloud Sync falha | Ver `sync_logs`, conflitos, storage | Ver conflitos, storage, network |
| Memória alta | Ver heap, GC, leaks | Restart, investigar leak |

---

## Escalação

| Nível | Tempo | Responsável | Ação |
|-------|-------|-------------|------|
| L1 | 0-15 min | On-call | Diagnóstico inicial, mitigação rápida |
| L2 | 15-60 min | Tech Lead | Investigação profunda, rollback se necessário |
| L3 | > 60 min | Engineering Manager + CTO | War room, decisão de rollback major, comunicação externa |

---

**Próxima Revisão:** Semanal nas primeiras 2 semanas, depois mensal.