# Decisão Final de Release — StudyAI V1.1 Beta

**Data:** 2026-10-27
**Sprint:** 37E.8B — Railway Configuration & Launch Authorization Gate
**Branch:** `v1.1-development`
**Checkpoint de partida:** `03a61ee4e83d575f71a30485b45eff0e0c6e065b` (37E.8A)
**Responsável pela verificação:** agente de engenharia (sem autoridade de deploy)

---

## Decisão

> ## ⚠️ CONDITIONAL — NÃO É UM "GO" AUTOMÁTICO
>
> Railway IaC vs Config-as-Code foi investigado em docs oficiais. Ainda não se
> conhece qual mecanismo/config path governa o service remoto: CLI Unauthorized,
> service e secrets não verificados. Validações locais foram executadas;
> infraestrutura e secrets Railway,
> backup/restore de produção, proteção de objetos S3 e monitoramento permanecem
> não verificados. **Não solicitar autorização de deploy ainda.** Esta decisão
> não autoriza deploy, migração nem alteração remota.

---

## 1. O que foi verificado e passou

| Área | Evidência |
|------|-----------|
| Código | `typecheck` limpo; `lint` 0 erros (75 warnings); `build` OK; `git diff --check` limpo |
| Testes E2E | Baseline 37E.7B: 205 descobertos, 193 diretos + 8 retry, 1 falha ambiental, 3 skipped. 37E.7C: **218/218 casos únicos aprovados** (212 diretos + 6 retry), 0 falhas residuais, 0 skipped; uma asserção obsoleta foi corrigida e aprovada direcionadamente |
| Migrações | `schema.sql` limpo e idempotente em PostgreSQL 18 isolado |
| Constraints | PKs, índices e FKs `ON DELETE CASCADE` confirmados |
| Quota | contagem duplicada corrigida (3 vs 6); UPSERT diário/minuto validado |
| Rate limit | UPSERT atômico validado; login/cadastro/recuperação/API keys **fail-closed** (503 + `Retry-After: 30`) em produção, confirmado no standalone com `DATABASE_URL` inválida e ausente; PK/falhas de FK rejeitadas |
| Criptografia | 16 testes na implementação real v1/v2, incluindo adulteração e rollback |
| Segurança de quota | falha de banco em produção propaga erro (fail-closed) |
| Dependências | `npm audit --omit=dev`: 4 advisories **low** transitivos (`katex`); sem high/critical. Fix automático requer breaking change e não foi aplicado |
| Concorrência SQL | PostgreSQL 18.4 isolado, múltiplas conexões; **7/7 PASS**, incluindo disputa restante=1 e rate limit compartilhado entre pools |
| Concorrência da aplicação | Standalone, duas instâncias, PostgreSQL real; **8/8 PASS** (cenários 5–7, E/F e F2) |
| Health | `/api/health/live` independente de DB/S3; `/api/health` é readiness detalhada; Docker e `railway.toml` local usam liveness, enquanto `.railway/railway.ts` declara readiness; config remota não verificada |
| Bug de request body | Corrigido consumo duplo do body em Tutor/Academy/middleware; evidenciado por rota real no standalone |
| Documentação | hashes, endpoint de sessão, migração automática e rollback corrigidos |
| Operações pré-deploy 37E.8A | Backup/restore com dados sintéticos em PostgreSQL isolado passou; **não é evidência de backup/restore real** |
| Checks direcionados 37E.8B | lint 0 erros/75 warnings; typecheck/build PASS; Playwright **38/38** (com testes docs/config); migração repetida 2x em DB local; standalone live 200/readiness 503 |
| Audit 37E.8B | `npm audit --omit=dev`: 4 low (KaTeX/micromark transitivos), sem high/critical; exit code 1 pelos findings low; sem `--force` |
| Railway | CLI instalado, mas `whoami` não autorizado. Serviço, deployment, secrets, DB, S3, domínio, recursos e logs **não verificados** |
| Configuração local de deploy | Divergência entre `.railway/railway.ts` (branch `main`, `/api/health`) e `railway.toml` (`/api/health/live`); decisão e reconciliação pendentes |
| Railway docs | `.railway/railway.ts` requer `railway config plan/apply`; não é lido durante deploy. `railway.toml` é CaC legado para serviço existente se configurado; serviço não pode ser gerenciado pelos dois modelos. Sunset CaC documentado para 2026-12-01. |
| Entrega CI | `deploy.yml` constrói/push GHCR em `main`, depois usa webhook opcional `DEPLOY_WEBHOOK_URL`; existência/destino do webhook não verificados; nenhum workflow roda IaC. |
| Healthcheck Railway | Docs dizem que probe é usada no deploy até sucesso 2xx, não monitorada após ativação; readiness contínua requer monitoramento independente. |

---

## 2. Condições Obrigatórias Antes de solicitar autorização

Estas condições **não** foram executadas nesta sprint (sem acesso/autorização).

1. Owner decide o modelo (legacy CaC ou IaC) após confirmação remota; não misturar
   os dois. Ver `docs/RAILWAY_CONFIGURATION_DECISION.md`.
2. **Acesso read-only Railway** autorizado e configuração/service/environment,
   deploy ativo e flow de entrega confirmados; depois, **autorização humana
   explícita** para deploy. Este documento não é autorização.
3. **Backup verificado** do PostgreSQL, com restore isolado e processo autorizado.
   Sem backup, não executar migração.
4. Confirmar presença/persistência de variáveis no ambiente correto,
   sem expor valores. Incluindo:
   - `AUTH_SECRET` (≥ 32 chars) e `HEALTH_SECRET`;
   - `API_KEYS_ENCRYPTION_KEY` (se BYOK v2 for habilitado);
   - `DATABASE_URL` e SSL;
   - **S3 completo** (`S3_ENDPOINT`, `S3_BUCKET`, credenciais) — sem storage,
     `/api/health` responde 503 e o container é considerado não saudável;
   - pelo menos um provider de IA.
5. Definir e testar o plano de backup/restore/versionamento S3 (estado remoto
   não verificado).
6. **Smoke test pós-deploy** em até 15 min (`docs/SMOKE_TEST_V1_1.md`),
   começando por health, cadastro, login, BYOK e quota.
7. **Plano de rollback criptográfico:** se houver `enc:v2:` e a versão de
   destino não ler v2, executar `scripts/rekey-byok-v2-to-v1.mjs --apply`
   **antes** de remover a chave. Nunca remover `API_KEYS_ENCRYPTION_KEY`
   diretamente.
8. Configurar monitoramento/alertas e responsável antes de tráfego real.
9. **Aceite formal dos riscos residuais** da §4 por quem autorizar o deploy.

---

## 3. O que impede um "READY FOR AUTHORIZATION" pleno

| # | Gap | Impacto | Pode ir para produção? |
|---|-----|---------|------------------------|
| 1 | Rate limit fail-open **apenas** em endpoints não críticos | Limite pode ser contornado entre réplicas em sync/colaboração/telemetria/feedback; auth e API keys são fail-closed | Sim, risco baixo |
| 2 | Quota conservadora com BYOK parcial | Em modo automático pode consumir quota compartilhada antes de saber se fallback será usado | Sim (UX), corrigir depois |
| 3 | Monitoramento/alertas remotos não verificados | Sem alerta externo comprovado para incidentes | Configurar/testar antes do tráfego |
| 4 | Source/config ativa do Railway não conhecida; arquivos têm escopos diferentes | Não se sabe se o serviço usa legacy CaC ou configuração de Dashboard/IaC | **Read-only autorizado + decisão do owner** |
| 5 | Workflow `main` publica GHCR e webhook é opcional | Destino do webhook/trigger efetivo não conhecido | **Confirmar fluxo antes de autorizar** |
| 6 | Backup/restore PostgreSQL de produção não verificados | Ensaio local sintético não protege dados reais | **Backup + restore isolado em janela aprovada** |
| 7 | Backup/versionamento/restore S3 não verificados | Binários de usuário podem não ser recuperáveis | **Definir/verificar no provedor** |
| 8 | Execução E2E final | 218/218 casos únicos aprovados; 6 retries, 0 falhas residuais, 0 skipped | Gate local atendido |

---

## 4. Riscos Residuais Aceitos (com ressalvas)

- **Quota conservadora:** autorizada uma vez por requisição; não conhece a
  credencial efetiva. Em modo automático com BYOK parcial pode cobrar quota
  compartilhada indevidamente.
- **Rate limit fail-open restrito:** login, cadastro, recuperação e API keys
  falham fechados (503) quando o banco está indisponível em produção. Sync,
  colaboração, telemetria e feedback ainda usam contador em memória por
  instância; não há bypass de autenticação nesses fluxos.
- **Dashboard "BYOK Ativo":** reflete a existência de qualquer chave, não
  necessariamente o bypass da quota.
- **Fuso:** a chave de data é UTC e o reset exibido é local.
- **`katex` 4 low:** sem correção não-disruptiva.
- **Readiness dependente de S3:** storage é pré-requisito para tráfego. Docker e `railway.toml` local usam liveness sem dependências; o `.railway/railway.ts` diverge e a configuração efetiva Railway não foi confirmada. Healthcheck Railway não monitora continuamente após o rollout.

---

## 5. Critérios para Promover a "READY FOR AUTHORIZATION"

1. Acesso Railway read-only autorizado, deploy/config path identificado e modelo
   escolhido pelo owner; migrar de CaC para IaC só após plan revisado.
2. Secrets verificados por presença/health/functionality, sem cópia de valores.
3. Restore PostgreSQL e plano/restore de objetos S3 aceitos.
4. Alertas/monitoramento configurados e testados.
5. Suíte E2E reconciliada: 218 casos únicos; retries reportados em `docs/E2E_STABILITY_V1_1.md`.
6. Checklist operacional revisado e aprovações separadas definidas. **READY FOR
   AUTHORIZATION não é autorização**; deploy/backup/DDL/secrets/rollback exigem
   aprovação específica antes da execução (`docs/LAUNCH_AUTHORIZATION_CHECKLIST.md`).

**Estado atual:** **CONDITIONAL**. Railway `whoami` Unauthorized; serviço, config ativa, secrets, backup/restore de produção, S3/versioning/restore e alertas não verificados. Ensaio de backup/restore foi sintético/local. Nenhum deploy, push, migração ou alteração remota foi executado/autorizado.

---

## 6. Assinaturas

| Papel | Nome | Decisão | Data |
|-------|------|---------|------|
| Engenharia / verificação | Sprint 37E.8B | **CONDITIONAL** | 2026-10-27 |
| Autorização de deploy | _pendente_ | — | — |
| Produto | _pendente_ | — | — |

---

**Referências:** `docs/SPRINT_37E_7B_REPORT.md`,
`docs/ROLLBACK_V1_1.md`, `docs/SMOKE_TEST_V1_1.md`,
`docs/DEPLOY_V1_1_CHECKLIST.md`.
