# Railway Pre-Deploy — StudyAI V1.1

**Sprint:** 37E.8A · **Branch:** `v1.1-development`  
**Checkpoint:** `d0c2d634b84a874ccd262fc41307cec1f87a7138`  
**Escopo:** inspeção local e remota somente leitura. Nenhuma publicação ou alteração remota.

## Resumo executivo

- **CONFIRMADO LOCALMENTE:** Dockerfile multi-stage, Next.js standalone, Node 22,
  healthcheck Docker `/api/health/live`, `railway.toml` com builder Dockerfile e
  liveness. O build local anterior passou.
- **NÃO VERIFICADO REMOTAMENTE:** projeto, serviço, ambiente, deployment/commit,
  domínio, PostgreSQL vinculado, S3, rede, volumes, recursos, logs e presença de
  variáveis. O `railway whoami` existente retornou `Unauthorized`/grant inválido.
  Nenhuma nova autenticação foi tentada.
- **PENDENTE/BLOQUEANTE PARA AUTORIZAÇÃO:** existe divergência entre a
  configuração versionada `railway.toml` e `.railway/railway.ts`: a primeira usa
  `/api/health/live`; a segunda declara branch `main` e `/api/health`. A
  reconciliação requer decisão explícita do responsável e não foi feita nesta
  sprint.
- **PENDENTE:** confirmar persistência e disponibilidade de secrets no ambiente
  e serviço corretos sem revelar valores. Não há prova local ou remota para isso.

## Railway — estado da verificação

| Item | Estado | Evidência / pendência |
|---|---|---|
| CLI Railway | CONFIRMADO LOCALMENTE | CLI instalado; identidade retornou Unauthorized. Não autenticado nesta sprint. |
| Projeto e serviço | NÃO VERIFICADOS REMOTAMENTE | A configuração local `.railway/railway.ts` declara nomes; não prova o estado remoto. |
| Ambiente e deployment ativo | NÃO VERIFICADOS | Sem acesso autorizado. |
| Commit publicado | NÃO VERIFICADO | Nenhum deploy consultado ou executado. |
| Branch de origem | CONFLITO LOCAL / REMOTO NÃO VERIFICADO | IaC declara `main`; o trabalho atual está em `v1.1-development`. |
| Builder / Dockerfile | CONFIRMADO LOCALMENTE | `railway.toml`: `DOCKERFILE`, `Dockerfile`; não confirma builder remoto efetivo. |
| Start command | CONFIRMADO LOCALMENTE | Docker CMD roda `node scripts/db-migrate.mjs && node server.js`; configuração efetiva remota não verificada. |
| Healthcheck | CONFLITO LOCAL | `railway.toml` e Dockerfile usam liveness; `.railway/railway.ts` declara readiness `/api/health`. |
| Domínio / TLS | NÃO VERIFICADO | `APP_URL` e domínio Railway não consultados. |
| PostgreSQL / rede privada | NÃO VERIFICADO | Nenhuma conexão ou inspeção Railway. |
| Object Storage / bucket | NÃO VERIFICADO | Endpoint, bucket, versionamento e política não consultados. |
| Volumes / recursos / logs | NÃO VERIFICADOS | Nenhuma evidência remota. |

### Divergência da IaC local

`.railway/railway.ts` descreve `studyai-web`, fonte GitHub na branch `main` e
healthcheck `/api/health`. `railway.toml` descreve Dockerfile local e
`/api/health/live`. A IaC lista variáveis via `preserve()`, mas não lista
`API_KEYS_ENCRYPTION_KEY` nem os três providers cloud. Isso não prova que os
valores estejam ausentes remotamente, nem o comportamento de remoção/retensão
da ferramenta. Antes de deploy, o owner deve escolher o mecanismo de deploy e
alinhar branch, endpoint e contrato de variáveis. **Não executar `railway up`,
`railway link`, `railway variables` ou IaC apply nesta etapa.**

## Auditoria de variáveis

“Local” resume somente os nomes/valores não vazios em `.env.local` e o ambiente
do processo desta inspeção; nenhum conteúdo de segredo foi exibido. `.env.local`
tem as três variáveis de provider declaradas, mas vazias. Os templates `.env.*`
contêm placeholders, não evidência de configuração ativa.

Não foi localizada uma validação central/estrita de ambiente server-only; as
rotas e serviços consultam `process.env` diretamente. Algumas dependências
falham apenas quando usadas (por exemplo, `DATABASE_URL` no migrate, `AUTH_SECRET`
na autenticação, S3 no health/put). A ausência de erro no build não prova que as
variáveis estejam corretas em runtime.

| Nome | Obrigatória? | Local | Railway | Impacto se ausente | Ação necessária |
|---|---|---|---|---|---|
| `NODE_ENV` | Sim em produção | Docker define `production` | NÃO VERIFICADO | Comportamento incorreto de cookies, fail-closed e readiness | Confirmar no serviço |
| `APP_URL` | Sim em produção | Ausente | NÃO VERIFICADO | Readiness 503 e origem incorreta/indisponível para links/email | Configurar URL HTTPS canônica |
| `NEXT_PUBLIC_APP_URL` | Recomendada | Ausente | NÃO VERIFICADO | URL pública não consistente para consumidores que a usem | Confirmar uso no build/deploy e definir publicamente; nunca inserir secret |
| `STUDYAI_DOMAIN` | Condicional | Ausente | NÃO VERIFICADO | Necessária ao Compose/proxy local; não é lida pelo app Railway | Não tratar como requisito Railway sem evidência |
| `AUTH_SECRET` | Sim | Ausente | NÃO VERIFICADO | Falha de auth/JWT e leitura de envelopes BYOK v1 | Confirmar secret estável, ≥32 chars, sem rotacionar |
| `HEALTH_SECRET` | Recomendada | Ausente | NÃO VERIFICADO | Sem diagnóstico detalhado autenticado em produção | Confirmar secret forte; usar apenas em canal monitor autorizado |
| `API_KEYS_ENCRYPTION_KEY` | Sim para gravar BYOK v2; opcional para legado v1 | Ausente | NÃO VERIFICADO | Sem ela novas chaves são v1; chaves v2 existentes não descriptografam | Planejar chave aleatória forte, persistente e estável; preservar em rollback |
| `DATABASE_URL` | Sim | Ausente | NÃO VERIFICADO | Migração falha; dados cloud/auth indisponíveis | Confirmar referência PostgreSQL privada e usuário/permissões |
| `DATABASE_SSL` | Recomendado em produção | Ausente | NÃO VERIFICADO | Produção assume SSL quando não for explicitamente `false` | Definir `true` explicitamente |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Recomendada | Template `true` | NÃO VERIFICADO | Desabilitar validação TLS permitiria MITM | Manter `true`; não afrouxar para contornar certificados |
| `DATABASE_POOL_SIZE` | Não; default 10 | Template `10` | NÃO VERIFICADO | Default é 10 conexões por instância; risco de exceder limite agregado | Dimensionar `réplicas × pool + jobs` contra limite do Postgres |
| `S3_BUCKET` | Sim para readiness/uso S3 | Ausente | NÃO VERIFICADO | Readiness 503 em produção; binários indisponíveis | Confirmar bucket privado e região/endpoint |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Sim para cliente S3 | Ausentes | NÃO VERIFICADO | S3 não configura; readiness 503 | Confirmar credencial de menor privilégio, sem imprimir valor |
| `S3_ENDPOINT` | Condicional | Ausente | NÃO VERIFICADO | Necessário para endpoint S3 não-AWS; AWS pode omitir | Confirmar endpoint do provedor |
| `S3_REGION` | Não; default `us-east-1` | Template `us-east-1` | NÃO VERIFICADO | Pode direcionar para região errada | Confirmar valor do bucket |
| `S3_FORCE_PATH_STYLE` | Não; default true | Template `true` | NÃO VERIFICADO | Incompatibilidade de endereçamento em alguns provedores | Confirmar compatibilidade com provedor |
| `S3_SERVER_SIDE_ENCRYPTION` | Não; default AES256 | Template `AES256` | NÃO VERIFICADO | Sem valor, app solicita SSE AES256; `none` desabilita | Confirmar suporte/política do provedor, sem desabilitar por suposição |
| `GEMINI_API_KEY` | Opcional individualmente; funcionalmente configure ao menos um provider cloud se esse for o modelo operacional | Declarada vazia | NÃO VERIFICADO | Provider compartilhado Gemini indisponível | Definir somente se aprovado, secret server-side |
| `GROQ_API_KEY` | Opcional individualmente | Declarada vazia | NÃO VERIFICADO | Provider Groq indisponível | Idem |
| `OPENROUTER_API_KEY` | Opcional individualmente | Declarada vazia | NÃO VERIFICADO | Provider OpenRouter indisponível | Idem |
| `OLLAMA_URL` | Opcional; só se Ollama acessível pela cloud | Ausente (template localhost não é cloud) | NÃO VERIFICADO | Ollama indisponível; não deve apontar para loopback do container | Configurar endpoint privado alcançável apenas se for operar Ollama |
| `SMTP_HOST` | Necessária para cadastro/verificação/recuperação por email em produção | Ausente | NÃO VERIFICADO | Fluxos de email são recusados em produção | Confirmar relay aprovado |
| `SMTP_PORT`, `SMTP_SECURE` | Condicionais; defaults 587/false | Ausentes | NÃO VERIFICADO | Falha de transporte/TLS se incompatíveis com relay | Confirmar com provedor SMTP |
| `SMTP_USER`, `SMTP_PASSWORD` | Condicionais ao relay autenticado | Ausentes | NÃO VERIFICADO | Relay autenticado não envia | Configurar como secrets, sem registrar valores |
| `EMAIL_FROM` | Não; há default local | Ausente | NÃO VERIFICADO | Remetente local inválido em produção | Definir remetente de domínio autorizado |
| `FEEDBACK_EMAIL` | Opcional | Ausente | NÃO VERIFICADO | Relatos de feedback sem destinatário | Definir se canal de feedback estiver habilitado |
| `CAPACITOR_SERVER_URL` | Apenas build mobile | Ausente | NÃO VERIFICADO | App mobile não aponta para serviço | Fora do requisito do web service |
| `POSTGRES_PASSWORD` | Apenas Compose local; não é usado pelo app Railway | Ausente | NÃO VERIFICADO | Compose local falha sem ela | Não confundir com password contido no `DATABASE_URL` |
| `PORT`, `HOSTNAME` | Runtime; Docker define `3000` e `0.0.0.0` | Não definidos no shell | NÃO VERIFICADO | Processo pode escutar interface/porta errada | Confirmar plataforma honra `PORT`; não fixar porta incompatível |

O parser de `API_KEYS_ENCRYPTION_KEY` não valida formato/comprimento: a cadeia
fornecida como texto UTF-8 entra em `scrypt` para derivar 32 bytes. O exemplo de
32 bytes aleatórios codificados em Base64 é uma recomendação de geração, não um
formato Base64 obrigatório. Depois de gravar `enc:v2:`, a chave exata deve ser
preservada fora do Git, com backup de acesso controlado; perda/rotação direta
torna esses registros ilegíveis.

## Object Storage e dados

**CONFIRMADO LOCALMENTE:** objeto S3 usa chaves `users/{userId}/materials/{id}/{hash}`;
metadados (hash, tamanho, mime type e storage key/provider) ficam em PostgreSQL.
O código implementa put/get/delete e health com `HeadBucket`. O delete na app
também remove o objeto S3.

**PENDENTE:** bucket e provedor remotos, versionamento, retenção, replication,
limites/custo, restore de objeto e logs de acesso não foram verificados. Não há
backup/restore de S3 implementado pela aplicação. Exigir plano de cópia/version
control no provedor, retenção acordada e teste de recuperação de objeto associado
ao metadata/hash antes de considerar os binários protegidos. Não ativar versão,
criar buckets ou copiar dados nesta sprint.

Plano futuro aprovado pelo owner/provedor deve cobrir:

1. Identificar objetos privados por namespace/user/material e obter inventário
   somente de metadados (`storage_key`, `hash`, `size_bytes`, provider); não
   baixar conteúdo real durante preflight.
2. Definir versioning/replication ou cópia imutável, retenção e criptografia no
   provedor; verificar custo, quotas e limites por operação/armazenamento antes
   de habilitar.
3. Em restore de ensaio autorizado, restaurar DB e objetos em destinos isolados,
   baixar canário sintético e comparar tamanho/SHA-256 com metadata.
4. Confirmar política para exclusões: código atual chama `DeleteObject`; se
   versioning houver, verificar delete-marker e retenção real no provedor.
5. Registrar RPO/RTO aprovados e responsável; versioning sozinho não substitui
   backup independente contra exclusão/comprometimento de credencial.

## Monitoramento

**CONFIRMADO LOCALMENTE:** health live/readiness e Telemetry em memória/logs.
`docs/MONITORING_V1_1.md` define proposta, mas os alertas externos não estão
configurados nem foram verificados. Railway logs/metrics built-in não foram
inspecionados. Prompts, API keys e JWTs não devem constar em logs. Antes do
tráfego, definir um responsável e um canal de alerta para 5xx, auth, DB, S3,
quota, crypto, provider fallback, CPU/memória e sync; registrar retenção real do
plano depois de verificar o serviço.

## Gate desta inspeção

Estado **CONDITIONAL**, não `READY FOR AUTHORIZATION`: resta confirmar o ambiente
Railway e secrets; resolver a divergência IaC; validar plano/restore de dados
reais em janela autorizada; estabelecer estratégia de backup dos objetos S3;
aprovar limites PostgreSQL e monitoramento. Smoke tests pós-deploy ocorrem
somente após release autorizado, com o roteiro e a ficha de evidência da
`docs/SMOKE_TEST_V1_1.md`.
