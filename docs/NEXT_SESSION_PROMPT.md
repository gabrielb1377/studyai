# Prompt reutilizável — próxima sessão

> **Atualização 44B:** consulte `docs/SPRINT_44B_STATUS.md` para retomar o ciclo de revisão por disciplina. Confirme o Git e preserve os experimentos S3. Semana de Prova 2.0 e simulados adaptativos pertencem à Sprint 45.

> **Atualização 44A:** confira o estado real do Git e leia `docs/SPRINT_44A_STATUS.md` para retomar o fluxo de disciplina completa. Preserve os experimentos S3 e mantenha a revisão espaçada e os simulados adaptativos no escopo de suas sprints.

> **Atualização 43B:** a Sprint 43 foi registrada em `d3e575d`. Leia `docs/SPRINT_43B_STATUS.md` para conferir a implementação local, as validações e os pontos pendentes antes de considerar um checkpoint. Preserve os experimentos S3. A Sprint 44A requer pedido separado.

> **Estado atual (10/11/2026):** a seção abaixo substitui as fotografias históricas conflitantes dentro do prompt antigo. Sprint 42/42.1 está commitada em `de698e4`. Sprint 43 está implementada e validada localmente, ainda sem commit e sem homologação externa. Leia `docs/SPRINT_43_STATUS.md` antes de continuar.

```text
Continue o StudyAI em D:\studyai, branch v1.1-development. Confirme o Git antes de agir e preserve integralmente os experimentos S3, package.json, package-lock.json, o gerador de segredos e docs/PROJECT_AUDIT_2026-11-05.md.

Sprint 43: AIRouter e AIRoutingService classificam tarefas do Tutor por regras determinísticas, estimam tokens e selecionam modelos disponíveis por capacidade, contexto, credencial e quota conhecida. Manual preserva provider/modelo; automático precisa ser ativado pelo usuário. Quota desconhecida não é ilimitada. O Tutor mostra provider/modelo efetivos, origem manual/automática, motivo, limite de saída e eventual redução de contexto. Cache com modelo explícito inclui proprietário e fingerprint da credencial.

Fallback não mudou de contrato: falha de provider não chama alternativa sem consentimento; a alternativa autorizada passa novamente pela quota; não existe terceira tentativa e resposta parcial não é reenviada. A integração automática está limitada ao Tutor. Demais consumidores continuam com o comportamento anterior. Preço exato, RAG completo, OCR e multimodal não foram implementados.

Evidência atual: matriz consolidada Sprint 43/AI Core/providers/fallback/quotas/Tutor 58/58; Sprint 43 específica 13/13. Typecheck, lint (0 erros/50 avisos preexistentes) e build (48 páginas) passaram. Nenhum provider real, chamada paga, PostgreSQL/S3 externo, migration ou produção foi usado.

Próximo trabalho: revisar o diff e, somente com autorização, criar checkpoint local seletivo da Sprint 43, mantendo experimentos S3 e arquivos não relacionados fora do staging. Não iniciar Sprint 43B automaticamente. Não fazer commit, push, merge, rebase, deploy, migration ou alteração de .env sem autorização explícita.
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
para uso pessoal. Naquela fotografia, a Sprint 42 ainda não havia sido iniciada.

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
