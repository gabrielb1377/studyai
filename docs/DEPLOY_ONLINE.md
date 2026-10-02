# Deploy online do StudyAI

Este guia prepara o StudyAI para permanecer disponível sem depender de um computador pessoal ligado. Ele descreve o estado real do repositório e três estratégias de implantação. Para a Beta, a opção recomendada é Railway com PostgreSQL gerenciado, Object Storage S3 compatível e um provider remoto de IA.

> O repositório está preparado para implantação, mas não provisiona contas, domínio, banco, bucket, SMTP ou providers. Esses recursos precisam ser criados no ambiente escolhido.

## Arquitetura de produção

```text
Navegador / PWA
       ↓ HTTPS
Next.js (páginas + Route Handlers)
       ├─ PostgreSQL — contas, sync, colaboração e metadados
       ├─ S3 compatível — PDFs, mídia e arquivos gerados
       ├─ SMTP — verificação e recuperação de conta
       └─ AIService → ProviderManager → Gemini/OpenRouter/Groq
```

Providers e chaves permanecem no servidor. O navegador chama apenas as rotas internas do Next.js. IndexedDB, OPFS e Cache Storage continuam como cache offline do dispositivo; não são a fonte compartilhada entre dispositivos.

Em produção, o runtime exige PostgreSQL e S3. O fallback em memória e o armazenamento binário em banco permanecem disponíveis somente no desenvolvimento. Ollama continua opcional e só é consultado em produção quando `OLLAMA_URL` aponta para uma instância acessível pelo servidor.

## Requisitos

- Node.js 22 e npm para validação local.
- Repositório Git acessível pela plataforma de deploy.
- PostgreSQL 15 ou superior.
- Bucket S3 compatível: Railway Object Storage, Cloudflare R2, Supabase Storage com API S3, AWS S3 ou MinIO.
- Um provider remoto de IA configurado: Gemini, OpenRouter ou Groq.
- SMTP para cadastro, verificação de email e recuperação de senha.
- HTTPS público.

## Variáveis de ambiente

Use [`.env.production.example`](../.env.production.example) como referência. Nunca copie valores reais para o Git.

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `APP_URL` | Sim | Origem HTTPS canônica usada em emails, convites e compartilhamentos. |
| `NEXT_PUBLIC_APP_URL` | Recomendada | URL pública não sensível usada por builds/clientes externos. |
| `AUTH_SECRET` | Sim | Assinatura das sessões e tokens. Use um valor aleatório longo. |
| `HEALTH_SECRET` | Sim | Autoriza diagnóstico detalhado em `/api/health`. |
| `DATABASE_URL` | Sim | Conexão PostgreSQL. |
| `DATABASE_SSL` | Sim | Use `true` para bancos públicos com TLS e `false` somente em rede privada confiável. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Recomendada | Mantém validação do certificado; desative apenas quando o provedor exigir e documentar. |
| `DATABASE_POOL_SIZE` | Não | Limite do pool; padrão `10`. Em serverless use um valor baixo ou pooler. |
| `S3_ENDPOINT` | Depende do provedor | Endpoint para R2, Supabase, MinIO ou outro S3 compatível. AWS pode omitir. |
| `S3_REGION` | Sim | Região do bucket. |
| `S3_BUCKET` | Sim | Bucket privado. |
| `S3_ACCESS_KEY_ID` | Sim | Credencial server-side. |
| `S3_SECRET_ACCESS_KEY` | Sim | Credencial server-side. |
| `S3_FORCE_PATH_STYLE` | Sim | Normalmente `true` para MinIO/R2/Supabase e `false` para AWS. |
| `S3_SERVER_SIDE_ENCRYPTION` | Sim | `AES256` quando suportado; `none` somente no MinIO local sem suporte configurado. |
| `GEMINI_API_KEY` | Uma chave de IA | Provider Gemini. |
| `OPENROUTER_API_KEY` | Uma chave de IA | Provider OpenRouter. |
| `GROQ_API_KEY` | Uma chave de IA | Provider Groq. |
| `OLLAMA_URL` | Não | Ollama remoto ou na rede privada. Não use `localhost` na cloud. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Sim para contas | Email transacional. |
| `FEEDBACK_EMAIL` | Não | Destino do feedback da Beta. |
| `CAPACITOR_SERVER_URL` | Para mobile | Mesma URL HTTPS pública do app. |

`AUTH_SECRET`, chaves de IA, credenciais S3, SMTP, `DATABASE_URL` e `HEALTH_SECRET` nunca podem usar o prefixo `NEXT_PUBLIC_`.

Gere segredos com um gerador criptográfico da plataforma ou, localmente, com `openssl rand -base64 48`. Não cole o resultado em documentação, issues ou logs.

## Banco e migrações

O schema versionável está em `src/server/database/schema.sql`. Execute antes de liberar tráfego:

```bash
npm run db:migrate
```

O comando exige `DATABASE_URL`, aplica o schema dentro de uma transação e não imprime a URL. Não existe seed de produção no projeto.

O container também executa a migração antes de iniciar o servidor. `/api/health` confirma conexão e presença do schema. Uma falha de banco retorna `503` e as APIs apresentam uma mensagem genérica, sem expor detalhes da conexão.

## Opção A — Railway (recomendada para a Beta)

### 1. Criar os serviços

1. Envie o repositório para o GitHub sem arquivos `.env`.
2. No Railway, crie um projeto a partir do repositório.
3. Adicione o serviço Next.js usando o `Dockerfile` existente. O arquivo `railway.toml` configura `/api/health` e reinício em falha.
4. Adicione um PostgreSQL ao mesmo projeto.
5. Crie ou conecte um bucket S3 compatível. Se o Object Storage escolhido estiver fora do Railway, mantenha o bucket privado.

### 2. Configurar o ambiente

No serviço da aplicação:

- defina `APP_URL` e `NEXT_PUBLIC_APP_URL` com o domínio público do Railway, por exemplo `https://studyai-production.up.railway.app`;
- associe `DATABASE_URL` ao PostgreSQL;
- em conexão privada sem TLS, use `DATABASE_SSL=false`; para conexão pública, use TLS;
- configure todas as variáveis S3;
- configure `AUTH_SECRET`, `HEALTH_SECRET`, SMTP e pelo menos um provider remoto de IA;
- deixe `OLLAMA_URL` vazio, salvo se houver uma instância Ollama acessível pela própria cloud.

### 3. Implantar

O Railway construirá a imagem, executará `npm run db:migrate` pelo comando do container, iniciará o Next.js e aguardará `/api/health` responder `200`. Se banco, schema ou S3 estiverem indisponíveis, o health check responderá `503` e a versão não ficará saudável.

Depois do primeiro deploy:

```bash
curl --fail https://SEU-DOMINIO/api/health
```

Para diagnóstico autorizado:

```bash
curl --fail -H "x-health-secret: SEU_HEALTH_SECRET" https://SEU-DOMINIO/api/health
```

Não publique a segunda resposta nem o segredo.

### 4. Deploy automático

A integração Railway + GitHub pode implantar o branch definido a cada push. O workflow existente também publica uma imagem no GHCR e aceita um webhook opcional; escolha um único gatilho de produção para evitar deploys duplicados.

## Opção B — Vercel + Supabase

### Aplicação

1. Importe o repositório na Vercel.
2. Use os comandos padrão `npm run build` e o runtime Node.js.
3. Configure todas as variáveis no ambiente Production.
4. Defina `APP_URL` e `NEXT_PUBLIC_APP_URL` com a URL da Vercel ou domínio próprio.

### PostgreSQL

1. Crie um projeto Supabase.
2. Use a connection string do pooler para funções serverless.
3. Reduza `DATABASE_POOL_SIZE` para um valor adequado ao plano.
4. Execute `npm run db:migrate` de um ambiente confiável com acesso ao banco.

### Storage

Configure a API S3 do Supabase Storage ou outro S3 compatível. O bucket deve ser privado e as chaves ficam somente no ambiente server-side.

### Limitação verificada

O endpoint atual de arquivos recebe o corpo pelo Route Handler antes de enviar ao S3 e aceita até 100 MB. Plataformas serverless podem impor limites de corpo e duração menores que esse valor. Portanto, para importações grandes, Railway ou VPS são as opções recomendadas. Um futuro upload direto assinado para S3 eliminaria essa restrição; ele não faz parte desta entrega.

Teste autenticação, cookies, SMTP, upload e geração de IA no domínio final. Como o frontend e as APIs são same-origin, CORS adicional não é necessário no cenário padrão.

## Opção C — VPS + Docker Compose

### Preparação

1. Aponte o DNS do domínio para o IP público da VPS.
2. Instale Docker Engine e Docker Compose.
3. Libere as portas 80 e 443.
4. Copie `.env.production.example` para um arquivo fora do Git e preencha secrets reais.
5. Defina `STUDYAI_DOMAIN` sem protocolo, por exemplo `studyai.seudominio.com`.

### Inicialização

```bash
docker compose --env-file .env.production pull
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs -f app proxy
```

O Compose sobe Next.js, PostgreSQL, MinIO e Caddy. Caddy obtém e renova HTTPS automaticamente quando DNS e portas estão corretos. O container da aplicação migra o banco antes de iniciar.

### Operação

- Faça backup dos volumes `postgres-data`, `object-data` e `caddy-data`.
- Restrinja SSH, atualize imagens e monitore espaço em disco.
- Não publique as portas internas do PostgreSQL ou MinIO.
- Use um gerenciador de secrets ou arquivo com permissões restritas.
- Rotacione credenciais após qualquer exposição.

## Domínio, DNS, HTTPS e cookies

- O domínio gratuito da plataforma é suficiente para a Beta.
- Para domínio próprio, configure `CNAME` ou registros `A/AAAA` conforme o provedor.
- Atualize `APP_URL`, `NEXT_PUBLIC_APP_URL` e `CAPACITOR_SERVER_URL` após trocar de domínio.
- Produção exige HTTPS. Cookies de acesso e refresh são `HttpOnly`, `Secure` e `SameSite=Strict`.
- CSRF usa double-submit cookie/header nas rotas mutáveis.
- O middleware aplica CSP, HSTS, bloqueio de frames e `nosniff`.
- Não configure CORS aberto. O fluxo normal usa a mesma origem.

## IA em produção

O fluxo obrigatório é:

```text
Feature → AIClient → Route Handler → AIService → ProviderManager → provider
```

Tutor, Professor, Mentor, Academy, Lab, resumos, flashcards e quizzes reutilizam essa camada. Chaves não são enviadas ao navegador. Para a Beta, configure Gemini, OpenRouter ou Groq. Ollama é opcional e precisa de uma URL alcançável pelo servidor; `localhost` dentro da cloud aponta para o próprio container, não para o computador do usuário.

## Arquivos e Object Storage

Arquivos importados e gerados são enviados ao S3 com uma chave isolada por usuário. PostgreSQL mantém hash, tamanho e chave do objeto. IndexedDB/OPFS armazenam cópias locais e cache offline por dispositivo.

Valide especificamente:

- PDF importado e reaberto em outro dispositivo;
- materiais e exportações da Academy;
- apresentações geradas;
- exclusão e substituição de arquivo;
- backup estruturado;
- download sob demanda após limpar o cache local.

O backup atual preserva registros estruturados; a política de backup do bucket deve ser configurada separadamente pelo provedor.

## PWA e dispositivos móveis

O manifest, os ícones e o service worker são servidos pelo próprio Next.js. Em HTTPS:

1. abra o app no celular;
2. conclua login e onboarding;
3. use “Adicionar à tela inicial”;
4. confirme que o app abre em modo standalone;
5. teste Biblioteca, Academy, Tutor/Professor, Workspace e Lab;
6. coloque o aparelho offline e confirme a abertura do shell/cache;
7. volte à rede e confirme a retomada do Cloud Sync.

O Lab oferece uma experiência reduzida em telas pequenas. Funcionalidades que dependem do servidor ou provider remoto exigem rede; dados já sincronizados continuam disponíveis pelo cache local.

## Health check

`GET /api/health` retorna:

- status geral (`ok` ou `degraded`);
- versão;
- ambiente;
- conexão e schema PostgreSQL;
- disponibilidade do Object Storage;
- latência dos serviços.

Detalhes de erro e runtime só aparecem em desenvolvimento ou quando o header `x-health-secret` corresponde a `HEALTH_SECRET`. Nenhum segredo é retornado.

## Segurança antes da publicação

- Confirme que `.env`, `.env.local` e `.env.production` não estão rastreados.
- Faça uma varredura de segredos antes do push.
- Use `AUTH_SECRET` e `HEALTH_SECRET` fortes e distintos.
- Mantenha bucket privado e criptografia server-side.
- Configure SMTP real; produção não devolve tokens de verificação/recuperação.
- Revise limite de upload de 100 MB no proxy/plataforma.
- Mantenha CSP, CSRF, cookies seguros e rate limit ativos.
- Não registre tokens, cookies, prompts ou conteúdo de materiais.
- Em múltiplas réplicas, mova o rate limit em memória para um armazenamento compartilhado antes de escalar horizontalmente.

## Performance

Monaco, Mermaid, SQL/WASM, geradores PDF/PPTX e visualizadores continuam carregados sob demanda. Para produção:

- use CDN da plataforma para assets estáticos;
- mantenha compressão habilitada;
- monitore memória durante OCR/transcrição;
- prefira Railway/VPS para tarefas longas;
- ajuste pool PostgreSQL ao número de réplicas;
- acompanhe `/api/health` e logs sem dados pessoais.

## Checklist pós-deploy

Execute integralmente [`DEPLOY_CHECKLIST.md`](DEPLOY_CHECKLIST.md). A implantação só deve ser considerada pronta quando o app funcionar pelo celular e por outro computador com o PC local desligado.

## Solução de problemas

| Sintoma | Verificação |
| --- | --- |
| `/api/health` retorna `503` | Confira `DATABASE_URL`, migração, credenciais/bucket S3 e conectividade. |
| `schemaReady` é falso | Execute `npm run db:migrate`. |
| Cadastro falha em produção | Verifique PostgreSQL, `AUTH_SECRET`, SMTP e `APP_URL`. |
| Email aponta para domínio errado | Corrija `APP_URL` e faça novo deploy. |
| Upload funciona localmente, mas falha na Vercel | Verifique limite de body/duração; use Railway/VPS para arquivos grandes. |
| S3 retorna acesso negado | Revise política do bucket, endpoint, região, path-style e credenciais. |
| IA aparece offline | Configure a chave server-side e teste o provider em Configurações. |
| Ollama não aparece | Configure uma `OLLAMA_URL` alcançável pelo servidor ou use provider remoto. |
| PWA não instala | Confirme HTTPS, manifest, ícones e service worker no DevTools. |
| Cookie não persiste | Confirme HTTPS, domínio canônico e ausência de proxy que remova headers. |
