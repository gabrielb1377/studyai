---
name: studyai-workflow
description: Planejar, implementar, validar ou preparar checkpoints de sprints do StudyAI em D:/studyai. Use para trabalho nesse repositório quando houver contexto de sprint, handoff, Git ou experimentos S3 a preservar.
---

# StudyAI workflow

1. Leia primeiro as seções atuais de `CURRENT_HANDOFF.md` e `docs/NEXT_SESSION_PROMPT.md`. Confira branch, HEAD, staging e arquivos alterados em `D:/studyai`. A branch de trabalho é `v1.1-development`. Use o Git como fonte do estado atual e trate registros antigos como históricos.
2. Siga o roadmap e os critérios de aceite da sprint solicitada. Trabalhe em uma sprint por vez. Priorize o MVP pessoal, justifique mudanças de escopo e só reabra decisões aprovadas com evidência nova. A Sprint 45 fechou o MVP pessoal. A 46 cobre dashboard, progresso e mobile. A 47 prepara o release. A associação protegida entre avaliações e tentativas no servidor fica adiada até antes da expansão multiusuário ou ativação do vínculo.
3. Leia apenas arquivos necessários. Use RTK conforme as regras locais e preserve a saída integral com `rtk proxy` quando precisar diagnosticar falhas. Use Headroom sob demanda para saídas longas que precisem ser recuperadas. Não dependa do Serena enquanto a navegação semântica estiver sem validação. Evite logs extensos, releituras, buscas e testes redundantes. Use agentes adicionais apenas quando solicitado ou exigido por instruções aplicáveis.
4. Faça mudanças pequenas e verificáveis. Corrija falhas dentro do escopo, comece pelos testes focados, rode regressões relevantes e amplie a validação antes do encerramento quando apropriado. Não masque falhas. Informe separadamente o que passou, falhou ou não foi executado.
5. Faça commits apenas com autorização específica, em checkpoint solicitado separadamente. Push, merge, rebase, deploy e migrações exigem autorização. Nunca use `git add .`, `git add -A`, `git reset --hard` ou `git clean`. Exclua segredos e arquivos `.env` do staging. Use caminhos explícitos e revise o diff staged antes do commit.
6. Preserve os experimentos S3 listados no handoff, incluindo `package.json`, `package-lock.json`, `CloudFileService.ts`, `CloudDatabase.ts`, `ObjectStorage.ts`, `src/app/api/files/[id]/direct/`, `tests/direct-upload.spec.ts`, `tests/deploy-security.spec.ts`, `scripts/generate-vercel-secret.ps1` e `docs/PROJECT_AUDIT_2026-11-05.md`. Mantenha esse trabalho fora do staging.
7. Resuma mudanças, testes observados, bloqueios e estado do Git. Não declare conclusão sem evidência. Atualize a documentação apenas quando o estado ou as decisões mudarem.

Consulte somente as skills complementares relevantes: `context-engineering` para contexto extenso, `debugging-and-error-recovery` para falhas, `frontend-ui-engineering` para interface, `test-driven-development` para testes e `security-and-hardening` para segurança.

## Workaround de execução Playwright (ambiente Windows/sandbox)

- **Sintoma observado:** ao iniciar `next dev --port 3000` via `webServer` interno do Playwright, a execução pode travar antes de `Ready` e antes do `globalSetup` (aquecimento das 22 rotas).
- **Causa:** não confirmada (não atribuída com certeza a um subsistema específico; o `next dev` e o warm-up funcionam normalmente quando iniciados fora do `webServer`).
- **Procedimento que funcionou:** no mesmo comando, inicie `npm run dev -- --port 3000` separadamente, aguarde `http://localhost:3000/api/health/live` responder HTTP `200`, e execute `npx playwright test ...` sem `PLAYWRIGHT_PORT` (reutilizando o servidor via `reuseExistingServer`) com `--global-timeout` explícito.
- **Encerramento correto:** utilize bloco `try / finally` para encerrar exclusivamente o processo ouvinte da porta `3000` (`Get-NetTCPConnection -LocalPort 3000 -State Listen`) e o processo iniciado pela tarefa, evitando processos órfãos.
