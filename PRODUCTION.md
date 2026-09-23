# StudyAI em produção

Este documento descreve a infraestrutura preparada na Sprint 32. Ele não substitui o runbook do provedor de hospedagem nem provisiona domínio, DNS ou credenciais.

## Arquitetura de referência

```text
Internet
  → Caddy (HTTPS, HSTS, gzip/zstd)
  → Next.js standalone
      ├─ PostgreSQL: contas, metadados, sync, backups e índices
      ├─ S3/MinIO: binários grandes isolados por usuário
      └─ SMTP e providers de IA: integrações server-only
```

O navegador mantém um IndexedDB por usuário como cache offline. Materiais originais podem permanecer no OPFS para acesso rápido. O Cloud Sync envia deltas e hashes; o servidor nunca usa uma chave de Object Storage compartilhada entre identidades.

## Variáveis obrigatórias

Copie `.env.production.example` para o cofre de secrets da plataforma. Não versione o arquivo preenchido.

| Variável | Uso |
| --- | --- |
| `STUDYAI_DOMAIN` | Host público usado pelo proxy HTTPS. |
| `DATABASE_URL` | PostgreSQL persistente. |
| `AUTH_SECRET` | Assinatura de sessões; mínimo de 32 caracteres aleatórios. |
| `S3_BUCKET` e credenciais | Bucket privado S3 compatível para materiais. |
| `HEALTH_SECRET` | Libera detalhes do health check para o monitor autorizado. |
| `SMTP_*` | Verificação de email e recuperação de conta. |

As chaves Gemini/OpenRouter/Groq são opcionais. Ollama continua apropriado apenas onde o servidor consegue alcançar sua instância local.

## Inicialização local da infraestrutura

```bash
docker compose up --build -d
docker compose ps
curl -H "Authorization: Bearer $HEALTH_SECRET" https://localhost/api/health
```

O Compose cria volumes duráveis para PostgreSQL, MinIO e Caddy. Troque todas as senhas padrão antes de expor o ambiente. Para um serviço S3 gerenciado, remova MinIO do ambiente e informe o endpoint/credenciais do provedor.

## DNS, HTTPS e CDN

1. Aponte o registro A/AAAA do domínio para o host.
2. Defina `STUDYAI_DOMAIN` com o domínio real.
3. Libere 80/443 para o desafio ACME e tráfego HTTPS.
4. Mantenha o bucket privado; arquivos passam pelos Route Handlers autenticados.
5. Se houver CDN, não faça cache de `/auth`, `/sync`, `/api/files` ou respostas privadas.

Caddy cuida do certificado e da renovação. O middleware da aplicação mantém CSP, HSTS, proteção contra framing e MIME sniffing.

## Observabilidade e privacidade

- `/api/health` retorna somente estado mínimo sem autenticação.
- Detalhes exigem `Authorization: Bearer <HEALTH_SECRET>`.
- Métricas do cliente são desativadas por padrão e dependem de consentimento.
- O endpoint de telemetria aceita apenas métricas numéricas allowlisted.
- Prompts, arquivos, mensagens, notas e respostas não devem ser enviados para telemetria.

Configure retenção e alerta no provedor de logs. Nunca grave cookies, tokens, chaves ou conteúdo acadêmico nos logs.

## Backups

- PostgreSQL: snapshot diário e teste periódico de restauração.
- Object Storage: versionamento e lifecycle definidos no bucket.
- Caddy: o volume contém certificados; pode ser recriado, mas deve ser preservado para evitar limites ACME.
- Execute restaurações em homologação antes de promover uma release.

## Pipeline de entrega

O workflow de CI executa lint, TypeScript, build e Playwright. O workflow de deploy publica uma imagem no GHCR e pode chamar um webhook de implantação configurado como secret. Produção e homologação devem usar secrets e bancos/buckets separados.

## Checklist de release

- [ ] `npm ci`, lint, typecheck, build e Playwright aprovados.
- [ ] Migração do schema revisada e backup restaurável confirmado.
- [ ] PostgreSQL, S3, SMTP e providers testados em homologação.
- [ ] `AUTH_SECRET`, `HEALTH_SECRET` e senhas rotacionados.
- [ ] DNS e HTTPS válidos; cookies `Secure` confirmados.
- [ ] Bucket privado, CORS mínimo e versionamento habilitado.
- [ ] Fluxos offline, sync, conflito e restauração exercitados.
- [ ] Alertas de saúde, erro, latência, memória e espaço configurados.
- [ ] Consentimento e política de privacidade revisados.

## Limites operacionais atuais

A configuração não publica automaticamente um domínio e não cria contas em provedores externos. O build iOS requer macOS/Xcode; lojas mobile e feed assinado do Electron exigem credenciais próprias. Vulnerabilidades transitivas do pipeline local de ML devem ser atualizadas em uma Sprint isolada com regressão de OCR, Whisper e embeddings.
