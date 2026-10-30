# Deploy Runbook V1.1 — StudyAI

> **Autoridade operacional (Sprint 37E.8B, 2026-10-27):** este runbook contém
> instruções históricas, não é autorização nem certificação de Railway. Acesso
> remoto e secrets não foram verificados. Até validação/aceite do owner, use
> `docs/RAILWAY_PRE_DEPLOY_V1_1.md` e `docs/PRODUCTION_MIGRATION_PLAN_V1_1.md`;
> não execute exemplos históricos de login/link/deploy/push. A divergência
> `.railway/railway.ts` vs `railway.toml` deve ser reconciliada antes de planejar
> publicação. Os comandos abaixo são templates para janela futura aprovada; não
> foram executados e não devem ser tratados como acesso verificado. Nenhuma ação
> remota foi tomada nesta sprint. Ver a decisão 37E.8B em
> `docs/RAILWAY_CONFIGURATION_DECISION.md`; este runbook não escolhe entre
> `.railway/railway.ts` (IaC avaliada/aplicada pelo CLI) e `railway.toml` (CaC
> legado aplicado no deploy de service existente quando configurado).

**Versão:** V1.1  
**Data:** 2026-10-27 (revisão operacional 37E.8B)
**Branch:** `v1.1-development`  
**Base desta revisão:** `03a61ee4e83d575f71a30485b45eff0e0c6e065b` (37E.8A)

---

## Objetivo

Runbook operacional para deploy do StudyAI V1.1 no Railway.  
Destinado à equipe de engenharia responsável pelo deploy.

---

## Pré-Requisitos

- [ ] Acesso Railway autorizado pelo responsável (não executar `railway login` sem autorização)
- [ ] Acesso PostgreSQL provisionado para a janela aprovada; não usar `railway connect` sem confirmar alvo e autorização
- [ ] Variáveis de ambiente configuradas no Railway Dashboard
- [ ] Backup do banco de dados atual (se houver dados em produção)
- [ ] Smoke test script disponível (`docs/SMOKE_TEST_V1_1.md`)

---

## 1. Pré-Deploy (Desenvolvimento)

### Checklist de Validação Local

```bash
# Executar validações locais
npm run lint          # 0 erros
npm run typecheck     # Limpo
npm run build         # Sucesso
npm run test:e2e      # consolidado em docs/SPRINT_37E_7B_REPORT.md (3 skipped)
npm audit --omit=dev  # 4 low (katex), Critical/High FIXED
git diff --check      # Clean
```

**Estado atualizado:** o baseline 37E.7C passou no lint/typecheck/build, com 75
warnings de lint e 4 advisories low no audit. Testes locais dirigidos adicionais
da 37E.8A estão em `docs/SPRINT_37E_8A_REPORT.md`; o gate operacional continua
**CONDITIONAL** e Railway não foi verificado.

---

## 2. Configuração no Railway

### Variáveis de Ambiente (Dashboard Railway)

Acessar: Railway Dashboard → Project → Variables

| Variável | Valor | Notas |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `APP_URL` | URL HTTPS aprovada do ambiente | URL pública; readiness valida |
| `NEXT_PUBLIC_APP_URL` | URL pública aprovada, se usada | Não é secret |
| `STUDYAI_DOMAIN` | Domínio, apenas se algum componente o exigir | Não presumir que Railway precisa |
| `AUTH_SECRET` | Secret gerado no cofre aprovado | **≥ 32 chars; estável; não rotacionar** |
| `HEALTH_SECRET` | Secret separado no cofre aprovado | Para health detalhado, opcional operacional |
| `API_KEYS_ENCRYPTION_KEY` | Secret persistente gerado no cofre aprovado | Preservar para ciphertext v2; não inventar/rotacionar |
| `DATABASE_URL` | Referência privada ao PostgreSQL aprovado | Nunca documentar ou imprimir valor |
| `DATABASE_SSL` | `true` | |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` | |
| `DATABASE_POOL_SIZE` | `10` | |
| `S3_ENDPOINT` | Endpoint aprovado | Object Storage S3-compatível |
| `S3_REGION` | Região real do bucket | |
| `S3_BUCKET` | Bucket aprovado e privado | |
| `S3_ACCESS_KEY_ID` | Referência a credencial mínima | Valor não deve ir para documento |
| `S3_SECRET_ACCESS_KEY` | Secret no cofre aprovado | Valor não deve ir para documento |
| `S3_FORCE_PATH_STYLE` | `true` | |
| `S3_SERVER_SIDE_ENCRYPTION` | `AES256` | |
| `GEMINI_API_KEY` | Secret do provider aprovado | Pelo menos 1 provider se esse for o modelo operacional |
| `GROQ_API_KEY` | Secret do provider aprovado | Opcional |
| `OPENROUTER_API_KEY` | Secret do provider aprovado | Opcional |
| `OLLAMA_URL` | *(opcional)* | Se houver Ollama remoto |
| `SMTP_HOST` | `smtp.example.com` | Opcional |
| `SMTP_PORT` | `587` | |
| `SMTP_SECURE` | `false` | |
| `SMTP_USER` | `...` | |
| `SMTP_PASSWORD` | `...` | |
| `EMAIL_FROM` | `StudyAI <noreply@studyai.example.com>` | |
| `FEEDBACK_EMAIL` | `feedback@studyai.example.com` | |
| `CAPACITOR_SERVER_URL` | `https://studyai.example.com` | |

**⚠️ IMPORTANTE:** `API_KEYS_ENCRYPTION_KEY` é necessária para gravar BYOK v2;
sem ela, novas chaves são v1. O formato de Base64 de 32 bytes é recomendação de
entropia, não parser validado. Criar/registrar somente em processo seguro
autorizado; nunca copiar o valor ao Git/ticket/log. Não alterar uma chave que já
protege ciphertext v2.

---

## 3. Deploy

### Opção A: Railway CLI (aguarda autorização, sessão e decisão de configuração)

```bash
# Somente em janela aprovada, depois de confirmar o projeto/serviço/ambiente.
# Não executar como parte desta sprint. A sessão local atual não está autorizada.
```

### Opção B: GHCR + webhook ou Git integration (não aprovado)

> Requer autorização explícita. Este runbook **não** autoriza merge/push em
> `main`; use a branch de release configurada no Railway.

Não há push aprovado. Nunca enviar a branch de desenvolvimento a `main` sem
fluxo e autorização humana específicos.

### Verificar Deploy

Use comandos de observação somente após autenticação já autorizada e com
scrubbing de logs; não foi possível confirmar a identidade/acesso nesta sprint.

---

## 4. Migração do Schema (no startup da imagem; ação mutável)

O `Dockerfile` executa `node scripts/db-migrate.mjs && node server.js`. A
migração roda **a cada boot**, em transação única, e é idempotente; a primeira
query também inicializa o schema por processo. Isto é DDL mutável no runtime,
não na etapa de build. Tratar o primeiro start como migração e só iniciar depois
de backup/restauração de ensaio e aprovação da janela. Ver
`docs/PRODUCTION_MIGRATION_PLAN_V1_1.md`; estado do schema Railway não verificado.
O Railway HTTP healthcheck é gate do novo deploy (2xx antes do tráfego) e não é
monitorado continuamente após ativação. Configurar monitoramento/alertas de
readiness separado; falha posterior do readiness não implica restart automático.

```bash
# Em janela autorizada, observar logs redigidos no painel da plataforma e
# verificar schema com consulta read-only aprovada pelo DBA. Não executar sem
# confirmar service/environment e credenciais protegidas.
```

**Falha esperada (fail-closed):** sem `DATABASE_URL`, o script sai com código 1
e o container não inicia.

---

## 5. Smoke Tests Pós-Deploy (somente release e janela aprovadas)

Executar dentro de 15 minutos após o deploy:

```bash
# Script automatizado
BASE_URL="https://studyai.example.com"
HEALTH_SECRET="${HEALTH_SECRET}"

# 1. Liveness (processo HTTP; não consulta DB/S3)
curl -sf "$BASE_URL/api/health/live" | jq -e '.status == "ok" and .check == "liveness"'

# 2. Readiness + Health Detalhado
curl -sf "$BASE_URL/api/health" | jq -e '.status == "ok"'
curl -sf -H "x-health-secret: $HEALTH_SECRET" "$BASE_URL/api/health" | \
  jq -e '.checks.database.available == true and .checks.objectStorage.available == true'

# 3. Página Inicial
curl -sf "$BASE_URL" | grep -q "StudyAI"

# 4. Login Page
curl -sf "$BASE_URL/auth/login" | grep -q "Entrar"

# 5. Auth API
curl -sf "$BASE_URL/auth/session" | jq -e '.user'
```

**Critérios de Sucesso:**
- ✅ Health check `ok`
- ✅ DB + Storage disponíveis
- ✅ Página inicial carrega
- ✅ Login page acessível
- ✅ Auth session válida

---

## 6. Validação Pós-Deploy (24h)

### Primeiras 2h (Intensivo)
- [ ] Health check `ok` contínuo
- [ ] Logs sem erros 5xx
- [ ] Cadastro/Login funcionando
- [ ] BYOK salvando/descriptografando
- [ ] Tutor respondendo (streaming)
- [ ] Quotas consumindo corretamente
- [ ] Rate limits funcionando
- [ ] Logs sem secrets vazados

### 24h (Estendido)
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

## 7. Rollback (plano conceitual; requer autorização separada)

### Gatilhos de Rollback
- Health check `degraded` por > 2 min
- 5xx > 1% por > 5 min
- Auth falhando consistentemente
- Quotas bloqueando todos os usuários

### Procedimentos

| Cenário | Comando | Tempo |
|---------|---------|-------|
| **Código** | Selecionar artifact/commit aprovado depois de validar suporte schema + BYOK | Não medido |
| **Schema/dados** | Sem rollback `down` automático; não dropar tabelas; decidir forward fix ou restore isolado aprovado | Não medido |
| **Crypto v2** | Nunca remover a chave por si só; v1-only exige dry-run + rekey `v2→v1` com backup aprovado | Depende do volume; não medido |
| **Rate Limit** | Mitigação requer revisão de segurança e rollout específico | Não medido |
| **Next.js** | Reverter dependências exige build/testes e artifact validado | Não medido |

**Procedimento Padrão:**
1. Identificar severidade
2. Comunicar equipe
3. Executar rollback apropriado
4. Validar health check
5. Documentar incidente

---

## 8. Contatos e Escalação

| Nível | Tempo | Responsável | Ação |
|-------|-------|-------------|------|
| L1 | 0-15 min | On-call | Diagnóstico inicial |
| L2 | 15-60 min | Tech Lead | Investigação profunda |
| L3 | > 60 min | Eng Manager + CTO | War room, rollback major |

---

## 9. Checklist Final de Deploy

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
