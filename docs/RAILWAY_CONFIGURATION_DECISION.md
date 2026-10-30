# Railway Configuration Decision — StudyAI V1.1

**Sprint:** 37E.8B · **Data:** 2026-10-27 · **Branch:** `v1.1-development`
**Estado:** análise local concluída; configuração remota **NÃO VERIFICADA**.
**Decisão:** não selecionar nem aplicar uma fonte operacional remota sem confirmação do owner e evidência read-only do serviço/ambiente.

## Achado principal

Os dois arquivos não são executores equivalentes:

- `.railway/railway.ts` é uma **especificação Railway IaC**. A documentação oficial
  informa que é avaliada pelo Railway CLI em `railway config plan/apply/pull`;
  Railway não lê `.railway/` automaticamente em cada deploy. Não há workflow no
  repositório chamando esses comandos. O arquivo não foi avaliado contra a
  infraestrutura remota nesta sprint.
- `railway.toml` é **Config-as-Code legado por serviço**. Para serviços existentes
  que estejam configurados para ler esse arquivo, os campos de build/deploy do
  arquivo substituem os valores correspondentes do Dashboard. A documentação
  publicada do Railway avisa que esse mecanismo foi descontinuado, continua
  funcional para serviços existentes até **2026-12-01** e não pode ser escolhido
  para novos serviços. O caminho do arquivo e se o serviço existente o usa são
  estado remoto e não foram verificados.
- A documentação também diz que um serviço não pode ser gerenciado ao mesmo
  tempo por Config-as-Code e IaC; `railway config plan` interrompe diante de um
  serviço ainda gerenciado pelo `railway.toml`. A presença de ambos no Git não
  prova que ambos estejam ativos nem qual foi aplicado.

Fontes oficiais consultadas em 2026-10-27:

- [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- [Config as Code](https://docs.railway.com/guides/config-as-code)
- [Healthchecks](https://docs.railway.com/reference/healthchecks)
- [Variables](https://docs.railway.com/variables)

## Matriz de configuração declarada

| CONFIGURAÇÃO | `.railway/railway.ts` | `railway.toml` | EFEITO REAL CONHECIDO | CONFLITO / RECOMENDAÇÃO |
|---|---|---|---|---|
| Finalidade/scope | Projeto `studyai`, partial `studyai-web`, service `studyai-web` | Config de build/deploy de um service | `.ts` somente com CLI `config plan/apply`; `.toml` durante deploy de serviço legado configurado para usá-lo | Remoto não verificado; decidir um único modo de gerenciamento |
| Origem / branch | GitHub `gabrielb1377/studyai`, branch `main` | Não define origem | `.ts` expressa origem pretendida se aplicado; workflow também dispara em `main` | O owner deve aprovar branch e fluxo. Não publicar `v1.1-development` por inferência |
| Builder | Não declarado | `DOCKERFILE` | No `.toml` legado seleciona Dockerfile | `.ts` pode omitir e deixar defaults/config remota; confirmar `railway config plan` somente em sessão autorizada |
| Build | Não declarado explicitamente | Dockerfile `Dockerfile` | Dockerfile `dependencies → builder`; `npm ci`, depois `npm run build` | Sem build command separado no `.toml`; não confundir com workflow de imagem |
| Start | Não declarado | Não declarado | Com imagem Docker, `CMD` executa `node scripts/db-migrate.mjs && node server.js` | Não usa `npm start` no Docker. Dashboard override remoto não verificado |
| Healthcheck | `/api/health`, timeout 120 s | `/api/health/live`, timeout 120 s | `.ts` teria readiness; `.toml` legacy usa liveness; serviço ativo não conhecido | Divergência crítica: usar live para healthcheck de deploy; readiness monitorada por separado. Não editar sem plano/owner |
| Restart policy | Não declarada | `ON_FAILURE`, max retries 5 | Definição no `.toml` para serviço legado; retry de processo, não health probe contínuo | IaC/Dashboard/remoto desconhecidos; não afirmar política ativa |
| Porta/interface | Não declara | Não declara | Docker define `PORT=3000`, `HOSTNAME=0.0.0.0`; Next standalone usa env runtime | Railway informa `$PORT` ao healthcheck; confirmar runtime/target port na configuração remota. Não assumir target 3000 |
| Volumes / rede / DB / S3 | Não declara recursos PostgreSQL, bucket, volumes ou networking | Não declara | Apenas env e código local; nenhuma infraestrutura criada por esses arquivos durante um deploy normal | Recursos, references, private networking e persistência remotos desconhecidos |
| Env vars | `preserve()` para subset (APP_URL, AUTH_SECRET, DB, HEALTH_SECRET, S3 e outras) | Nenhuma | `preserve()` é interpretado por IaC; não é prova de variável presente. Arquivo omite `API_KEYS_ENCRYPTION_KEY`, providers e SMTP | Revisar `plan` redigido antes de qualquer apply; não assumir segurança de variáveis omitidas |
| Dashboard | A aplicação requer comando de IaC | Config legada pode substituir setting correspondente | Docs Railway dizem que config em código sobrepõe build/deploy do Dashboard para CaC | Sem acesso, a origem atual dos valores é desconhecida |

## Fluxos de entrega encontrados no repositório

1. `.github/workflows/ci.yml`: PR e push para `main`/`develop`; Node 22, `npm ci`,
   Playwright install, lint, typecheck, build e E2E. **Não** invoca Railway IaC,
   Railway CLI, ou aplica infraestrutura.
2. `.github/workflows/deploy.yml`: push para `main` ou `workflow_dispatch`; usa
   GitHub Actions para construir a imagem do `Dockerfile` e fazer push para GHCR
   (`sha` e `latest`). Em seguida, só se `DEPLOY_WEBHOOK_URL` existir no ambiente
   GitHub `production`, faz POST ao webhook. O valor/destino/presença desse secret
   não foi lido. Este mecanismo não prova que o webhook seja Railway.
3. `.railway/railway.ts` não aparece em workflow/scripts de CI/deploy. O pacote
   `railway` está instalado, mas isso só fornece suporte para o CLI avaliar IaC.
4. `railway.toml` é consumido pelo Railway somente se a configuração do serviço
   existente estiver apontada para esse arquivo e o modo legado ainda estiver
   habilitado. Isso não foi verificado remotamente.

## Fonte da verdade — conclusão e decisão pendente

**Conhecida localmente:** fonte do artefato/container é `Dockerfile` e o workflow
`Container Delivery` no push/manual de `main`; o workflow tenta acionar um webhook
opcional desconhecido. Docker define o start real e a imagem escuta na porta
configurada pelo Next server (default 3000; `HOSTNAME=0.0.0.0`).

**Não determinada:** fonte efetiva das configurações do Railway (service source,
builder, config file path, overrides, deployment ativo, variáveis, domínio e
restart). A sessão Railway retornou Unauthorized. Nem `.railway/railway.ts` nem
`railway.toml` podem ser declarados fonte remota sem inspeção do Dashboard/
deployment ou `railway config plan` read-only autenticado.

**Recomendação para decisão do owner (não aplicada):** adotar IaC como fonte de
configuração de projeto a médio prazo, pois Config-as-Code tem sunset oficial em
2026-12-01; mas migrar somente depois de autenticar, vincular explicitamente o
projeto/ambiente certo, importar estado, resolver saúde `/api/health/live`, rever
vars/resources e inspecionar um plano completo. Até lá, nenhum arquivo foi
alterado e nenhum apply/deploy deve ser feito. Alternativamente, se o owner
confirmar que o service é legado e usa `railway.toml`, manter o `.toml` como
config operacional temporária e não aplicar IaC ao mesmo service. A decisão
final exige owner + evidência remota.

## Saúde, migração e rollback — comportamento local

- `/api/health/live`: retorna 200 independente de DB/S3; adequado ao healthcheck
  de inicialização/roteamento.
- `/api/health`: readiness; testa Postgres, schema, S3 e URL HTTPS, pode retornar
  503. Não deve substituir liveness no healthcheck de deploy.
- Railway docs: seu healthcheck é usado durante rollout até receber 2xx, depois
  que a release fica ativa **não é monitorado continuamente**; falha posterior
  nesse endpoint não provoca restart por si só. Alerts/uptime checks precisam
  ser externos/independentes, e restart policy trata falha de processo.
- `Dockerfile HEALTHCHECK` é um healthcheck OCI local da imagem; não confundir
  com o `healthcheckPath` HTTP do Railway.
- `npm run build` não migra. Docker `CMD` aplica `db-migrate.mjs` em todo start;
  `initializePostgres()` também aplica schema na primeira query de cada processo.
  Schema idempotente não é versionado/checksummed e não tem rollback `down`.
- O stream Tutor é `application/x-ndjson` com `Cache-Control: no-cache,
  no-transform`; proxy buffering/timeouts/comportamento streaming remotos não
  foram testados.
- Postgres e S3 só constam como dependências de env/código, não recursos
  provisionados pelos arquivos Railway; conectividade, ACL, persistência,
  versionamento, backup/restore e alertas remotos não verificados.

## Ações para fechar a decisão (somente leitura antes de aprovação)

1. Owner autoriza acesso read-only e identifica projeto, environment e service.
2. Inspecionar service Source/deploy trigger, Docker image/repo, config file path,
   builder/build/start, healthcheck, restart, port, volumes, domains, Postgres,
   S3, variável names e logs sanitizados.
3. Se IaC: `railway config plan --json`/`--detailed-exit-code` somente após login
   já aprovado e project/environment linked; não `apply`. Verificar qualquer
   criação/exclusão/change de variável antes de interpretar. Se legacy: obter
   path e source metadata dos deployment details; confirmar configurações do
   dashboard sem atualizar.
4. Confirmar separadamente como workflow `main`/GHCR/webhook é ligado ao serviço.
   Não mostrar nem registrar `DEPLOY_WEBHOOK_URL`.
5. Apresentar diferenças ao owner; somente então escolher arquivo, reconciliar,
   criar PR e planejar migração autorizada.
