# Diagnóstico S3 / `/api/health` — StudyAI V1.1

**Data:** 2026-10-28
**Projeto:** `D:\studyai`
**Branch local:** `v1.1-development` (auditoria iniciada em `a885ab9`)
**Railway:** projeto `studyai`, ambiente `production`, serviço `studyai-web`
**Status:** causa raiz identificada; variável corrigida pelo owner; **S3 NÃO validado em produção**
**Ações de produção nesta auditoria:** nenhuma

## Resultado

O `/api/health` retornava 503 porque o `S3_SECRET_ACCESS_KEY` configurado no
serviço `studyai-web` não correspondia ao segredo do bucket `studyai-files`.
O access key ID, bucket, endpoint, região e estilo de URL estavam corretos.

Com a credencial oficial do bucket, as chamadas read-only passaram. Com a
credencial então configurada no serviço, as mesmas chamadas falharam com
`SignatureDoesNotMatch` (HTTP 403). Não era falha de permissão IAM, DNS, TLS,
endpoint, região, `forcePathStyle` ou `HeadBucket`: era assinatura inválida por
segredo divergente.

O owner corrigiu a variável no Railway usando referência ao segredo do bucket.
Entretanto, a tentativa de redeploy controlado do commit `b87e9ee` foi bloqueada
pela plataforma. Portanto, **não há evidência de que o processo ativo tenha
recebido o novo valor**; o S3 continua **não validado em produção**.

## Evidências

### Produção

- `/api/health` público: HTTP **503**.
- PostgreSQL: `available=true`, `schemaReady=true`.
- URL pública: `publicUrlConfigured=true`.
- Object Storage: `available=false`, `mode=s3`, latência ~223 ms.
- Erro detalhado autenticado: `UnknownError` (o `HeadBucket` não devolve corpo de
  erro; por isso o SDK não expõe `SignatureDoesNotMatch` nesse comando).
- Deployment ativo: `b87e9ee` (SUCCESS, em execução).
- Deployment mais recente: `7e3d89b` (FAILED).
- Logs do deployment `7e3d89b`: 8 tentativas de healthcheck em `/api/health`
  retornando 503; “1/1 replicas never became healthy”.
- Healthcheck remoto configurado: `/api/health` (readiness), timeout 120 s.
- O `railway.toml` do commit `7e3d89b` também aponta `/api/health`.

### Correção aplicada pelo owner

- `S3_SECRET_ACCESS_KEY` foi atualizado no Railway por referência ao segredo do
  bucket `studyai-files`.
- A tentativa de redeploy controlado do commit `b87e9ee` foi bloqueada pela
  plataforma.
- Nenhum deploy, redeploy, rollback, migração remota ou escrita no bucket foi
  executado nesta auditoria.
- O deployment ativo pode continuar usando o valor antigo até um novo rollout.
  Por isso o S3 permanece **não validado**.

### Bucket

- Bucket Railway: `studyai-files` (ambiente `production`).
- Nome S3: `studyai-files-rmuyq1tg4rg`.
- Endpoint: `https://t3.storageapi.dev`.
- Região de assinatura nas credenciais: `auto`.
- Estilo de URL oficial: `virtual-host`.
- `S3_FORCE_PATH_STYLE=false` no serviço: compatível com `virtual-host`.
- Objetos: **0**; armazenamento: **0 B**.

### Comparação das credenciais (na época do diagnóstico)

| Item | Resultado |
|---|---|
| `S3_ACCESS_KEY_ID` do serviço vs. credencial do bucket | **corresponde** |
| `S3_SECRET_ACCESS_KEY` do serviço vs. credencial do bucket | **não correspondia** |
| Bucket, endpoint, região | correspondem |
| `S3_FORCE_PATH_STYLE` | corresponde (`false` / virtual-host) |

### Reprodução read-only com AWS SDK

Credencial então configurada no serviço:

- `HeadBucket` (path-style e virtual-host): **403**, `UnknownError`.
- `ListObjectsV2` (ambos): **403**, `SignatureDoesNotMatch`.
- `GetObject` de chave inexistente (ambos): **403**, `SignatureDoesNotMatch`.

Credencial oficial do bucket:

- `HeadBucket` (ambos): **200**.
- `ListObjectsV2` (ambos): **200**.
- `GetObject` de chave inexistente: **404**, `NoSuchKey` (comportamento esperado).

Nenhum objeto foi criado, alterado ou excluído. Foram apenas operações de leitura.

## Causa raiz

1. O segredo S3 do serviço estava desatualizado ou foi copiado incorretamente.
2. O SDK assina cada requisição com esse segredo; o provedor rejeita com
   `SignatureDoesNotMatch` (403).
3. `ObjectStorage.health()` traduz qualquer erro para `available:false`.
4. `/api/health` readiness inclui `storage.available`, então retorna 503.
5. O Railway usa `/api/health` como healthcheck do deployment `7e3d89b`; sem 2xx,
   o rollout falha e o deployment anterior permanece ativo.

A origem histórica da divergência (rotação de credencial, cópia manual ou
variável de outro ambiente) não pode ser determinada apenas por leitura. O que
foi demonstrado é que o valor então configurado não era aceito e o valor oficial
era aceito. A variável foi corrigida pelo owner; a causa raiz histórica está
encerrada, mas a validação operacional continua pendente.

## Por que não há correção de código

- `ObjectStorage.ts` configura endpoint, região, path-style e credenciais
  corretamente.
- O problema era o **valor** de uma variável de ambiente, não a lógica da
  aplicação.
- Alterar o healthcheck para ignorar S3 esconderia uma indisponibilidade real de
  upload/armazenamento e violaria o requisito de não mascarar a falha.
- Nenhum código foi alterado nesta investigação.

## Validação pendente (requer autorização separada)

1. Quando a plataforma liberar, executar redeploy controlado do commit aprovado.
   A escolha entre `b87e9ee` e um commit da V1.1 é decisão do owner; não fazer
   por inferência.
2. Confirmar `/api/health/live` 200 e `/api/health` 200.
3. Confirmar com `HEALTH_SECRET` que `objectStorage.available=true`, sem exibir o
   segredo.
4. Repetir `HeadBucket`/`ListObjects` read-only com as variáveis do serviço.
5. Validar escrita real (PutObject/GetObject/DeleteObject) apenas com autorização
   específica, preferencialmente em bucket/ambiente não produtivo ou com objeto
   canário em prefixo dedicado. O bucket está vazio; não há evidência de que
   `ServerSideEncryption=AES256` seja aceito pelo provedor.

Nenhuma dessas ações foi executada nesta auditoria.

## Healthcheck

Não trocar `/api/health` por `/api/health/live` apenas para o deployment passar.
O S3 continua indisponível para uploads até a validação. Depois da correção, a
recomendação é:

- Railway rollout healthcheck: `/api/health/live` (processo HTTP);
- monitor contínuo de readiness: `/api/health` com alerta externo.

Essa separação deve ser decidida e testada. A branch `v1.1-development` já usa
liveness no `railway.toml`, mas o serviço em produção está no `main`. O commit
`7e3d89b` é ancestral de `a885ab9`; portanto, a produção está atrás da
`v1.1-development`.

## Riscos e pendências

- O redeploy está bloqueado pela plataforma; o processo ativo pode continuar com
  o segredo antigo. O S3 **não está validado**.
- `S3_SERVER_SIDE_ENCRYPTION=AES256` ainda não foi comprovado com uma escrita
  real; pode ser uma segunda falha após o redeploy.
- A mudança de variável pode exigir novo deployment para o container receber o
  valor; confirmar o comportamento de staged changes do Railway.
- Há divergência de configuração remota: o manifesto do deployment mostra
  `restartPolicyMaxRetries=10`, enquanto o `railway.toml` local de `7e3d89b`
  declara 5. Não é a causa do 503, mas deve ser reconciliado.
- O serviço em produção está no `main`; a V1.1 está em `v1.1-development`.
  Não publicar por inferência.
- O bucket tem 0 objetos; não há dados S3 a recuperar, mas também não há prova de
  upload bem-sucedido.
- Qualquer alteração de credencial, deploy, restart, migração ou escrita no
  bucket exige autorização explícita e janela aprovada.

## Testes executados nesta auditoria

- `npx playwright test tests/health.spec.ts`: **2/2 passed**.
- `npm run lint`: **0 erros**, 75 warnings existentes.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS** após limpeza de `.next` (Next.js 15.5.28, 45/45
  páginas). A falha intermitente `spawn UNKNOWN` era cache/artefato local.
- Harness real de concorrência (`scripts/verify-app-concurrency.mjs`): **8/8**.
- Suíte Playwright completa: **214/218 passaram** na primeira execução. O único
  grupo não executado foi o de concorrência real de aplicação (4 testes), porque
  o `next dev` remove `.next/standalone` antes do harness. Reexecução isolada de
  `tests/concurrency.spec.ts` com cópia estável do standalone: **10/10**.
  Uma segunda execução completa foi interrompida pelo reinício do servidor em
  42/218, sem falhas observadas; não foi usada como aprovação.
- Cobertura final: os 218 testes distintos têm execução aprovada entre a suíte
  completa e a reexecução do spec de concorrência.
- `git diff --check` da working tree: **limpo**. O diff `main...HEAD` ainda
  contém 111 avisos históricos de whitespace em 29 arquivos, sem impacto
  funcional e não introduzidos por esta auditoria.

## Arquivos alterados

- Nenhum arquivo de código ou configuração de produção.
- Este relatório e o endurecimento do `.gitignore` são parte da preparação local
  da branch; nenhum push foi executado.

## Autorização necessária

Para validar o S3 em produção, é necessária autorização explícita, em etapa
separada, para:

1. executar redeploy/restart do commit aprovado quando a plataforma liberar;
2. opcionalmente, realizar escrita canário no bucket para validar `PutObject` e
   SSE.

Sem essas autorizações, o diagnóstico está concluído, mas a produção permanece
em 503 e o deployment `7e3d89b` não deve ser promovido.
