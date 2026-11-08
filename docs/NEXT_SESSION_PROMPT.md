# Prompt reutilizável — próxima sessão

```text
Continue o StudyAI em D:\studyai, branch v1.1-development.

Antes de programar, leia AGENTS.md/RTK.md, CURRENT_HANDOFF.md,
docs/PROJECT_AUDIT_2026-11-05.md, docs/SPRINT_41_STATUS.md,
docs/SPRINT_41G_SECURITY_AUDIT.md e docs/ROADMAP_V1_2.md. Confirme o estado real
com git status --short, git status -sb e git log -15 --oneline --decorate. Não
presuma que o HEAD ou a referência remota continuam iguais e não faça fetch sem
autorização.

Fotografia de 8/11/2026: branch v1.1-development, HEAD 03f163b;
origin/v1.1-development conhecido localmente em 331bc15, sem fetch. A Sprint 41
não está concluída; a 41G.3D foi commitada e as 41H/41H.1 estão validadas
localmente, sem commit. Preserve todas as mudanças: núcleo/cliente de IA, quota,
rota e interface do Tutor, identidade offline, testes 41H/41H.1, package.json/lock, CloudFileService,
CloudDatabase, ObjectStorage, rota direta de arquivo, testes de deploy/upload e
scripts/generate-vercel-secret.ps1. O upload direto S3 é experimental.

Resultados da 41G.3D-FINAL: etapa concluída localmente e commitada em `03f163b`. Typecheck
e build aprovados; lint com 0 erros e 68 avisos preexistentes; 90 testes distintos
aprovados: 69 lógicos/mockados, 6 PostgreSQL reais locais, Storage 4/4, cloud sync
4/4, Workspace/Modo Prova 4/4, A → B → A desktop 1/1, Cache Storage 1/1 e mobile
simulado 390 × 844 1/1. Houve intermitências do runner combinado em cadastro,
sync após restore e conflito; os casos passaram isolados. Não houve aparelho
físico, produção, IA paga, S3 externo ou homologação.

Estado da 41H: o Tutor oferece fallback somente após falha recuperável e não chama
alternativa sem consentimento. A oferta mostra provider/modelo/consumo; cancelar
preserva o prompt; a alternativa passa por quota, fica vinculada à conta e é
idempotente em memória por cinco minutos. Resposta parcial nunca troca provider.
Os demais fluxos de IA continuam sem fallback. A idempotência não atravessa
instâncias serverless e precisa de decisão durável antes de garantia financeira.

Estado da 41H.1: as três regressões do AI Core foram resolvidas. O modo offline
agora usa a identidade explícita `offline-session`, separada das contas, para
restaurar preferências legítimas após reload. Dados sem proprietário permanecem
em quarentena. O health do Ollama estava oculto pelo modo simples; o timeout do
dashboard aguardava um controle avançado ausente e não era timeout do provider.
AI Core 3/3, lógica/mock 55/55, Tutor/fallback 8/8 e isolamento desktop/mobile
2/2 passaram. Typecheck, lint (0 erros, 68 avisos) e build passaram.

Próximo trabalho recomendado: revisar o diff 41H/41H.1 e, somente mediante nova
autorização, criar checkpoint local isolado sem misturar o upload direto.

Depois execute typecheck, lint, build e testes focados em sequência. Separe testes
unitários dos de navegador e não misture build/Playwright no mesmo .next. Use
PostgreSQL descartável somente com confirmação explícita; o portão dos testes
rejeita host remoto, banco sem nome de teste, produção e ausência da flag opt-in.
Não use IA paga, credenciais reais ou serviços de produção. Registre aprovados,
falhos e ignorados por classe.

Ainda pendentes na Sprint 41: homologação do fallback com providers reais,
idempotência durável, eventual extensão consentida aos demais fluxos, integração
real da Semana de Prova, validação Academy/IA em homologação e suíte completa estável.
Não iniciar Sprint 42 ou 43B enquanto os gates P0 da Sprint 41 permanecerem
abertos, salvo mudança explícita de prioridade.

Não use git reset, clean, stash, checkout --, rebase ou operações destrutivas. Não
faça push, merge, deploy, migração ou alteração em Railway/Vercel/Supabase. Não
modifique .env nem exponha segredos. Crie commits locais isolados somente quando a
tarefa da próxima sessão autorizar e os testes correspondentes estiverem claros.
```
