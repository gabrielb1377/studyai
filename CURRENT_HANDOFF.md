# Handoff atual — StudyAI V1.1

## Estado atual — Sprint 42 (9 de novembro de 2026)

A Sprint 42 foi implementada localmente sobre o HEAD `40f3518`, sem commit e sem homologação externa. O trabalho corrigiu falhas comprovadas de segurança e contabilização: o LLM Judge não aceita mais chave enviada pelo navegador e exige sessão/CSRF/quota; a assistência do Academy Studio deixou de possuir caminho visitante fora da quota; todas as mutações que passam por `withAIQuota` exigem CSRF; status e inspeção de providers exigem sessão; a quota local de desenvolvimento agora é realmente contabilizada e a ausência de PostgreSQL em produção falha fechada; cabeçalhos e mensagens de limite refletem os contadores reais e distinguem bloqueio diário de bloqueio por minuto. O Tutor informa se os tokens exibidos foram registrados pelo provider ou estimados localmente, sem estimar custo financeiro.

Na Sprint 42.1, o overflow mobile do Academy Studio foi localizado no item de grid/flex que continha o `Select`: `min-width:auto`, wrapper `w-full`, conteúdo flexível, botão e gaps elevavam o tamanho mínimo para 437 px em um viewport de 360 px. `min-w-0` no item e `basis-full` no seletor abaixo de `sm` corrigiram a causa sem esconder overflow globalmente e sem alterar o desktop. O teste mobile passou duas vezes, a suíte Academy Studio passou 12/12 e a suíte específica da Sprint 42 passou 4/4.

Validação: `tests/sprint42-security-quota.spec.ts` **4/4**; Academy Studio **12/12**; teste mobile repetido **2/2**. A rodada relacionada anterior à correção teve 57 aprovados e a única falha mobile agora corrigida. Todos os 17 testes de Modo Prova, os 4 de cloud sync, os 10 de quota e os 12 do fallback central permanecem como evidência anterior da Sprint 42 e não foram repetidos na 42.1. Typecheck e build passaram; lint passou com 0 erros e 50 avisos preexistentes; `git diff --check` passou. A matriz Playwright completa não foi executada.

Persistência, backup/restore, fila offline, conflito, exclusão sincronizada e isolamento foram cobertos pelos quatro testes focados de `cloud-sync.spec.ts`, todos aprovados com backend mockado/local. O Modo Prova continuou sem gabarito no payload inicial, com ownership e correção no servidor; não houve alteração de schema nem persistência de `examId`/`studyId`. Providers reais, PostgreSQL/S3 externos, Vercel e custos reais não foram acessados.

Estado Git desta fotografia: branch `v1.1-development`, HEAD base `40f351846a600d570a35c6edd8005c00d0ad1874`; nenhuma alteração da Sprint 42 foi commitada. Os experimentos S3, `package.json`, `package-lock.json`, gerador de segredos e auditoria experimental permanecem fora do escopo e preservados. Consulte `docs/SPRINT_42_STATUS.md` para a lista de arquivos e evidências. A Sprint 42 está pronta para checkpoint local seletivo; Sprint 43 não foi iniciada.

## Estado definitivo da Sprint 41

**Encerrada localmente com ressalvas; não homologada em produção.** 41G e 41H foram implementadas e validadas localmente; 41I.A–E concluídas localmente, com checkpoint final `652ac65`. Na 41J.1, instrumentação concluída e 3 testes focados aprovados; na 41J.2, 1 teste existente de persistência aprovado. Total 41J: **4 testes focados aprovados**, sem dupla contagem. Os 107 testes da 41I são evidência histórica e não foram repetidos. Matriz Playwright completa e homologação externa pendentes. Suporte avançado a múltiplas contas despriorizado para uso pessoal atual. Sprint 42 não iniciada.

Atualizado em **9 de novembro de 2026** a partir do Git, do código e dos testes locais. Esta é a fotografia atual; relatórios anteriores devem ser tratados como histórico.

## Sprint 41J.1 — diagnóstico do runner

A ausência prolongada de saída do Playwright foi explicada por warm-up serial de 22 rotas (48,7–54,8 s observados) combinado à condensação da saída pelo `rtk`; usando `rtk proxy`, os marcos apareceram. `tests/global-setup.ts` agora loga timestamp, duração, rota, status e erro/timeout sem dados sensíveis. Três testes focados da 41J.1 e o fluxo sintético offline→online→backup/restore da 41J.2 passaram. Typecheck, lint (0 erros/67 avisos), build e diff-check passaram. Recomenda-se encerramento local da Sprint 41 com ressalvas; produção continua sem homologação. Ver [SPRINT_41J_1_DIAGNOSTIC.md](docs/SPRINT_41J_1_DIAGNOSTIC.md).

## Sprint 41I.E — interface e continuidade da Semana de Prova

A Sprint 41I.E está **IMPLEMENTADA, VALIDADA E COMMITADA** no checkpoint `652ac65`, sem homologação em produção. A experiência de `/provas` cobre criação e edição de prova, assuntos e prioridades, seleção/desvinculação de estudo, associação e remoção de materiais, plano diário, progresso real e retomada após reload.

Problemas comprovados e correções:

- datas `YYYY-MM-DD` eram interpretadas como UTC e podiam aparecer no dia anterior; parsing, formatação e contagem agora usam o dia civil local;
- não existia edição dos metadados e assuntos da prova; o formulário existente foi reutilizado para edição sem perder estudo ou materiais vinculados;
- Tutor, Flashcards, Quiz e Modo Prova perdiam a origem; os links agora carregam apenas `origem=provas` e o `examId`, e o retorno fixo seleciona novamente a prova autorizada da sessão;
- `studyId` inválido já não autorizava acesso, mas produzia uma mensagem genérica; agora há estado explícito e retorno seguro, sem renderizar o Workspace solicitado;
- falha de carregamento do progresso podia manter loading indefinido; o hook encerra o loading com mensagem redigida após validar usuário e geração;
- limpeza autorizada de material removido era silenciosa; a interface informa a remoção e preservação dos demais dados;
- labels, botões por ícone, remoção de assunto e linhas clicáveis de material receberam nomes/semântica de teclado; os controles de assunto empilham no mobile e o primeiro campo recebe foco ao abrir o formulário.

A navegação não aceita URL de retorno arbitrária: `/estudo` só monta retorno quando a origem é exatamente `provas`, sempre para `/provas?prova=<id>`. A página de destino resolve o ID somente contra o armazenamento já escopado para a identidade atual; um ID de outra conta cai na primeira prova autorizada ou no estado vazio. O Modo Prova, gabarito, fallback consentido, quotas e schemas não foram alterados.

Evidência distinta: 41I.E **4/4**; 41I.B/B.1 **10/10**; 41I.C/D em navegador e fluxo legado **10/10**; Study Engine, Learning, Tutor/fallback, Modo Prova, isolamento, cloud sync e Cache/Service Worker **67/67**; regressão lógica 41I.D **16/16**. Total: **107 aprovados, 0 falhos, 0 ignorados**. A repetição isolada 41I.E 4/4 não foi contada novamente. Typecheck, lint, build e `git diff --check` passaram; lint manteve 67 avisos preexistentes e o build gerou 48 páginas. Nenhum serviço externo, chamada paga, migração ou credencial real foi usado.

Responsividade foi validada em Chromium com viewport 390 × 844 e sem overflow horizontal. Foco inicial, labels e navegação por teclado foram cobertos; não houve aparelho físico, leitor de tela real ou auditoria visual automatizada de contraste.

## Sprint 41I.D — progresso real da Semana de Prova

A Sprint 41I.D está **IMPLEMENTADA, VALIDADA E REGISTRADA EM CHECKPOINT LOCAL, SEM HOMOLOGAÇÃO EM PRODUÇÃO** sobre a branch `v1.1-development`, a partir do HEAD base `fb8c619`. A Semana de Prova ganhou uma visão somente de leitura que separa progresso do conteúdo, quantidade de atividades, revisões de flashcards e desempenho. Abrir ou recarregar a página não cria eventos nem altera o progresso do estudo.

Fontes e identificadores usados:

- `StudyEngine`: `studyId`, `progress` e `status`; fonte canônica de conclusão do conteúdo.
- `LearningStorage`: atividades com `id`, `studyId` e `occurredAt`; fonte de tempo e revisões registradas.
- `QuizService`: resultados com `id`, `studyId` e `completedAt`; fonte canônica de tentativas, acertos e erros. Eventos `quiz` equivalentes do Learning Service não são contados novamente.
- `FlashcardService`: `id`, `studyId` e `lastReviewedAt`; usado para cartões distintos revisados, sem inventar um identificador de revisão inexistente.
- `ExamAttemptServer`: mantém tentativa e usuário, mas não persiste `examId` ou `studyId`. Por isso resultados do Modo Prova protegido não são atribuídos a uma prova específica nesta etapa.

A associação exige `Exam.studyId` autorizado ou a cadeia explícita `Exam.materialIds` → `StudyRecord.materialIds`. Atividades e resultados anteriores a `Exam.createdAt` são excluídos. IDs estáveis são deduplicados, enquanto tentativas legítimas com IDs diferentes permanecem separadas. Estudo removido, data inválida ou ausência de vínculo confiável produz estado explicativo, sem correspondência inferida.

O carregamento assíncrono verifica usuário, geração e suspensão da sessão antes de aplicar resultados e invalida cargas antigas no cleanup. A interface reage aos eventos existentes de Learning, Quiz, Flashcards e armazenamento. O modo `offline-session` usa o mesmo cálculo, sem privilégios especiais ou leitura de outro escopo.

Durante as regressões foi confirmada uma falha anterior no modo Prática: a integração do Modo Prova protegido havia removido da tela de resultado os insights já calculados pelo `KnowledgeEngine`. A apresentação de evolução, ponto forte/fraco e recomendação foi restaurada somente no modo Prática; tentativa protegida, payload sem gabarito e correção no servidor não foram alterados.

Evidência distinta desta etapa: testes 41I.D **18/18** (16 lógica + 2 Chromium desktop/mobile), 41I.B/B.1 **10/10** e regressões selecionadas 41I.C/Study Engine/Learning/isolamento/Modo Prova **47/47** após a autocorreção. Na primeira rodada de regressão houve **46 aprovados e 1 falho**; o caso falho passou no teste focado e a suíte Learning + Modo Prova passou **25/25**. Total distinto final: **75 aprovados, 0 falhos, 0 ignorados**. Typecheck, lint, build e `git diff --check` passaram; o lint manteve 67 avisos preexistentes. Nenhum serviço externo, IA paga, migração ou credencial real foi usado.

## Sprint 41I.C — Semana de Prova e atividades de aprendizagem

A Sprint 41I.C está **IMPLEMENTADA, VALIDADA LOCALMENTE E REGISTRADA NO CHECKPOINT `fb8c619`, SEM HOMOLOGAÇÃO EM PRODUÇÃO**. A Semana de Prova agora oferece ações funcionais para Tutor, Flashcards, Quiz e Simulado usando o `studyId` do vínculo real. O identificador persistido na prova não autoriza acesso sozinho: as ações só são habilitadas quando o estudo também existe no catálogo já escopado para a sessão atual. Vínculos removidos ou temporariamente inacessíveis são preservados e apresentados como indisponíveis.

As rotas contextuais reutilizam o Workspace existente (`/estudo?tema=...&aba=...`). O Tutor passou a solicitar explicitamente o estudo ao `TutorContextService`, que o resolve contra `StudyEngine`; respostas assíncronas antigas e conversas em memória são invalidadas quando usuário ou geração de sessão mudam. Flashcards e Quiz continuam usando os serviços existentes, filtrados por `studyId`, sem geração automática. O link de Simulado abre o painel de Quiz diretamente em `modo=exam`, reutilizando `SecureExamClient` e os endpoints protegidos; o payload inicial continua sem `correctAnswer` ou explicações.

Limite deliberado: `ExamAttemptServer` não possui vínculo persistente com o `examId`, apenas com usuário/tentativa e com o estudo usado para gerar o contexto. A 41I.C não alterou schema nem criou endpoint paralelo. A homologação com conta autenticada, PostgreSQL e providers reais permanece pendente e exige autorização separada.

Evidência: suíte nova 41I.C **6/6**; regressão 41I.B.1 **10/10**; matriz Playwright selecionada de 41G/41H/Study Engine/Modo Prova/41I.C **54/54**; isolamento A → B → A desktop/mobile **2/2**. As duas intermitências conhecidas foram repetidas separadamente e passaram: cloud sync/conflito **4/4** e Cache Storage/Service Worker **1/1**. Foram **71 casos distintos aprovados**, sem falhos ou ignorados; a repetição final de 41I.C + Tutor passou **9/9** e não entra novamente nessa contagem. Typecheck, lint e build passaram; lint manteve 67 avisos preexistentes e o build gerou 48 páginas. Nenhum serviço externo, chamada paga, migração ou credencial real foi usado.

## Sprint 41I.B.1 — integração de estudos e materiais

A Sprint 41I.B.1 está **VALIDADA LOCALMENTE E REGISTRADA NO CHECKPOINT `fb8c619`, SEM HOMOLOGAÇÃO EM PRODUÇÃO**. A integração da Semana de Prova carrega estudos e materiais reais, preserva vínculos durante carregamento incompleto ou falha da Biblioteca e remove referências órfãs somente depois de um catálogo completo, pertencente ao mesmo usuário e à mesma geração de sessão.

`ExamService` bloqueia leitura/gravação enquanto a sessão está suspensa, reconhece `offline-session`, normaliza IDs repetidos e evita `localStorage.setItem` redundante. `ExamWorkspace` mantém estudos inacessíveis em estado explícito, sem apagar o `studyId`. `useMaterials` e `useStudyEngine` invalidam resultados atrasados e limpam dados em memória na troca de escopo; atualizações concorrentes do Study Engine são serializadas para não perder progresso. `ProvasClient` não executa uma segunda carga redundante.

O `errno -4094` foi identificado no registro histórico do comando exato `node -e "const fs = require('fs'); console.log(fs.readdirSync('node_modules/.bin'))"`: Node 24.18.0 falhou em `node:fs:1570`, `binding.readdir`, com `code: UNKNOWN`, `syscall: scandir` e caminho `D:\studyai\node_modules\.bin`. O mesmo ambiente também registrou `UNKNOWN/-4094` em `open/read`, indicando falha intermitente da camada de filesystem do Node no volume D:, não ausência de permissão. ACLs permitem leitura/modificação, D: está NTFS/Healthy, TEMP está acessível, não havia Next/Playwright concorrente e o comando passou na reprodução atual. A alternativa segura foi execução sequencial por `npx tsx`/Playwright, sem desativar proteções do Windows.

O teste novo continha 18 bytes NUL finais e falhava no `esbuild` antes de executar cenários; o arquivo foi regravado em UTF-8 normal. Resultado final: 10/10 casos 41I.B.1 passaram. A matriz Playwright terminou com 70 aprovados, 2 falhos e 6 ignorados; as duas falhas intermitentes (conflito de sync e navegação do Service Worker durante Cache Storage) passaram sem alteração na repetição focada, 2/2. Typecheck e build passaram; lint teve 0 erros e 67 avisos preexistentes; `git diff --check` passou. Nenhum serviço externo, credencial real ou migração foi usado.

## Sprint 41H.1 — regressões do AI Core

A Sprint 41H.1 está **VALIDADA LOCALMENTE, NÃO COMMITADA E NÃO HOMOLOGADA COM PROVIDERS REAIS**. As três regressões tinham origem no escopo da sessão offline introduzido pelo isolamento 41G: preferências privadas eram corretamente removidas da área ativa, mas o modo offline não possuía proprietário explícito para restaurá-las; além disso, o modo avançado dependia da identidade ativa e ficava oculto. A ausência do health do Ollama era apresentação, não contrato da API. O timeout do dashboard era o Playwright aguardando um botão avançado que não havia sido renderizado, não timeout do provider.

O modo offline agora usa a identidade local explícita `offline-session`, armazenada separadamente das contas. Preferências offline sobrevivem ao reload, mas um usuário autenticado não restaura esses dados. Nenhum dado legado sem proprietário é reivindicado automaticamente. O fallback consentido da 41H não foi alterado.

## Sprint 41H — fallback consentido

A Sprint 41H está **IMPLEMENTADA LOCALMENTE NO NÚCLEO DE IA E NO TUTOR, NÃO COMMITADA E NÃO HOMOLOGADA COM SERVIÇOS REAIS**. Falhas recuperáveis do provedor primário agora geram uma oferta segura, sem chamar alternativa. O usuário vê provedor, modelo e impacto de consumo, pode autorizar exatamente uma alternativa ou cancelar mantendo mensagem e conversa. A tentativa autorizada é vinculada à requisição e ao usuário, passa novamente pela política de quota e possui idempotência em memória por cinco minutos. Respostas parciais são preservadas e nunca reenviadas automaticamente.

O escopo deliberado desta etapa é o Tutor e o gerenciador central. Academy, flashcards, quiz, resumo, Lab, diagramas e áudio continuam sem troca automática entre provedores e ainda não possuem a interface de consentimento. A idempotência não é durável entre instâncias serverless; para garantia global será necessário armazenamento compartilhado, sem migração nesta etapa.

## Fechamento local da Sprint 41G.3D

A Sprint 41G.3D está **CONCLUÍDA LOCALMENTE E REGISTRADA NO COMMIT `03f163b`, SEM HOMOLOGAÇÃO EM PRODUÇÃO**. O PostgreSQL 18 local foi identificado por loopback (`127.0.0.1:5432`), banco descartável `studyai_41g2c_test`, somente duas contas sintéticas conhecidas e nenhuma tentativa de prova antes da execução. Os 6 testes de integração passaram e deixaram `exam_attempts` vazio. Nenhum banco foi criado, removido ou migrado.

Cache Storage passou em Chromium real: a troca A → B preservou conteúdo público, não apresentou dados privados de A pela aplicação, manteve caches privados escopados e não armazenou respostas de `/auth`, `/sync`, `/profile`, `/backup`, `/share` ou `/api`. Uma limpeza intencionalmente ausente no logout não expôs o cache de A à conta B; a limpeza pela interface removeu apenas o cache privado da conta ativa. Um script executado na mesma origem ainda consegue enumerar Cache Storage, portanto nomes por usuário evitam uso acidental, mas não formam fronteira contra XSS.

A regressão mobile passou em Chromium com viewport **simulado** de 390 × 844, cobrindo login/logout, A → B → A, tema global, navegação, Biblioteca, sincronização, reload e ausência do marcador privado de A em B. Não houve teste em aparelho físico.

Resultado final sem duplicar casos: **90 testes distintos aprovados** — 69 lógicos/mockados, 6 PostgreSQL reais locais, 4 Storage em navegador, 4 cloud sync, 4 Workspace/Modo Prova, 1 A → B → A desktop, 1 Cache Storage e 1 mobile. Houve intermitências no runner combinado: cadastro preso na inicialização, sync após restore ainda marcado como ativo e conflito não renderizado; os casos passaram isoladamente em servidor fresco. Isso permanece risco de estabilidade do harness.

## Estado Git

- Projeto: `D:\studyai`.
- Branch: `v1.1-development`.
- HEAD base: `45ac9da`, checkpoint local das Sprints 41I.B/B.1/C/D. A 41I.E está validada localmente; seu checkpoint só será confirmado após a verificação do commit efetivo.
- Referência remota conhecida localmente: `origin/v1.1-development` em `331bc15`; a branch local aparece **30 commits à frente**. Não houve `fetch`, portanto isso não confirma o estado atual do GitHub.
- Nenhum arquivo está staged. Nenhum commit foi criado nas Sprints 41H/41H.1.

Alterações rastreadas preservadas:

- `package.json` e `package-lock.json` — dependência do presigner S3.
- `src/features/sync/CloudFileService.ts`, `src/server/cloud/CloudDatabase.ts` e `src/server/storage/ObjectStorage.ts` — upload direto experimental.
- Núcleo de IA, quota, rota e interface do Tutor — implementação não commitada da Sprint 41H.
- `tests/ai-provider-sprint40.spec.ts`, `tests/quota-policy.spec.ts` e os novos testes `sprint41h-*` — cobertura mockada e de navegador da Sprint 41H.
- `src/features/account/AuthProvider.tsx`, `src/features/account/SessionLocalData.ts`, `tests/helpers/experience.ts` e `tests/sprint41g3d-session-isolation.spec.ts` — correção e regressão da identidade offline na 41H.1.

Arquivos não rastreados preservados:

- `scripts/generate-vercel-secret.ps1`.
- `src/app/api/files/[id]/direct/route.ts`.
- `tests/deploy-security.spec.ts`.
- `tests/direct-upload.spec.ts`.
- `tests/sprint41h-ai-fallback.spec.ts` e `tests/sprint41h-tutor-consent.spec.ts` pertencem à 41H e ainda não foram commitados.

## Arquitetura confirmada

O produto usa Next.js 15, React 19 e TypeScript. A interface chama Route Handlers internos; integrações de IA passam por `AIService` e `ProviderManager`. Autenticação própria usa cookies HTTP-only, CSRF e `AUTH_SECRET`. Persistência local combina IndexedDB por escopo de conta, OPFS por usuário, `localStorage` e Cache Storage. Sincronização usa `CloudSyncManager`, APIs autenticadas e PostgreSQL; arquivos podem usar S3 compatível.

O código possui modo em memória quando PostgreSQL não está configurado. Migração de banco é comando explícito (`npm run db:migrate`); o código normal não executa DDL automaticamente. O estado atual de Vercel, Supabase, Railway, PostgreSQL e S3 não foi consultado nesta auditoria.

## Funcionalidades verificadas no código

- Conta: cadastro, login, refresh, logout, verificação, recuperação, troca de email/senha, sessões e exclusão.
- Biblioteca/importação: PDF, documentos, imagens, áudio/vídeo, OCR/transcrição, IndexedDB/OPFS e busca.
- Estudo: Tutor, Professor, Mentor, notas, resumos, flashcards, quiz, Lab, IA Quality e Academy/Studio.
- Academy: material de estudo, trilha e projeto prático; parser estruturado, persistência e exportação PDF/PPTX. Geração real por provedor não foi validada nesta auditoria.
- Semana de Prova: criação local, assuntos, prioridades, plano por dias, progresso manual, materiais e estudo vinculados; ações contextuais abrem Tutor, Flashcards, Quiz e Modo Prova para o estudo autorizado.
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
- Sprint 41G.3D: **CONCLUÍDA LOCALMENTE E COMMITADA** em `03f163b`. Produção e aparelho físico não foram validados.
- Sprint 41H: **IMPLEMENTADA E VALIDADA LOCALMENTE NO NÚCLEO/TUTOR**; demais fluxos de IA e serviços reais permanecem pendentes.
- Sprint 41H.1: **VALIDADA LOCALMENTE**; as três regressões do AI Core foram resolvidas sem alterar o fallback.
- Sprint 41 geral: **NÃO CONCLUÍDA**.

## Testes executados em 6–8/11/2026

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
| Sprint 41H/41H.1 — lógica/mock | 55 aprovados, 0 falhos: fallback, quota, providers e regressões de sessão/isolamento, incluindo offline. |
| Sprint 41H — Tutor em Chromium | 3 aprovados, 0 falhos: consentimento desktop, cancelamento mobile e quota insuficiente. |
| Regressão Tutor existente | 5 aprovados, 0 falhos. |
| Regressão AI Core existente | 3 aprovados, 0 falhos: persistência, health do Ollama e dashboard. |
| Isolamento desktop/mobile | 2 aprovados, 0 falhos: A → B → A, múltiplas abas, API cruzada e viewport móvel. |

Não foram usados serviços pagos, credenciais externas, PostgreSQL/S3 de produção ou IA real.

## Riscos e bloqueios

1. Manter o gate PostgreSQL: loopback, banco descartável comprovado, ambiente não produtivo e `STUDYAI_ALLOW_LOCAL_DB_TESTS=1`.
2. Repetir a regressão em aparelho móvel físico e manter a observação de que namespaces locais não são fronteira contra scripts da mesma origem.
3. Revisar e, mediante autorização, criar checkpoint local isolado das Sprints 41H/41H.1 sem misturar upload direto.
4. Investigar e estabilizar as intermitências do runner cloud sem mascará-las com retries.
5. Manter o upload direto fora de publicação até revisão e testes; ele continua experimental e não rastreado em parte.
6. Estender o contrato consentido aos demais fluxos de IA somente após validar o Tutor com provedores reais; hoje eles permanecem deliberadamente sem fallback.
7. Tornar a idempotência de fallback durável entre instâncias serverless antes de depender dela para garantia financeira global.
8. Decidir em etapa autorizada se tentativas protegidas precisam persistir `examId`/`studyId`; hoje elas não podem entrar no resumo de uma prova específica com segurança.
9. Validar Academy, IA, PostgreSQL e S3 em homologação autorizada.

## Próximo trabalho recomendado

Revisar o diff da **41I.E** e, somente mediante autorização posterior, criar o checkpoint final local da Sprint 41I sem misturar upload direto. Não iniciar a Sprint 42 automaticamente. A homologação de Academy/IA, PostgreSQL e S3 continua dependente de ambiente e autorização próprios.

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
