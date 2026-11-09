# Prompt reutilizável — próxima sessão

```text
Continue o StudyAI em D:\studyai, branch v1.1-development.

Antes de programar, leia AGENTS.md/RTK.md, CURRENT_HANDOFF.md,
docs/SPRINT_41_STATUS.md, docs/SPRINT_41G_SECURITY_AUDIT.md e
docs/ROADMAP_V1_2.md. Confirme git status --short, git status -sb e
git log -15 --oneline --decorate. Não faça fetch, reset, clean, stash,
checkout --, rebase, push, merge, deploy ou commit sem autorização.

Fotografia de 8/11/2026: HEAD fb8c619. O checkpoint contém as etapas
41I.B/B.1/C. A 41I.D está implementada, validada e registrada em checkpoint
local criado em seguida. Preserve integralmente os experimentos de upload direto S3:
package.json/lock, CloudFileService, CloudDatabase, ObjectStorage,
src/app/api/files/[id]/direct/route.ts, tests/direct-upload.spec.ts,
tests/deploy-security.spec.ts e scripts/generate-vercel-secret.ps1. Preserve
também docs/PROJECT_AUDIT_2026-11-05.md e não misture esses arquivos em um
eventual checkpoint.

Estado 41I.D: ExamProgressService consolida somente registros reais e
autorizados. StudyEngine é a fonte de progresso; LearningStorage fornece
atividades/tempo; QuizService é a fonte canônica de tentativas, acertos e
erros; FlashcardService fornece cartões distintos revisados. A associação usa
Exam.studyId ou Exam.materialIds → StudyRecord.materialIds, exige data igual ou
posterior a Exam.createdAt e deduplica por ID estável. O evento quiz do Learning
Service não é contado novamente. Abrir/recarregar a página não grava progresso.

O hook useExamProgress valida usuário, geração e sessão suspensa antes de
aplicar resultados e reage aos eventos existentes. A interface diferencia
progresso, atividades, revisões, desempenho e estados vazios. ExamAttemptServer
ainda não persiste examId/studyId; resultados do Modo Prova protegido ficam
fora do resumo, sem correspondência inferida e sem mudança de schema.

Na validação, uma regressão anterior foi corrigida no QuizWorkspace: o modo
Prática voltou a apresentar evolução, ponto forte/fraco e recomendação do
KnowledgeEngine. O Modo Prova protegido não foi alterado.

Resultados distintos: 41I.D 18/18; 41I.B/B.1 10/10; regressões selecionadas
41I.C/Study Engine/Learning/isolamento/Modo Prova 47/47 após autocorreção.
Total final 75 aprovados, 0 falhos e 0 ignorados. Typecheck, lint, build e
git diff --check aprovados; lint com 67 avisos preexistentes; build com 48
páginas. Não foram usados providers reais, IA paga, PostgreSQL/S3 externos,
migrações ou credenciais de produção.

Próximo passo recomendado: confirmar o checkpoint 41I.D no Git e preservá-lo
isolado dos experimentos S3. Depois planejar a 41I.E como tarefa separada. Não
iniciar a 41I.E automaticamente e não criar novos commits sem autorização.

Não execute chamadas pagas nem alterações em .env, Railway, Vercel, Supabase
ou outros serviços. Não exponha credenciais.
```
