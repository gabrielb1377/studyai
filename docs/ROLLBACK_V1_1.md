# Plano de Rollback V1.1 — StudyAI

**Versão:** V1.1  
**Data:** 2026-10-24  
**Branch:** `v1.1-development`  
**Commit Base:** `b6610da`

---

## Princípios

1. **Segurança primeiro:** Dados de usuários > disponibilidade
2. **Rollback granular:** Código, banco e criptografia independentemente
3. **Decisão humana:** Nenhum rollback automático destrutivo
4. **Comunicação:** Stakeholders informados em < 15 min

---

## Classificação de Incidentes

| Severidade | Critério | Ação |
|------------|----------|------|
| **Crítico** | Dados corrompidos, vazamento de secrets, perda de dados | Rollback completo imediato + investigação |
| **Alto** | Quotas bloqueando todos, BYOK quebrado, auth falhando | Rollback seletivo (código/banco) em < 15 min |
| **Médio** | Performance degradada, exportação falhando, sync lento | Mitigação + monitoramento, rollback se persistir > 30 min |
| **Baixo** | Bugs cosméticos, logs ruidosos, features não-críticas | Hotfix no próximo deploy, sem rollback |

---

## Tipos de Rollback

### 1. Rollback de Código (Aplicação)

**Quando usar:** Bug no código, regressão de feature, build quebrado

**Procedimento:**
```bash
# 1. Identificar commit anterior estável
git log --oneline -10

# 2. Fazer checkout do commit anterior (ex: 2ca9a94)
git checkout 2ca9a94

# 3. Rebuild
npm run build

# 4. Deploy no Railway (re-deploy do build anterior)
railway up --detach
```

**Tempo estimado:** < 5 min (build) + deploy Railway (~2-3 min)

**Validação pós-rollback:**
- Health check `/api/health` → 200 OK
- Login/cadastro funcional
- Feature regressiva restaurada

---

### 2. Rollback de Banco de Dados (Schema + Dados)

#### A. Rollback de Schema (`rate_limits` table)

**Quando usar:** Migração SQL com problema, tabela corrompida

```sql
-- Verificar se tabela existe
SELECT to_regclass('public.rate_limits');

-- Backup dos dados (se houver dados importantes)
CREATE TABLE rate_limits_backup AS SELECT * FROM rate_limits;

-- Dropar tabela
DROP TABLE IF EXISTS rate_limits;

-- Recriar se necessário (versão anterior do schema.sql)
-- O script db-migrate.mjs recria automaticamente na próxima inicialização
```

**Tempo estimado:** < 1 min

**Validação:** `SELECT to_regclass('public.rate_limits');` → null (removida) ou tabela recriada

#### B. Rollback de Dados (`usage_quotas`, `user_api_keys`)

**Quando usar:** Dados corrompidos, migração de dados falhou

```sql
-- Backup antes de qualquer operação
CREATE TABLE usage_quotas_backup_$(date +%s) AS SELECT * FROM usage_quotas;
CREATE TABLE user_api_keys_backup_$(date +%s) AS SELECT * FROM user_api_keys;

-- Restaurar de backup (se houver backup pontual)
-- Exemplo: restaurar de backup pontual do Railway/PostgreSQL
-- Ou restaurar de dump: pg_restore -d studyai backup.dump
```

**⚠️ Cuidado:** Rollback de dados pode perder alterações recentes dos usuários. Avaliar impacto.

---

### 3. Rollback de Criptografia (BYOK v2 → v1)

**Cenário:** `API_KEYS_ENCRYPTION_KEY` comprometida ou v2 com bug crítico

**Procedimento:**

1. **Remover variável de ambiente** `API_KEYS_ENCRYPTION_KEY` no Railway
   - Railway Dashboard → Variables → Delete `API_KEYS_ENCRYPTION_KEY`
   - Redeploy automático (ou `railway up`)

2. **Verificar comportamento:**
   - Novas chaves → salvas como `enc:v1:` (fallback para `AUTH_SECRET`)
   - Chaves existentes `enc:v2:` → continuam legíveis (código lê ambos)
   - Chaves existentes `enc:v1:` → continuam funcionando

3. **Validação:**
   - Salvar nova chave BYOK → aparece como `enc:v1:` no banco
   - Chaves v2 existentes ainda descriptografam
   - Health check `/api/health` → OK

**Tempo estimado:** < 1 min (redeploy Railway)

**⚠️ Risco:** Se `AUTH_SECRET` também for comprometido, **todas** as chaves ficam expostas. Neste caso, rotação completa de `AUTH_SECRET` + re-registro de todas as BYOK pelos usuários.

---

### 4. Rollback de Rate Limiting (PostgreSQL → In-Memory)

**Cenário:** `rate_limits` table causando deadlocks, performance ruim, ou bug no `RateLimitService`

**Procedimento:**

1. **Reverter `RateLimit.ts` para versão in-memory:**
   ```typescript
   // src/server/security/RateLimit.ts
   const buckets = new Map<string, { count: number; resetAt: number }>();

   export function rateLimit(key: string, limit = 20, windowMs = 60_000) {
     const timestamp = Date.now();
     const bucket = buckets.get(key);
     if (!bucket || bucket.resetAt <= timestamp) {
       buckets.set(key, { count: 1, resetAt: timestamp + windowMs });
       return { allowed: true, remaining: limit - 1 };
     }
     bucket.count += 1;
     return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), retryAfter: Math.ceil((bucket.resetAt - timestamp) / 1000) };
   }
   ```

2. **Remover tabela `rate_limits` (opcional):**
   ```sql
   DROP TABLE IF EXISTS rate_limits;
   ```

3. **Build e deploy**

**Tempo estimado:** < 5 min

**⚠️ Impacto:** Rate limits perdem persistência entre restarts. Em multi-instância, cada instância tem seu próprio contador. Aceitável como mitigação temporária.

---

### 5. Rollback Next.js (Regressão de Framework)

**Cenário:** Next.js 15.5.28 introduz regressão crítica

```bash
# Reverter para versão estável anterior
npm install next@15.5.25 react@19.0.0 react-dom@19.0.0 --save

# Atualizar eslint-config-next se necessário
npm install eslint-config-next@15.5.25 --save-dev

# Rebuild e deploy
npm run build
railway up
```

**Tempo estimado:** < 5 min

---

## Matriz de Decisão

| Incidente | Rollback Código | Rollback Banco | Rollback Crypto | Rollback Rate Limit | Rollback Next.js |
|-----------|-----------------|----------------|-----------------|---------------------|------------------|
| Bug crítico no código | ✅ | ❌ | ❌ | ❌ | ❌ |
| Migração SQL falhou | ❌ | ✅ (schema) | ❌ | ❌ | ❌ |
| Dados corrompidos | ❌ | ✅ (dados) | ❌ | ❌ | ❌ |
| `API_KEYS_ENCRYPTION_KEY` vazada | ❌ | ❌ | ✅ (remover var) | ❌ | ❌ |
| `AUTH_SECRET` vazado | ✅ (rotação) | ❌ | ✅ (rotação) | ❌ | ❌ |
| `rate_limits` deadlock | ❌ | ❌ | ❌ | ✅ (in-memory) | ❌ |
| Next.js 15.5.28 bug | ❌ | ❌ | ❌ | ❌ | ✅ |
| Quota bypass | ✅ (fix) | ❌ | ❌ | ❌ | ❌ |

---

## Checklist de Rollback

### Pré-Rollback
- [ ] Confirmar severidade e escopo
- [ ] Identificar commit/hash alvo
- [ ] Comunicar equipe/stakeholders
- [ ] Backup do banco atual (se rollback de dados)

### Durante Rollback
- [ ] Executar procedimento específico
- [ ] Validar health check
- [ ] Testar fluxos críticos (login, BYOK, Tutor)
- [ ] Monitorar logs por 10 min

### Pós-Rollback
- [ ] Confirmar estabilidade por 30 min
- [ ] Documentar incidente e causa raiz
- [ ] Atualizar `RELEASE_GATE` se necessário
- [ ] Planejar fix definitivo para re-deploy

---

## Comunicação

| Canal | Quando | Modelo |
|-------|--------|--------|
| Slack/Teams (equipe) | Imediato | "🔴 ROLLBACK INICIADO: [componente] - [motivo] - ETA: [min] min" |
| Status Page (se houver) | < 5 min | "Investigando incidente - funcionalidade X indisponível" |
| Stakeholders | < 15 min | "Incidente detectado, rollback em andamento, ETA resolução: [hora]" |
| Pós-incidente | < 24h | Post-mortem com timeline, causa raiz, ações preventivas |

---

## Critérios de Não-Rollback

- Bug corrigível com hotfix em < 30 min (ex: typo, config)
- Feature flag pode desabilitar funcionalidade problemática
- Impacto apenas em usuários beta/opt-in
- Workaround documentado e comunicado

---

**Autorização:** Rollback de banco de dados (dados) requer aprovação de 2 engenheiros sêniores. Rollback de código pode ser executado por qualquer engenheiro com acesso ao deploy.

**Revisão:** Este plano deve ser revisado a cada sprint ou após incidentes reais.