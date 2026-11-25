# StudyAI V1.2 — Operação com Custo Zero (R$ 0/mês), Alternativas Gratuitas e Homologação Local

**Data:** 24/11/2026  
**Orçamento autorizado pelo owner:** **R\$ 0/mês** (sem cadastro de cartão, sem cobrança automática, sem chamadas pagas de IA, sem compra de domínio).  
**Roadmap funcional:** inalterado (V1.2 encerrada funcionalmente na Sprint 58; `PS-1b` e V1.3 mantidos fora do escopo).

---

## 1. Preservação de Recursos Existentes e Riscos de Retenção (Railway)

Nenhum recurso remoto foi excluído, reativado, migrado ou alterado.

| Recurso existente | Estado atual | Risco de retenção / exclusão por inatividade | Ação recomendada ao owner (R\$ 0) |
|---|---|---|---|
| Railway `Postgres` + `postgres-volume` (`108,10 MB` / `500 MB`) | Serviço `REMOVED` (trial expirado/parado); volume `READY` | **ALTO:** política oficial do Railway retém volumes de trial expirado por **30 dias** após o término do trial; passado o prazo sem ação, o volume é excluído permanentemente e não pode ser acessado via CLI enquanto offline. | Conferir imediatamente no dashboard do Railway a data agendada de expiração do volume e, se elegível, **transicionar o workspace para o Railway Free Plan (R\$ 0, sem cartão, crédito recorrente de US\$ 1/mês com sleep-on-idle)** apenas se quiser manter/exportar `pg_dump` sem pagar. |
| Railway Bucket `studyai-files` (`studyai-files-rmuyq1tg4rg`) | Provisionado (`t3.storageapi.dev`) | Retido junto ao projeto enquanto o workspace permanece ativo; sujeito à política de expiração/inatividade do workspace trial. | Verificar status no dashboard do Railway; não enviar arquivos de teste nem excluir sem inventário prévio. |
| Railway `studyai-web` + 35 variáveis | `FAILED` (`main@7e3d89b`) | Config as Code (`railway.toml`) entra em **sunset em 2026-12-01**. `.railway/railway.ts` já está validado localmente com `railway config plan` (`0 add / 0 change / 1 destroy` apenas na chave corrompida `\tAPI_KEYS_ENCRYPTION_KEY`). | Manter `railway.toml` até autorização; nunca executar `railway config apply` sem corrigir `\tAPI_KEYS_ENCRYPTION_KEY` e decidir o destino do workspace. |
| Branches Git (`main`, `v1.1-development`, `exp/s3-direct-upload`) | Preservadas (`7e3d89b`, HEAD atual, `7b7be19`) | Sem custo ou expiração no GitHub. | Manter `main` e `exp/s3-direct-upload` intocadas. |

---

## 2. Comparativo Técnico de Alternativas Gratuitas (Documentação Oficial 2026)

### 2.1 Hospedagem de Aplicação (Next.js)

| Provedor | Next.js Standalone / SSR | Streaming / SSE IA | Upload máx. | Timeout / CPU | Tráfego / Compute | Suspensão por inatividade | Exige cartão? | Uso comercial no free? | Risco de cobrança | Esforço de adaptação |
|---|---|---|---|---|---|---|---|---|---|---|
| **Vercel Hobby** | Sim (adapter nativo, não usa `standalone` Docker) | Sim (Fluid Compute / streaming nativo) | **4,5 MB** padrão (Beta até 20 MiB com 4 GB RAM; **incompatível com uploads de até 100 MB via API route**) | Até **120 s** | 100 GB/mês transferência | Não hiberna (serverless) | **Não** | **NÃO (estritamente uso pessoal/não comercial)** | Zero (hard stop) | Médio (upload >4,5 MB exigiria presigned S3) |
| **Render Free** | **Sim (Docker `standalone` nativo)** | Sim (Node HTTP streaming) | Sem teto fixo de gateway, limitado por **512 MB RAM** e timeout | Proxy HTTP padrão; 512 MB RAM / <1 vCPU | 750 h/mês, 5 GB egress/mês | **Dorme após 15 min** (~1 min cold start) | **Não** (pode pedir verificação US\$ 1 reembolsável) | Aviso oficial: "não usar em produção" | Zero no free | **Baixo** (usa `Dockerfile` existente) |
| **Railway Free** | **Sim (Docker `standalone` nativo)** | Sim | Limitado por RAM (**512 MB**) | 1 vCPU / 512 MB RAM | **US\$ 1 crédito/mês** (1 projeto, até 3 serviços, 1 vol 500 MB, 1 bucket 10 GB) | **Dorme após 5–10 min** sem tráfego | **Não** | Uso hobby/leve até acabar o crédito de US\$ 1 | **Zero** (serviços param ao zerar US\$ 1) | **Zero** (já configurado) |
| **Cloudflare Workers Free** | Não nativo (`OpenNext` adapter exigido) | Streaming I/O, mas **teto rígido de 10 ms CPU/req** | Limitado por Worker/RAM (128 MB) | **10 ms CPU** (inviável para SSR pesado/crypto `scrypt`/PDF) | 100k req/dia, banda ilimitada | Não hiberna | **Não** | **Sim (permitido)** | Zero | **Alto** (`pg`/TCP, `scrypt`, Node APIs exigem reescrita) |
| **Koyeb Free (Eco)** | Sim (Docker) | Sim | Limitado por 512 MB RAM | 0,1 vCPU / 512 MB RAM | 100 GB/mês, 1 serviço | Dorme após 1h | **SIM (obrigatório — EXCLUÍDO)** | Apenas hobby/protótipo | Pré-autorização / cartão cadastrado | Baixo, mas **violaria regra sem cartão** |

### 2.2 Banco de Dados PostgreSQL

| Provedor | Armazenamento | Compute / RAM | Pooler & Locks (`FOR UPDATE` / advisory locks) | Suspensão / Inatividade | Exige cartão? | Backups | Esforço de adaptação |
|---|---|---|---|---|---|---|---|
| **Neon Free** | **1 GB/projeto** (até 20 GB conta, 100 projetos, 10 branches) | Até 2 CU (~8 GB RAM autoscale), **100 CU-h/mês** | Direto e pooler; compatível com transações e advisory locks (usar conexão direta/session para `db:migrate` e `db:cleanup`) | **Scale-to-zero após 5 min**; **acorda automaticamente** na próxima conexão (~centenas de ms) | **Não** | Branching / histórico limitado no free | **Zero** (`DATABASE_URL` + TLS padrão) |
| **Supabase Free** | **500 MB/projeto** (2 projetos ativos) | Shared CPU / 0,5 GB RAM (Nano) | **Supavisor Session Mode (5432)** ou Direct compatíveis; evitar Transaction Mode (6543) para `db:migrate` | **Pausa após 7 dias** de inatividade (**exige reativação manual no dashboard**) | **Não** | Sem backups automáticos diários no free (fazer `pg_dump` manual) | **Zero** (`DATABASE_URL` + `DATABASE_CA_CERT`) |
| **Render Postgres Free** | 1 GB | Limitado | Direto | **BANCO EXCLUÍDO APÓS 30 DIAS — INVIÁVEL** | Não | Não | **Descartado (perda garantida em 30 dias)** |

### 2.3 Object Storage S3-Compatível

| Provedor | Cota gratuita | Limite por arquivo | Compatibilidade S3 (`@aws-sdk/client-s3`) | Exige cartão? | Observação |
|---|---|---|---|---|---|
| **Supabase Storage Free** | **1 GB** armazenamento, 5 GB egress/mês | **50 MB/arquivo** (menor que os 100 MB atuais do StudyAI) | **Sim** (protocolo S3 nativo com `S3_FORCE_PATH_STYLE=true`) | **Não** | Único S3 gerenciado gratuito **sem cartão**, porém limitado a 1 GB total / 50 MB por arquivo. |
| **Cloudflare R2 Free** | **10 GB/mês**, 1M Class A, 10M Class B, **egress zero** | Até 5 GB (single PUT) | **Sim** (100% compatível) | **SIM (obrigatório — EXCLUÍDO sob regra R\$ 0 sem cartão)** | Excelente tecnicamente, mas exige método de pagamento cadastrado para ativar. |
| **Railway Bucket (Free Plan)** | **10 GB** (dentro do limite de US\$ 1/mês) | Compatível (`t3.storageapi.dev`) | **Sim** (já integrado) | **Não** (no Free Plan) | Depende do limite mensal de US\$ 1 do workspace. |

### 2.4 SMTP Transacional (Verificação de E-mail e Recuperação de Senha)

| Provedor | Limite gratuito | Exige cartão? | Domínio próprio | Observação / Limitação |
|---|---|---|---|---|
| **Resend Free** | **3.000 e-mails/mês** (**100/dia**) | **Não** | Sim (até 3 domínios; **sem domínio próprio só envia para o próprio e-mail do dono da conta**) | Sem branding forçado; ótimo para homologação/beta pequeno quando houver domínio verificado. |
| **Brevo Free** | **300 e-mails/dia** (~9.000/mês) | **Não** | Opcional (permite remetente verificado, porém entregabilidade pública exige domínio próprio com SPF/DKIM/DMARC) | Inclui rodapé obrigatório *"Sent with Brevo"*. |

---

## 3. Arquitetura Gratuita Recomendada (Sem Reescrever o StudyAI)

### 3.1 Recomendação Imediata (Operacional Hoje — R\$ 0,00 / Sem Cartão): **Homologação 100% Local de Fidelidade de Produção**
- **Stack local validada:** `node .next/standalone/server.js` (`NODE_ENV=production`) + **PostgreSQL 18.4 local** + **Servidor S3 local** (`http://127.0.0.1`, path-style, `AES256`) + **Servidor SMTP local RFC 5321** (ou Mailpit) + **Provedores de IA simulados** + **Playwright** + **`pg_dump`/`psql`**.
- **Por que é superior para o fechamento técnico da V1.2:**
  - Custo real **R\$ 0,00**, **zero cartão**, **zero risco de cobrança**.
  - **Zero modificação arquitetural** no StudyAI (mantém 100% da portabilidade para Docker/Railway/Render/Supabase/Neon no futuro).
  - Exercita fielmente uploads até 100 MB, streaming de IA, cotas acumuladas, `TRUST_PROXY_HEADERS`, SMTP real, `pg_dump`/restore e rollback sem restrições artificiais de 4,5 MB ou sleep de 15 min.

### 3.2 Opção Futura para Preview/Homologação Remota R\$ 0 (Sem Cartão — Apenas quando autorizado pelo owner)
- **Web:** **Render Free** (Docker `standalone`, aceita dormir após 15 min) ou **Railway Free** (se o workspace migrar para o plano Free de US\$ 1/mês). *(Não usar Vercel Hobby para uso comercial/público devido à licença non-commercial e ao teto de 4,5 MB).*
- **Banco:** **Neon Free** (1 GB, auto-wake em ms, sem pausa manual de 7 dias) ou **Supabase Free** (500 MB, ciente da pausa após 7 dias sem uso).
- **Storage S3:** **Supabase Storage Free** (1 GB total, 50 MB/arquivo — ajustar `MAX_FILE_BYTES` apenas se optar por ele) ou bucket existente no Railway Free.
- **SMTP:** **Brevo Free** (300/dia, sem cartão) para testes controlados; para público geral continuará necessário domínio próprio com SPF/DKIM/DMARC (que hoje está bloqueado pela restrição de não contratar domínio).

### 3.3 Limitações Reais do Cenário R\$ 0/mês para Lançamento Público
- **Nenhum tier R\$ 0 sem cartão sustenta lançamento público confiável com SLA:**
  1. Sem domínio próprio contratado → e-mails transacionais (verificação obrigatória do Lote 3B e reset de senha) sofrem bloqueio/spam ou restrição de destinatário (Resend).
  2. Hospedagem gratuita sem cartão tem **hibernação (15 min no Render / 5–10 min no Railway Free)**, **512 MB RAM** e **parada abrupta ao atingir US\$ 1** ou proibição comercial (**Vercel Hobby**).
  3. Storage S3 gratuito sem cartão limita-se a **1 GB total / 50 MB por arquivo** (Supabase Storage), abaixo da cota por conta de 1.024 MiB da V1.2.
  4. **Conclusão:** a V1.2 pode ser **tecnicamente concluída e homologada localmente**, mantendo **Homologação Remota** e **Publicação Pública** explicitamente como **pendentes (NO-GO)** até que haja infraestrutura pública compatível — sem bloquear o avanço do roadmap funcional em branches de desenvolvimento.

---

## 4. Plano Reproduzível de Homologação Local (Lote 5 Local)

Suíte automatizada criada em [tests/lote5-local-homologation.spec.ts](file:///d:/studyai/tests/lote5-local-homologation.spec.ts):

1. Subir PostgreSQL 18.4 local descartável (`initdb` + `postgres.exe -p 55434` + `createdb studyai_homolog_l5`).
2. Executar `npm run db:migrate` (`scripts/db-migrate.mjs`) e `npm run build` (standalone).
3. Executar `tests/lote5-local-homologation.spec.ts` com `STUDYAI_RUN_LOCAL_HOMOLOGATION=1`, `STUDYAI_ALLOW_LOCAL_DB_TESTS=1`, `DATABASE_URL=...`, `--retries=0`:
   - Sobe servidor SMTP RFC 5321 local + servidor S3 HTTP local + **`node .next/standalone/server.js`** em `NODE_ENV=production`.
   - Valida `GET /api/health/live` (`200`) e `GET /api/health` (`200 ok`, PG + 35 tabelas + S3 + proxy + SMTP).
   - Valida registro (token oculto em produção), captura real de e-mail SMTP, bloqueio `403 EMAIL_NOT_VERIFIED` em `/api/tutor`, `POST /auth/verify/resend`, verificação single-use, recuperação + reset de senha via SMTP com revogação imediata da sessão (`401`).
   - Valida upload/download/cota `413 STORAGE_QUOTA_EXCEEDED`/exclusão em S3 real com `AES256`.
   - Valida sync + criação de backup + mutação + restore atômico real.
   - Valida `POST /api/internal/maintenance/cleanup` (`401`/`200`) e `TRUST_PROXY_HEADERS=true` anti-spoofing + `429`.
   - Valida backup lógico **`pg_dump`** + restore **`psql`** em banco zerado confirmando as **35 tabelas** e dados restaurados.
4. Executar em paralelo as suítes PG de migrations/rollback/concorrência (`lote4-infrastructure-readiness`, `lote3-ai-storage-governance`, `lote2-postgres-atomicity`, `verify-concurrency.mjs`).

---

## 5. Separação Formal de Estados de Fechamento da V1.2

| Marco | Estado | Evidência |
|---|---|---|
| **1. Desenvolvimento V1.2 (Sprints 1–58 + Lotes 1–4)** | **Concluído** | Roadmap funcional + segurança + atomicidade PG + governança IA/Storage + hardening TLS/SMTP/Proxy/Next `15.5.29` |
| **2. Homologação local completa (Lote 5 local, R\$ 0)** | **Concluída** | Standalone `NODE_ENV=production` + PG 18.4 + S3 local + SMTP local + `pg_dump`/restore + migrations/rollback + concorrência multi-pool (`--retries=0`) |
| **3. Homologação remota (staging cloud)** | **Pendente** | Bloqueada pela restrição R\$ 0/mês e pendência de autorização do owner para recursos remotos |
| **4. Publicação pública (produção)** | **Pendente (`NO-GO`)** | Requer homologação remota aprovada, banco oficial decidido, SMTP com domínio verificado, TLS válido, `railway config apply` (ou alternativa autorizada) e PR de release aprovado para `main` |
