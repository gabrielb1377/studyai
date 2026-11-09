# Prompt reutilizável — próxima sessão

```text
Continue o StudyAI em D:\studyai, branch v1.1-development.

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
