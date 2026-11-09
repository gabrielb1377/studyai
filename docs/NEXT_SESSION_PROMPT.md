# Prompt reutilizável — próxima sessão

```text
Continue o StudyAI em D:\studyai, branch v1.1-development.

Antes de programar, leia AGENTS.md/RTK.md, CURRENT_HANDOFF.md,
docs/SPRINT_41_STATUS.md, docs/SPRINT_41G_SECURITY_AUDIT.md e
docs/ROADMAP_V1_2.md. Confirme git status --short, git status -sb e
git log -15 --oneline --decorate. Não faça fetch, reset, clean, stash,
checkout --, rebase, push, merge, deploy ou commit sem autorização.

Fotografia de 8/11/2026: HEAD 363c968. As alterações das Sprints 41I.B/B.1 e
41I.C permanecem não commitadas. Preserve integralmente os experimentos de
upload direto S3: package.json/lock, CloudFileService, CloudDatabase,
ObjectStorage, src/app/api/files/[id]/direct/route.ts,
tests/direct-upload.spec.ts, tests/deploy-security.spec.ts e
scripts/generate-vercel-secret.ps1. Não misture esses arquivos em eventual
checkpoint.

Estado 41I.C: a Semana de Prova abre Tutor, Flashcards, Quiz e Simulado pelo
studyId real. ExamLearningNavigation só habilita ações quando o estudo existe
no catálogo escopado da sessão. TutorContextService aceita o studyId solicitado;
useTutorContext/useTutor invalidam estado e respostas antigas na troca de conta.
Flashcards e Quiz reutilizam serviços, progresso e resultados existentes. O
Simulado abre o QuizWorkspace em modo=exam e continua usando a tentativa e a
correção protegidas no servidor, sem gabarito no payload inicial. Não houve
schema ou endpoint paralelo. Limite: a tentativa não persiste examId.

Resultados: nova suíte 41I.C 6/6; regressão 41I.B.1 10/10; matriz selecionada
41G/41H/Study Engine/Modo Prova/41I.C 54/54; isolamento A → B → A desktop/mobile
2/2; cloud sync isolado 4/4; Cache Storage isolado 1/1. Total distinto: 71/71;
repetição final 41I.C + Tutor 9/9. Typecheck aprovado; lint 0 erros e 67 avisos
preexistentes; build aprovado com 48 páginas. Não foram usados
providers reais, IA paga, PostgreSQL/S3 externos ou credenciais de produção.

Próximo passo recomendado para a 41I.D: primeiro revisar e separar os diffs de
41I.B/B.1 e 41I.C dos experimentos S3. Depois, somente com escopo explícito,
tratar a próxima integração prevista no roadmap e avaliar se o vínculo examId
da tentativa precisa de mudança de schema. Não iniciar automaticamente nem
criar commit sem autorização.

Não execute migrations, chamadas pagas ou alterações em .env, Railway, Vercel,
Supabase ou outros serviços. Não exponha credenciais.
```
