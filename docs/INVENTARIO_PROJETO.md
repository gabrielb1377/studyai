# Inventário técnico do StudyAI

**Snapshot:** 23 de setembro de 2026, após Sprint 32.5.

## Contagem do repositório

Contagens obtidas por arquivos do workspace. “Serviços”, “hooks” e “providers” são identificados por convenção de nomes; podem existir classes equivalentes com outros nomes.

| Item | Quantidade |
| --- | ---: |
| Arquivos TypeScript/TSX em `src` | 303 |
| Diretórios de features | 27 |
| Páginas App Router | 10 |
| Route Handlers | 27 |
| Componentes em `src/components` | 18 |
| Hooks encontrados por convenção `use*`/`*hook*` | 17 |
| Arquivos de serviço por convenção `*Service*` | 34 |
| Arquivos com `*Provider*` no nome | 13 |
| Especificações Playwright | 18 |
| Cenários Playwright finais | 92 |
| Object stores IndexedDB | 13 |
| Percentual de cobertura por linha/branch | Não configurado |

## Módulos de feature

`account`, `ai`, `dashboard`, `extraction`, `flashcards`, `help`, `import`, `learning`, `library`, `mentor`, `notes`, `observability`, `organization`, `platform`, `preferences`, `quiz`, `retrieval`, `search`, `semantic`, `settings`, `storage`, `study`, `study-generator`, `summaries`, `sync`, `tutor` e `workspace`.

## Páginas

| Rota | Área |
| --- | --- |
| `/` | Dashboard |
| `/biblioteca` | Biblioteca |
| `/compartilhar/[token]` | Material compartilhado |
| `/configuracoes` | Configurações |
| `/conta` | Conta e sincronização |
| `/estudo` | Study Workspace |
| `/importar` | Importação e extração |
| `/organizar` | Organização de materiais |
| `/storage` | Diagnóstico de armazenamento avançado |
| `/tutor` | Tutor IA |

## APIs e Route Handlers

| Prefixo/rota | Métodos presentes e finalidade |
| --- | --- |
| `/api/ai/manager` | GET health agregado de providers e métricas |
| `/api/ai/providers/[provider]` | GET health/modelos do provider |
| `/api/files/[id]` | PUT upload, GET download autenticado, DELETE binário |
| `/api/health` | GET status de serviço e runtime protegido |
| `/api/ocr/assets/[asset]` | GET worker/runtime do OCR local |
| `/api/ocr/languages/[language]` | GET pacote de idioma OCR |
| `/api/telemetry` | POST métricas allowlisted e consentidas |
| `/api/tutor` | POST resposta e streaming NDJSON |
| `/api/tutor/flashcards` | POST geração contextual |
| `/api/tutor/quiz` | POST geração contextual |
| `/api/tutor/summary` | POST resumo contextual |
| `/auth/change-email` | POST alteração de email |
| `/auth/change-password` | POST alteração de senha |
| `/auth/login` | POST login |
| `/auth/logout` | POST logout |
| `/auth/recover` | POST recuperação de conta |
| `/auth/refresh` | POST renovação da sessão |
| `/auth/register` | POST cadastro |
| `/auth/reset` | POST redefinição de senha |
| `/auth/session` | GET sessão atual |
| `/auth/sessions/[id]` | DELETE sessão de outro dispositivo do mesmo usuário |
| `/auth/verify` | POST verificação de email |
| `/backup` | GET lista, POST cria/restaura snapshot de registros |
| `/profile` | GET/PATCH perfil |
| `/share` | GET/POST/DELETE compartilhamentos |
| `/compartilhar/[token]` | GET dados do registro compartilhado |
| `/sync` | GET pull incremental, POST push/conflicts |
| `/sync/history` | GET histórico de alterações |

## Providers de IA

O `ProviderRegistry` registra quatro providers funcionais: Gemini, Ollama, Groq e OpenRouter. Todos entram pelo AI Core (`AIService`, `ProviderManager`, `HealthService`, `PromptBuilder`, `ContextBuilder`, cache e streaming). O health check real desta auditoria encontrou Gemini/Groq/OpenRouter online e Ollama offline.

## Persistência e dados

| Local | Papel |
| --- | --- |
| IndexedDB por identidade | Fonte local offline para estudos, conteúdo derivado e estado da aplicação. |
| OPFS | Cache de arquivos originais no dispositivo. |
| PostgreSQL | Contas, perfil, sessões, registros cloud versionados, logs, backups e metadados de binários. |
| S3 compatível/MinIO | Conteúdo binário cloud, em chave por usuário/material/hash. |
| localStorage | Preferências leves, cursores e marcadores de infraestrutura. |

Stores: `documents`, `contents`, `chunks`, `embeddings`, `studies`, `notes`, `summaries`, `flashcards`, `quizzes`, `transcriptions`, `ocr`, `knowledge`, `metadata`.

## Testes

Especificações: `ai-core`, `cloud-sync`, `foundation`, `import`, `learning`, `library`, `mentor`, `organization`, `platform`, `polish`, `product-polish`, `real-integration`, `semantic`, `storage`, `study`, `tutor`, `ux-persistence`, `workspace-v2`.

Resumo: 92/92 passaram na execução de 23/09/2026. Incluem integrações de UI com serviços locais/fallback em memória, fixtures controladas e verificações estáticas. Não incluem teste de carga, cobertura percentual, DB PostgreSQL real, bucket S3 real ou geração de texto real em todos os providers.
