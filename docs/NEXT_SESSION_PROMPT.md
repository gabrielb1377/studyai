# Prompt reutilizável — próxima sessão

> **Estado atual (9/11/2026):** a seção abaixo substitui as fotografias históricas conflitantes dentro do prompt antigo. Sprint 41 está encerrada localmente com ressalvas. Sprint 42 e a correção 42.1 foram implementadas e validadas localmente sobre `40f3518`, ainda sem commit e sem homologação externa. Leia `docs/SPRINT_42_STATUS.md` antes de continuar.

```text
Continue o StudyAI em D:\studyai, branch v1.1-development. Confirme o Git antes de agir e preserve integralmente os experimentos S3, package.json, package-lock.json, o gerador de segredos e docs/PROJECT_AUDIT_2026-11-05.md.

Sprint 42: as correções essenciais de segurança e quota estão implementadas e validadas localmente, mas ainda não commitadas. LLM Judge, Academy Studio e todas as mutações com withAIQuota exigem sessão/CSRF/quota; o navegador não envia mais apiKey ao Judge; status de providers é privado; contadores/cabeçalhos de quota refletem valores reais; produção falha fechada sem armazenamento de quota; o Tutor distingue uso registrado de uso estimado. Não houve custo estimado inventado, chamada paga, migration ou acesso externo.

Sprint 42.1 corrigiu o overflow horizontal do Academy Studio: o item de grid/flex tinha tamanho mínimo de 437 px devido a min-width:auto e ao Select w-full. A correção usa min-w-0 no item e basis-full no seletor somente no mobile. Evidência nova: teste mobile repetido 2/2, Academy Studio 12/12 e suíte Sprint 42 4/4. Typecheck e build passaram; lint tem 0 erros e 50 avisos preexistentes; diff-check passou. A matriz Playwright completa não foi executada. Cloud sync/backup/restore/conflito/exclusão 4/4 e Modo Prova 17/17 são evidência anterior da Sprint 42, não repetida na 42.1.

Próximo trabalho: revisar o diff e criar, somente com autorização, um checkpoint local seletivo da Sprint 42/42.1, mantendo experimentos S3 e arquivos não relacionados fora do staging. Não iniciar Sprint 43 automaticamente. Não fazer commit, push, merge, rebase, deploy, migration ou alteração de .env sem autorização explícita.
```

## Histórico anterior

```text
Continue o StudyAI em D:\studyai, branch v1.1-development.

Estado Sprint 41: encerrada localmente com ressalvas, sem homologação externa.
41G/41H implementadas e validadas localmente; 41I.A–E concluídas localmente,
checkpoint `652ac65`. 41J.1: instrumentação concluída, 3 testes focados
aprovados. 41J.2: 1 teste existente de persistência aprovado. Total 41J: 4
testes focados, sem duplicação. Os 107 testes da 41I são históricos. Matriz
Playwright completa pendente; suporte avançado a múltiplas contas despriorizado
para uso pessoal. Sprint 42 não iniciada.

Sprint 41J.1: runner Playwright instrumentado. O `globalSetup` aqueceu 22 rotas
em 48,7–54,8 s; `rtk` condensou a saída e `rtk proxy` exibiu os logs. Três
testes focados passaram: offline-session, A→B→A e conflito cloud. Typecheck,
lint (0 erros/67 avisos), build (48 páginas) e diff-check passaram. Em 41J.2,
1/1 cenário sintético de offline→online→backup/restore e confirmação no IndexedDB
passou. Recomenda-se encerramento local da Sprint 41 com ressalvas; a matriz
ampla não foi repetida e a homologação externa permanece pendente.
Leia `docs/SPRINT_41J_1_DIAGNOSTIC.md` para comandos e evidências completas.

Antes de programar, leia AGENTS.md/RTK.md, CURRENT_HANDOFF.md,
docs/SPRINT_41_STATUS.md, docs/SPRINT_41G_SECURITY_AUDIT.md e
docs/ROADMAP_V1_2.md. Confirme git status --short, git status -sb e
git log -15 --oneline --decorate. Não faça fetch, reset, clean, stash,
checkout --, rebase, push, merge, deploy ou commit sem autorização.

Fotografia de 9/11/2026: HEAD 45ac9da, checkpoint local das etapas
41I.B/B.1/C/D. A 41I.E está implementada e validada localmente; o checkpoint
está em andamento e só deve ser declarado concluído depois de confirmar o
commit solicitado. Não há homologação externa.

Preserve integralmente os experimentos de upload direto S3: package.json,
package-lock.json, CloudFileService, CloudDatabase, ObjectStorage,
src/app/api/files/[id]/direct/, tests/direct-upload.spec.ts,
tests/deploy-security.spec.ts e scripts/generate-vercel-secret.ps1. Preserve
também docs/PROJECT_AUDIT_2026-11-05.md e não misture esses arquivos em um
eventual checkpoint.

Estado 41I.E: a Semana de Prova permite criar e editar provas, matérias e
prioridades; vincular ou desvincular um estudo; associar ou remover materiais;
consultar plano diário, progresso real e retomar após reload. Datas civis são
interpretadas no fuso local, sem retroceder um dia. Falhas de carregamento do
progresso deixam de prender a tela e exibem uma mensagem segura. A remoção de
referências de materiais inacessíveis é informada ao usuário.

A navegação para Tutor, Flashcards, Quiz e Modo Prova preserva o identificador
da prova e do estudo. O retorno contextual leva à mesma prova. Os IDs recebidos
pela URL servem apenas para navegação: a seleção continua limitada aos dados
autorizados da sessão, e um estudo inválido mostra um estado negado com retorno
seguro. O progresso continua vindo exclusivamente das fontes reais consolidadas
na 41I.D; abrir ou recarregar a página não cria conclusão artificial.

A interface recebeu rótulos associados, nomes acessíveis para ações por ícone,
remoção de matérias identificada, uso por teclado na lista de materiais e
ajustes de largura para viewport móvel. Não houve alteração de schema,
endpoint paralelo, gabarito, fallback de IA, quotas ou infraestrutura.

Resultados distintos: 41I.E 4/4; 41I.B/B.1 10/10; 41I.C/D em navegador e
fluxo legado 10/10; matriz ampla de Study Engine, Learning, Tutor/fallback,
Modo Prova, isolamento, cloud sync e Cache/Service Worker 67/67; lógica 41I.D
16/16. Total: 107 aprovados, 0 falhos e 0 ignorados. Typecheck, lint, build e
git diff --check passaram; lint manteve 67 avisos preexistentes e o build gerou
48 páginas. Nenhum serviço externo, chamada paga, migração ou credencial real
foi usado.

41I.A concluiu o diagnóstico; 41I.B/B.1, 41I.C e 41I.D estão implementadas,
validadas e commitadas nos checkpoints anteriores. A 41I.E está implementada
e validada localmente. Seus 107 testes aprovados e os checks estáticos acima
são evidência anterior, não foram repetidos nesta etapa. A Sprint 41 geral
continua aberta; homologação externa permanece pendente.

Próximo passo recomendado: confirmar o checkpoint local da 41I.E e depois
avaliar as pendências documentadas da Sprint 41. Preservar a ordem do roadmap
41 → 42 → 43 → 43B → 44A → 44B → 45 → 46 → 47. Não iniciar a Sprint 42
automaticamente.

Limitações conhecidas: ExamAttemptServer ainda não persiste examId/studyId;
resultados do Modo Prova protegido permanecem fora do resumo quando não existe
vínculo explícito. A verificação móvel foi feita em Chromium 390x844, não em
aparelho físico. Não houve auditoria completa com leitor de tela ou contraste,
nem homologação com providers, PostgreSQL/S3, Vercel ou Supabase reais.

Não execute chamadas pagas nem alterações em .env, Railway, Vercel, Supabase
ou outros serviços. Não exponha credenciais.
```
