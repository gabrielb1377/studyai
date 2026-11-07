# Handoff atual — StudyAI V1.1

Atualizado em **7 de novembro de 2026** a partir do Git, do código e dos testes locais. Esta é a fotografia atual; relatórios anteriores devem ser tratados como histórico.

## Fechamento local da Sprint 41G.3D

A Sprint 41G.3D está **CONCLUÍDA LOCALMENTE, NÃO COMMITADA E NÃO HOMOLOGADA EM PRODUÇÃO**. O PostgreSQL 18 local foi identificado por loopback (`127.0.0.1:5432`), banco descartável `studyai_41g2c_test`, somente duas contas sintéticas conhecidas e nenhuma tentativa de prova antes da execução. Os 6 testes de integração passaram e deixaram `exam_attempts` vazio. Nenhum banco foi criado, removido ou migrado.

Cache Storage passou em Chromium real: a troca A → B preservou conteúdo público, não apresentou dados privados de A pela aplicação, manteve caches privados escopados e não armazenou respostas de `/auth`, `/sync`, `/profile`, `/backup`, `/share` ou `/api`. Uma limpeza intencionalmente ausente no logout não expôs o cache de A à conta B; a limpeza pela interface removeu apenas o cache privado da conta ativa. Um script executado na mesma origem ainda consegue enumerar Cache Storage, portanto nomes por usuário evitam uso acidental, mas não formam fronteira contra XSS.

A regressão mobile passou em Chromium com viewport **simulado** de 390 × 844, cobrindo login/logout, A → B → A, tema global, navegação, Biblioteca, sincronização, reload e ausência do marcador privado de A em B. Não houve teste em aparelho físico.

Resultado final sem duplicar casos: **90 testes distintos aprovados** — 69 lógicos/mockados, 6 PostgreSQL reais locais, 4 Storage em navegador, 4 cloud sync, 4 Workspace/Modo Prova, 1 A → B → A desktop, 1 Cache Storage e 1 mobile. Houve intermitências no runner combinado: cadastro preso na inicialização, sync após restore ainda marcado como ativo e conflito não renderizado; os casos passaram isoladamente em servidor fresco. Isso permanece risco de estabilidade do harness.

## Estado Git

- Projeto: `D:\studyai`.
- Branch: `v1.1-development`.
- HEAD: `5eb5637d8f36cb8289112cd0380ab577411beb11` — isolamento de OPFS, cache e storages legados da Sprint 41G.3C.
- Referência remota conhecida localmente: `origin/v1.1-development` em `331bc15`; a branch local aparece **26 commits à frente**. Não houve `fetch`, portanto isso não confirma o estado atual do GitHub.
- Nenhum arquivo está staged. Nenhum commit foi criado nesta auditoria.

Alterações rastreadas preservadas:

- `package.json` e `package-lock.json` — dependência do presigner S3.
- `src/features/sync/CloudFileService.ts`, `src/server/cloud/CloudDatabase.ts` e `src/server/storage/ObjectStorage.ts` — upload direto experimental.
- `src/features/account/AuthProvider.tsx`, `src/features/sync/SyncPreferences.ts` e `src/features/teacher/services/TeacherAudioSessionStorage.ts` — correções experimentais da Sprint 41G.3D.
- `tests/sprint41g3a-isolation.spec.ts`, `tests/sprint41g-sync-preferences.spec.ts`, `tests/cloud-sync.spec.ts` e `tests/exam-attempt-integration.spec.ts` — regressões e portões de teste da 41G.3D.

Arquivos não rastreados preservados:

- `scripts/generate-vercel-secret.ps1`.
- `src/app/api/files/[id]/direct/route.ts`.
- `tests/deploy-security.spec.ts`.
- `tests/direct-upload.spec.ts`.
- `tests/sprint41g3d-session-isolation.spec.ts`.
- `tests/sprint41g3d-browser-isolation.spec.ts` e `playwright.41g3d.browser.config.ts`.
- `tests/sprint41g3d-cache-browser.spec.ts` e `tests/sprint41g3d-mobile-regression.spec.ts`.

## Arquitetura confirmada

O produto usa Next.js 15, React 19 e TypeScript. A interface chama Route Handlers internos; integrações de IA passam por `AIService` e `ProviderManager`. Autenticação própria usa cookies HTTP-only, CSRF e `AUTH_SECRET`. Persistência local combina IndexedDB por escopo de conta, OPFS por usuário, `localStorage` e Cache Storage. Sincronização usa `CloudSyncManager`, APIs autenticadas e PostgreSQL; arquivos podem usar S3 compatível.

O código possui modo em memória quando PostgreSQL não está configurado. Migração de banco é comando explícito (`npm run db:migrate`); o código normal não executa DDL automaticamente. O estado atual de Vercel, Supabase, Railway, PostgreSQL e S3 não foi consultado nesta auditoria.

## Funcionalidades verificadas no código

- Conta: cadastro, login, refresh, logout, verificação, recuperação, troca de email/senha, sessões e exclusão.
- Biblioteca/importação: PDF, documentos, imagens, áudio/vídeo, OCR/transcrição, IndexedDB/OPFS e busca.
- Estudo: Tutor, Professor, Mentor, notas, resumos, flashcards, quiz, Lab, IA Quality e Academy/Studio.
- Academy: material de estudo, trilha e projeto prático; parser estruturado, persistência e exportação PDF/PPTX. Geração real por provedor não foi validada nesta auditoria.
- Semana de Prova: criação local, assuntos, prioridades, plano por dias e progresso manual. Ainda não está integrada a materiais, flashcards, quizzes, simulados ou resultados.
- Modo Prova protegido: tentativa vinculada ao usuário, payload inicial sem gabarito, correção transacional no servidor e retomada. O modo prática continua local e contém gabarito no navegador por definição.
- Central de Ajuda: categorias expansíveis, busca, guia Academy, rolagem e navegação por teclado.

## Situação das Sprints 40 e 41

- Sprint 40: **CONCLUÍDA LOCALMENTE**, sem validação de IA real. Melhorou seleção de modelo, erros de providers e ajuda.
- Sprint 41 inicial: **CONCLUÍDA LOCALMENTE** nos commits `0215035`, `f6bcb58` e `19cb815`.
- Sprint 41F: **PARCIALMENTE IMPLEMENTADA**. O fallback silencioso entre providers foi suspenso e a ajuda avançou; fallback consentido, limites econômicos e modelo efetivo ainda não foram concluídos.
- Sprint 41G.1B: **CONCLUÍDA LOCALMENTE** nos commits `9553c72`, `861bd0b` e `1d08d83`; não prova isolamento contra scripts da mesma origem nem múltiplas abas reais.
- Sprint 41G.2B: **CONCLUÍDA LOCALMENTE** nos commits `e156dd1`, `9678bed` e `5e65e58`.
- Sprint 41G.2C: **CONCLUÍDA LOCALMENTE** em `8dd7a75`, com PostgreSQL local descartável em 4/11 e repetição segura de 6/6 casos em 6–7/11.
- Sprint 41G.3A: **VALIDADA LOCALMENTE** após importar o tipo ausente e corrigir o mock de `StorageManager`.
- Sprints 41G.3B e 41G.3C: **CONCLUÍDAS LOCALMENTE**, com testes de módulo aprovados nesta auditoria, mas sem teste negativo completo entre duas contas reais.
- Sprint 41G.3D: **CONCLUÍDA LOCALMENTE E NÃO COMMITADA**. PostgreSQL descartável, Cache Storage, desktop/mobile simulado, typecheck, lint e build passaram. Produção e aparelho físico não foram validados.
- Sprint 41 geral: **NÃO CONCLUÍDA**.

## Testes executados em 6–7/11/2026

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Aprovado. |
| `npm run lint` | Aprovado: 0 erros, 68 avisos preexistentes fora do escopo. |
| `npm run build` | Aprovado; 48 páginas geradas. O erro de fontes KaTeX não reapareceu. |
| Sessão, prova protegida e isolamento 41G | 69 aprovados, 0 falhos. |
| PostgreSQL local descartável | 6 aprovados, 0 falhos, 0 ignorados; estado inicial e final sem tentativas persistidas. |
| IA, quotas, DDL, upload direto e segurança de deploy | 27 aprovados; 4 casos de navegador foram executados no runner incorreto e repetidos separadamente. |
| Armazenamento em navegador | 4 aprovados, 0 falhos. |
| Workspace, Academy e Ajuda em navegador | 8 aprovados, 0 falhos. |
| 41G.3D focado | 10 aprovados, 0 falhos; conjunto 41G.3A/3D/preferências: 23 aprovados. |
| Navegador A → B → A | 1 aprovado: duas contas sintéticas, duas abas, reload, preferências globais e API cross-user. |
| Cloud sync em navegador | 4 aprovados: sessão, restore, conflito, arquivo, exclusão e OPFS escopado. |
| Cache Storage em Chromium | 1 aprovado: escopo privado, conteúdo público, APIs autenticadas excluídas e falha de limpeza segura. |
| Mobile simulado 390 × 844 | 1 aprovado: conta, tema, navegação, Biblioteca, sync, reload e isolamento A → B → A. |

Não foram usados serviços pagos, credenciais externas, PostgreSQL/S3 de produção ou IA real.

## Riscos e bloqueios

1. Manter o gate PostgreSQL: loopback, banco descartável comprovado, ambiente não produtivo e `STUDYAI_ALLOW_LOCAL_DB_TESTS=1`.
2. Repetir a regressão em aparelho móvel físico e manter a observação de que namespaces locais não são fronteira contra scripts da mesma origem.
3. Revisar e, mediante autorização, criar commit isolado da 41G.3D sem misturar upload direto.
4. Investigar e estabilizar as intermitências do runner cloud sem mascará-las com retries.
5. Manter o upload direto fora de publicação até revisão e testes; ele continua experimental e não rastreado em parte.
6. Finalizar fallback de IA com consentimento, limites e transparência do modelo usado.
7. Integrar Semana de Prova às atividades reais e ao progresso sem duplicação.
8. Validar Academy, IA, PostgreSQL e S3 em homologação autorizada.

## Próximo trabalho recomendado

Revisar o diff da **41G.3D** e, somente mediante autorização, criar um commit local isolado sem misturar upload direto. Depois estabilizar o harness cloud e retomar as pendências funcionais da Sprint 41 — fallback consentido, Semana de Prova e homologação de Academy/IA — antes de iniciar a Sprint 42.

## Comandos e documentação

```powershell
git status --short
git log -10 --oneline --decorate
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Não executar `npm run db:migrate` sem banco não produtivo identificado e autorização específica. Leia:

- `docs/PROJECT_AUDIT_2026-11-05.md` — auditoria completa.
- `docs/SPRINT_41_STATUS.md` — status e evidências da Sprint 41.
- `docs/SPRINT_41G_SECURITY_AUDIT.md` — riscos de isolamento e Modo Prova.
- `docs/ROADMAP_V1_2.md` — roadmap reconciliado.
- `docs/NEXT_SESSION_PROMPT.md` — prompt de continuidade.
