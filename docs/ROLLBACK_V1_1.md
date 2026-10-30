# Plano de Rollback V1.1 — StudyAI

> **Atualização 37E.8A — precede todo o conteúdo histórico abaixo:** nenhum
> procedimento foi testado em produção e nenhuma mudança remota foi feita.
> Estimativas antigas de tempo são **não verificadas**; não há garantia de
> rollback em menos de 5 minutos. Não executar `DROP TABLE`, restore sobre DB
> ativo, remoção de secrets ou publicação sem janela autorizada, backup/restore
> aprovado e decisão humana. Siga também `docs/PRODUCTION_MIGRATION_PLAN_V1_1.md`.
>
> **BYOK:** rollback para um binário que não lê `enc:v2:` é incompatível com
> registros v2 existentes. O commit `2ca9a94` foi inspecionado e é v1-only;
> `b6610da` e `5dc68d0` incluem decrypt v2, mas cada alvo deve ser verificado
> pelo hash. Manter a variável v2 não adiciona suporte v2 a código antigo.

**Versão:** V1.1  
**Data:** 2026-10-27 (revisão 37E.8A)
**Branch:** `v1.1-development`  
**Base de revisão:** `d0c2d634b84a874ccd262fc41307cec1f87a7138`

---

## Princípios

1. **Segurança primeiro:** Dados de usuários > disponibilidade
2. **Rollback granular:** Código, banco e criptografia independentemente
3. **Decisão humana:** Nenhum rollback automático destrutivo
4. **Comunicação:** Stakeholders informados em < 15 min

## Backup PostgreSQL pré-deploy — 37E.8A

**Obrigatório antes de qualquer migração/rollout.** `pg_dump` e `pg_restore` da
máquina desta sprint: PostgreSQL **18.4**; validar `pg_dump --version` e usar
cliente compatível com a versão remota (preferencialmente mesma major). O teste
local foi executado apenas em PostgreSQL isolado com registros sintéticos.

1. Obter autorização, registrar horário UTC, database/cluster e commit-alvo sem
   guardar URL/credenciais no relatório.
2. Provisionar conexão TLS por perfil libpq (`PGSERVICEFILE`) e senha em
   `PGPASSFILE`, ambos fora do Git, com ACL Windows somente para operador e
   serviço autorizados. Não colocar a URL completa em linha de comando/histórico
   ou saída de CI. Confirmar `sslmode=verify-full` quando suportado pelo
   provedor/certificado.
3. Criar destino em volume local criptografado, não sincronizado e com espaço
   livre; copiar ao repositório/bucket de backup aprovado também criptografado e
   com ACL restritiva. Não usar `D:\studyai`, pasta pública ou Obsidian.
4. Exemplo de execução (o service name aponta para conexão protegida; não contém
   credencial inline):

   ```powershell
   $env:PGSERVICEFILE = $env:APPROVED_PGSERVICEFILE
   $env:PGPASSFILE = $env:APPROVED_PGPASSFILE
   $env:PGSERVICE = $env:APPROVED_BACKUP_SERVICE
   $dump = Join-Path $env:APPROVED_BACKUP_DIR "studyai-$((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')).dump"
   pg_dump --dbname="service=$env:PGSERVICE" --format=custom --no-owner --no-acl --file="$dump"
   if ($LASTEXITCODE -ne 0) { throw 'pg_dump falhou; parar rollout' }
   pg_restore --list "$dump" > $null
   if ($LASTEXITCODE -ne 0) { throw 'dump inválido; parar rollout' }
   Get-FileHash -Algorithm SHA256 "$dump"
   ```

   Armazenar o SHA-256, tamanho, timestamp, versão cliente e destino no registro
   operacional aprovado; não inserir qualquer dado de credencial. `pg_dump`
   cobre um database, não roles globais, configuração do serviço nem objetos
   S3; registrar dependências/extensions separadamente.
5. Restaurar o custom dump em **banco isolado novo**, nunca sobre o DB ativo:

   ```powershell
   createdb --maintenance-db="service=$env:APPROVED_RESTORE_ADMIN_SERVICE" "$env:RESTORE_DB_NAME"
   $env:PGSERVICE = $env:APPROVED_RESTORE_SERVICE
   pg_restore --dbname="service=$env:PGSERVICE" --no-owner --no-acl "$dump"
   if ($LASTEXITCODE -ne 0) { throw 'restore falhou; não aprovar backup' }
   ```

   O service de restore deve apontar exclusivamente ao destino isolado. Validar
   tabelas/índices/FKs, contagens agregadas, login sintético e leitura de BYOK
   sintético; não exibir rows/ciphertext. Recalcular hash e registrar evidência.
6. Aprovar backup somente após restore completo sem erro, aplicação de smoke
   isolada e revisão de perda/RPO/RTO. Confirmar retenção, criptografia e acesso
   ao artefato. Plano de retenção/custo de produção ainda está pendente.

`pg_restore --list` sozinho verifica a estrutura do archive, **não** prova que o
restore seja íntegro. Nunca apagar artefato aprovado até expirar a retenção e
autorização de descarte.

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

**Pré-condição:** se a versão de destino não conhecer o envelope BYOK v2,
executar **antes** o procedimento da seção 3 (re-encriptação v2 → v1).

**Procedimento:**
```bash
# 1. Identificar a última versão de produção estável
git log --oneline -10

# 2. Selecionar o artifact/commit imutável aprovado na plataforma de deploy.
# Não alterar checkout da branch compartilhada como ação de incidente.

# 3. Rebuild
npm run build

# 4. Deploy no Railway (re-deploy do build anterior)
# Promover somente após autorização e confirmação do artifact/alvo pelo owner.
# Não executar CLI, workflow ou webhook como parte deste plano documental.
```

**Tempo:** não medido em produção. Confirmar disponibilidade do artifact e
tempo de provisionamento antes de definir SLA/ETA.

**Validação pós-rollback:**
- Liveness `/api/health/live` → 200 OK (sem DB/S3)
- Readiness `/api/health` → 200 OK, `status: "ok"`
- Login/cadastro funcional
- Feature regressiva restaurada

---

### 2. Rollback de Banco de Dados (Schema + Dados)

#### A. Rollback de Schema (`rate_limits` table)

**Quando usar:** Migração SQL com problema, tabela corrompida

Não há rollback `down` certificado para schema. A tabela pode conter limites
ativos e o app pode recriá-la automaticamente; **não dropar tabela nem apagar
índices**. Em caso de incompatibilidade, interromper o rollout e seguir uma
migração forward revisada ou restaurar um backup em ambiente isolado antes de
autorizar qualquer recuperação no ambiente ativo.

**Tempo:** não estimado; depende de locks e volume de alterações.

**Validação somente leitura:** `SELECT to_regclass('public.rate_limits');` deve
retornar a relação existente após a decisão aprovada; nunca validar removendo-a.

#### B. Rollback de Dados (`usage_quotas`, `user_api_keys`)

**Quando usar:** Dados corrompidos, migração de dados falhou

Use backup validado (`pg_dump` + `pg_restore`) como documentado em
`docs/PRODUCTION_MIGRATION_PLAN_V1_1.md`; não crie cópias improvisadas no mesmo
banco nem restaure por cima do banco ativo sem plano de reconciliação.

**⚠️ Cuidado:** Rollback de dados pode perder alterações recentes dos usuários. Avaliar impacto.

---

### 3. Rollback de Criptografia (BYOK v2 → v1)

**Cenário:** `API_KEYS_ENCRYPTION_KEY` comprometida ou v2 com bug crítico

**⚠️ Correção importante (verificada na Sprint 37E.7B):**

Remover `API_KEYS_ENCRYPTION_KEY` **não mantém os registros `enc:v2:` legíveis**.
O decrypt v2 deriva a chave de `API_KEYS_ENCRYPTION_KEY`; sem ela, o código cai
no fallback da chave v1 e a autenticação GCM falha. `ApiKeyService.getDecrypted`
captura o erro e devolve `undefined`, então o usuário perde silenciosamente o
BYOK até a chave ser restaurada. A versão anterior à V1.1 também não conhece
`enc:v2:`.

**Procedimento seguro (re-encriptar antes de remover a chave):**

1. **Backup verificado** de `user_api_keys` (ver seção 2B).
2. Ainda com a V1.1 em execução e `API_KEYS_ENCRYPTION_KEY` configurada, rodar
   o script de re-encriptação em dry-run:
   ```bash
   DATABASE_URL=... AUTH_SECRET=... API_KEYS_ENCRYPTION_KEY=... \
     node scripts/rekey-byok-v2-to-v1.mjs
   ```
3. Revisar a contagem (registros v2 encontrados, falhas = 0) e então aplicar:
   ```bash
   DATABASE_URL=... AUTH_SECRET=... API_KEYS_ENCRYPTION_KEY=... \
     node scripts/rekey-byok-v2-to-v1.mjs --apply
   ```
   O modo `--apply` roda em uma transação: se **qualquer** registro falhar,
   faz ROLLBACK e não grava nada.
4. Confirmar que não restam linhas v2:
   ```sql
   SELECT COUNT(*) FROM user_api_keys WHERE encrypted_key LIKE 'enc:v2:%';
   ```
5. Só depois de zero rows v2, backup e confirmação de que o artifact alvo lê v1,
   alterar/remover a variável como parte da janela aprovada. Não é obrigatório
   removê-la se o código alvo a ignora; verificar configuração antes.

**Rollback sem re-encriptar:** só é compatível quando o artifact de destino foi
verificado no código e lê `enc:v2:` com a mesma chave. Para destinos v1-only,
rollback direto é **INCOMPATÍVEL**; re-encriptação v2→v1 precisa ocorrer antes
da troca e exige backup verificado, autorização, dry-run sem falhas e conferência
de `COUNT(*) WHERE encrypted_key LIKE 'enc:v2:%' = 0`. O script existente só
faz v2→v1; não há ferramenta comprovada para migração em massa v1→uma nova v2.

**Validação:** salvar uma nova chave BYOK, reabrir Configurações → IA e testar o
provider; nenhuma linha `enc:v2:` deve permanecer após a re-encriptação.

**Tempo:** proporcional ao volume; não medido em produção.

**⚠️ Risco:** Se `AUTH_SECRET` também for comprometido, **todas** as chaves ficam expostas. Neste caso, rotação completa de `AUTH_SECRET` + re-registro de todas as BYOK pelos usuários.

---

### 4. Rollback de Rate Limiting (PostgreSQL → In-Memory)

**Cenário:** `rate_limits` table causando deadlocks, performance ruim, ou bug no `RateLimitService`

**Plano conceitual, não testado nem pré-aprovado:** restaurar artifact conhecido
e aprovado por engenharia; preservar `rate_limits` para possível retorno e
investigar causa/locks. Uma mitigação em memória reduz a proteção multi-instância
e precisa de mudança de código/revisão de segurança, não de SQL no banco. **Não
dropar a tabela**; a aplicação pode recriá-la no primeiro acesso. Tempo não
medido.

**⚠️ Impacto:** Rate limits perdem persistência entre restarts. Em multi-instância, cada instância tem seu próprio contador. Aceitável como mitigação temporária.

---

### 5. Rollback Next.js (Regressão de Framework)

**Cenário:** Next.js 15.5.28 introduz regressão crítica

Plano conceitual: selecionar dependency lockfile/artifact de versão aprovada,
validar build e compatibilidade de runtime/schema/BYOK antes da plataforma de
deploy. Não instalar versão ou enviar deploy como reação improvisada. Tempo não
medido.

---

## Matriz de Decisão

| Incidente | Rollback Código | Rollback Banco | Rollback Crypto | Rollback Rate Limit | Rollback Next.js |
|-----------|-----------------|----------------|-----------------|---------------------|------------------|
| Bug crítico no código | ✅ | ❌ | ❌ | ❌ | ❌ |
| Migração SQL falhou | ❌ | ✅ (schema) | ❌ | ❌ | ❌ |
| Dados corrompidos | ❌ | ✅ (dados) | ❌ | ❌ | ❌ |
| `API_KEYS_ENCRYPTION_KEY` vazada | ❌ | ✅ (backup) | ✅ (re-encriptar v2→v1 + rotacionar) | ❌ | ❌ |
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
