# Decisão Final de Release — StudyAI V1.1 Beta

**Data:** 2026-10-26
**Sprint:** 37E.7B — Final Release Verification
**Branch:** `v1.1-development`
**Commit verificado:** `1e56d76` (37E.7A) + alterações da 37E.7B
**Responsável pela verificação:** agente de engenharia (sem autoridade de deploy)

---

## Decisão

> ## ⚠️ CONDITIONAL — NÃO É UM "GO" AUTOMÁTICO
>
> A V1.1 está tecnicamente consistente e pode ser **submetida para
> autorização** de deploy. O deploy **não está autorizado por este documento**.
> A execução depende das condições obrigatórias abaixo.

---

## 1. O que foi verificado e passou

| Área | Evidência |
|------|-----------|
| Código | `typecheck` limpo; `lint` 0 erros; `build` OK; `git diff --check` limpo |
| Testes E2E | 205 descobertos: 193 diretos + 8 retry, 1 falha ambiental (passou 3/3 isolada e na reexecução final), 3 skipped. Reexecução direcionada no código final: 21 passed, 3 skipped (215 descobertos com `quota-policy`) |
| Migrações | `schema.sql` limpo e idempotente em PostgreSQL 18 isolado |
| Constraints | PKs, índices e FKs `ON DELETE CASCADE` confirmados |
| Quota | contagem duplicada corrigida (3 vs 6); UPSERT diário/minuto validado |
| Rate limit | UPSERT atômico validado; login/cadastro/recuperação/API keys **fail-closed** (503 + `Retry-After: 30`) em produção, confirmado no standalone com `DATABASE_URL` inválida e ausente; PK/falhas de FK rejeitadas |
| Criptografia | 16 testes na implementação real v1/v2, incluindo adulteração e rollback |
| Segurança de quota | falha de banco em produção propaga erro (fail-closed) |
| Dependências | 4 advisories **low** (`katex`); sem high/critical |
| Documentação | hashes, endpoint de sessão, migração automática e rollback corrigidos |

---

## 2. Condições Obrigatórias Antes do Deploy

Estas condições **não** foram executadas nesta sprint (sem acesso/autorização).

1. **Autorização humana explícita** para deploy no Railway.
   Este documento não substitui a aprovação do responsável pelo produto.
2. **Backup verificado** do PostgreSQL de produção, com teste de restore.
   Sem backup, não executar migração.
3. **Variáveis de ambiente completas** no Railway, incluindo:
   - `AUTH_SECRET` (≥ 32 chars) e `HEALTH_SECRET`;
   - `API_KEYS_ENCRYPTION_KEY` (se BYOK v2 for habilitado);
   - `DATABASE_URL` e SSL;
   - **S3 completo** (`S3_ENDPOINT`, `S3_BUCKET`, credenciais) — sem storage,
     `/api/health` responde 503 e o container é considerado não saudável;
   - pelo menos um provider de IA.
4. **Smoke test pós-deploy** em até 15 min (`docs/SMOKE_TEST_V1_1.md`),
   começando por health, cadastro, login, BYOK e quota.
5. **Plano de rollback criptográfico:** se houver `enc:v2:` e a versão de
   destino não ler v2, executar `scripts/rekey-byok-v2-to-v1.mjs --apply`
   **antes** de remover a chave. Nunca remover `API_KEYS_ENCRYPTION_KEY`
   diretamente.
6. **Aceite formal dos riscos residuais** da §4 por quem autorizar o deploy.

---

## 3. O que impede um "READY FOR AUTHORIZATION" pleno

| # | Gap | Impacto | Pode ir para produção? |
|---|-----|---------|------------------------|
| 1 | Cenários 5, 6 e 7 de concorrência `skipped` | Fallback de quota e rate limit entre instâncias não comprovados por teste | Sim, com risco aceito e monitoramento |
| 2 | Concorrência multi-conexão não executada | UPSERT é atômico por SQL, mas corrida real não foi medida | Sim, com risco aceito |
| 3 | Rate limit fail-open **apenas** em endpoints não críticos | Limite pode ser contornado entre réplicas em sync/colaboração/telemetria/feedback; auth e API keys são fail-closed | Sim, risco baixo |
| 4 | Quota superestima consumo com BYOK parcial | Usuário pode ser bloqueado mesmo tendo chave própria | Sim (UX), corrigir depois |
| 5 | Monitoramento não implantado | Sem alertas automáticos; dependência de logs/SQL | Sim, com operação manual |
| 6 | Deploy/Railway/backup não testados | Falhas operacionais só aparecem no deploy | **Requer as condições da §2** |
| 7 | Execução completa com 1 falha ambiental + 8 flakies | Evidência final não é 100% limpa; falha passou isolada e na reexecução | Sim, mas repetir em ambiente limpo (critério §5.4) |

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
- **Health dependente de S3:** storage é pré-requisito de deploy.

---

## 5. Critérios para Promover a "READY FOR AUTHORIZATION"

1. Implementar e executar os Cenários 5–7 com PostgreSQL real e duas instâncias.
2. Executar `scripts/verify-concurrency.mjs` em ambiente com múltiplas conexões
   (CI/container) e anexar a saída.
3. Configurar ao menos um alerta externo (health/5xx) antes do tráfego real.
4. Repetir a suíte final e anexar o JSON com 0 falhas e 0 flaky (ou justificar).

**Estado atual:** o critério 4 **não** está atendido — a execução completa
teve 1 falha ambiental e 8 flakies. Os fluxos alterados pelo hardening foram
reexecutados e passaram (21 passed, 3 skipped), mas isso não substitui uma
execução completa limpa. A decisão permanece **CONDITIONAL**.

---

## 6. Assinaturas

| Papel | Nome | Decisão | Data |
|-------|------|---------|------|
| Engenharia / verificação | agente 37E.7B | **CONDITIONAL** | 2026-10-25 |
| Autorização de deploy | _pendente_ | — | — |
| Produto | _pendente_ | — | — |

---

**Referências:** `docs/SPRINT_37E_7B_REPORT.md`,
`docs/ROLLBACK_V1_1.md`, `docs/SMOKE_TEST_V1_1.md`,
`docs/DEPLOY_V1_1_CHECKLIST.md`.
