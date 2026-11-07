# Prompt reutilizável — próxima sessão

```text
Continue o StudyAI em D:\studyai, branch v1.1-development.

Antes de programar, leia AGENTS.md/RTK.md, CURRENT_HANDOFF.md,
docs/PROJECT_AUDIT_2026-11-05.md, docs/SPRINT_41_STATUS.md,
docs/SPRINT_41G_SECURITY_AUDIT.md e docs/ROADMAP_V1_2.md. Confirme o estado real
com git status --short, git status -sb e git log -15 --oneline --decorate. Não
presuma que o HEAD ou a referência remota continuam iguais e não faça fetch sem
autorização.

Fotografia de 7/11/2026: branch v1.1-development, HEAD ainda 5eb5637;
origin/v1.1-development conhecido localmente em 331bc15, sem fetch. A Sprint 41
não está concluída e a 41G.3D continua não commitada. Preserve todas as mudanças:
package.json/lock, AuthProvider, SyncPreferences, CloudFileService,
TeacherAudioSessionStorage, CloudDatabase, ObjectStorage, rota direta de arquivo,
config/testes 41G.3D, testes de deploy/upload e
scripts/generate-vercel-secret.ps1. O upload direto S3 é experimental.

Resultados da 41G.3D-FINAL: etapa concluída localmente e não commitada. Typecheck
e build aprovados; lint com 0 erros e 68 avisos preexistentes; 90 testes distintos
aprovados: 69 lógicos/mockados, 6 PostgreSQL reais locais, Storage 4/4, cloud sync
4/4, Workspace/Modo Prova 4/4, A → B → A desktop 1/1, Cache Storage 1/1 e mobile
simulado 390 × 844 1/1. Houve intermitências do runner combinado em cadastro,
sync após restore e conflito; os casos passaram isolados. Não houve aparelho
físico, produção, IA paga, S3 externo ou homologação.

Próximo trabalho recomendado: revisar o diff e, somente se autorizado, criar um
commit local isolado da 41G.3D sem misturar o upload direto. O banco local
`studyai_41g2c_test` foi comprovado como descartável e os 6 testes passaram com
URL somente no processo e `STUDYAI_ALLOW_LOCAL_DB_TESTS=1`; não repetir sem
revalidar loopback, conteúdo sintético e ausência de dados importantes.

Depois execute typecheck, lint, build e testes focados em sequência. Separe testes
unitários dos de navegador e não misture build/Playwright no mesmo .next. Use
PostgreSQL descartável somente com confirmação explícita; o portão dos testes
rejeita host remoto, banco sem nome de teste, produção e ausência da flag opt-in.
Não use IA paga, credenciais reais ou serviços de produção. Registre aprovados,
falhos e ignorados por classe.

Ainda pendentes na Sprint 41: fallback de IA consentido/limitado, integração real
da Semana de Prova, validação Academy/IA em homologação e suíte completa estável.
Não iniciar Sprint 42 ou 43B enquanto os gates P0 da Sprint 41 permanecerem
abertos, salvo mudança explícita de prioridade.

Não use git reset, clean, stash, checkout --, rebase ou operações destrutivas. Não
faça push, merge, deploy, migração ou alteração em Railway/Vercel/Supabase. Não
modifique .env nem exponha segredos. Crie commits locais isolados somente quando a
tarefa da próxima sessão autorizar e os testes correspondentes estiverem claros.
```
