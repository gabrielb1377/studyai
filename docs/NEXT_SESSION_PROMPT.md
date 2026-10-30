# Prompt reutilizável — próxima sessão

```text
Continue a Sprint 41 do StudyAI em D:\studyai, branch v1.1-development.
Comece lendo CURRENT_HANDOFF.md, docs/SPRINT_41_STATUS.md e docs/ROADMAP_V1_2.md.
Confirme o Git e as instruções AGENTS.md atuais, inclusive HEAD e divergência com a
referência remota disponível. O checkpoint de documentação registra uma fotografia,
não presuma que o ambiente externo ou o Git continuem iguais.

Preserve integralmente as alterações experimentais não commitadas de upload direto
S3, os respectivos testes, package.json/lock e playwright.config.ts, bem como
scripts/generate-vercel-secret.ps1. Não use reset --hard, git clean, push, merge
ou deploy; não altere Railway ou dados/credenciais de produção. Não exiba segredos.

Priorize o restante P0 da Sprint 41: investigar e implementar fallback de IA seguro
e opcional com autorização explícita, limites, restrição de custos e testes; revisar
isolamento de preferências entre contas e proteção real do gabarito; investigar os
timeouts e a queixa original de cliques do simulado. Depois trate a integração de
Semana de Prova e a ajuda. Não substitua fluxos reais por respostas simuladas.

Antes de editar, rastreie os fluxos completos e avalie riscos de migração/perda de
dados. Use mocks e dados sintéticos, sem acessar serviços de produção. Execute
typecheck, lint, build isolado e testes focados relevantes, separando Playwright de
build para evitar conflitos de .next. Registre quantidades, falhas e repetições.
Use commits locais isolados apenas para alterações validadas e nunca inclua o trabalho
experimental em commits não relacionados. Atualize a documentação e informe riscos,
testes reais, HEAD e o que ainda exige validação na Vercel. Não declare a sprint
concluída enquanto houver funcionalidade crítica quebrada ou não validada.
```
