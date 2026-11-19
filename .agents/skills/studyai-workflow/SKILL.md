---
name: studyai-workflow
description: Planejar, implementar, validar ou preparar checkpoints de sprints do StudyAI em D:/studyai. Use para trabalho nesse repositório quando houver contexto de sprint, handoff, Git ou experimentos S3 a preservar.
---

# StudyAI workflow

1. Leia primeiro a seção "Estado atual" no topo de `CURRENT_HANDOFF.md`; é a única fonte de estado documental. Confira branch, HEAD, staging e arquivos alterados em `D:/studyai`. A branch de trabalho é `v1.1-development`. Se o Git divergir do handoff, o Git prevalece.
2. As Sprints funcionais 41–58 estão implementadas. A fase atual é **fechamento da V1.2** (estabilização, segurança operacional, homologação e release), sem novas funcionalidades. Siga a lista ordenada de pendências do handoff, um item por vez, com critério de aceite explícito. Só reabra decisões aprovadas com evidência nova. A associação protegida entre avaliações e tentativas no servidor continua adiada até antes da expansão multiusuário.
3. Leia apenas arquivos necessários. Use RTK conforme as regras locais e preserve a saída integral com `rtk proxy` quando precisar diagnosticar falhas. Use Headroom sob demanda para saídas longas que precisem ser recuperadas. Não dependa do Serena enquanto a navegação semântica estiver sem validação. Evite logs extensos, releituras, buscas e testes redundantes. Use agentes adicionais apenas quando solicitado ou exigido por instruções aplicáveis.
4. Faça mudanças pequenas e verificáveis. Corrija falhas dentro do escopo, comece pelos testes focados, rode regressões relevantes e amplie a validação antes do encerramento quando apropriado. Não masque falhas. Informe separadamente o que passou, falhou ou não foi executado.
5. Faça commits apenas com autorização específica, em checkpoint solicitado separadamente. Push, merge, rebase, deploy e migrações exigem autorização. Nunca use `git add .`, `git add -A`, `git reset --hard` ou `git clean`. Exclua segredos e arquivos `.env` do staging. Use caminhos explícitos e revise o diff staged antes do commit.
6. O experimento de upload direto S3 está na branch `exp/s3-direct-upload`; não o traga para a `v1.1-development` sem revisão de segurança e autorização. Mantenha o working tree limpo; experimentos novos vão para branches `exp/<nome>`. Faça backup fora do repositório antes de qualquer operação que possa descartar trabalho não commitado.
7. Resuma mudanças, testes observados, bloqueios e estado do Git. Não declare conclusão sem evidência. Quando o estado mudar, reescreva a seção "Estado atual" do handoff em vez de acrescentar outra acima dela.
8. Testes Playwright de lógica (módulos carregados em VM, sem navegador) podem rodar sem servidor com `npx playwright test -c playwright.41g1b.config.ts <spec> -g "<filtro>"` (sem `globalSetup`, `retries: 0`). Testes de navegador seguem o workaround abaixo.

Consulte somente as skills complementares relevantes: `context-engineering` para contexto extenso, `debugging-and-error-recovery` para falhas, `frontend-ui-engineering` para interface, `test-driven-development` para testes e `security-and-hardening` para segurança.

## Workaround de execução Playwright (ambiente Windows/sandbox)

- **Sintoma observado:** ao iniciar `next dev --port 3000` via `webServer` interno do Playwright, a execução pode travar antes de `Ready` e antes do `globalSetup` (aquecimento das 22 rotas).
- **Causa:** não confirmada (não atribuída com certeza a um subsistema específico; o `next dev` e o warm-up funcionam normalmente quando iniciados fora do `webServer`).
- **Procedimento que funcionou:** no mesmo comando, inicie `npm run dev -- --port 3000` separadamente, aguarde `http://localhost:3000/api/health/live` responder HTTP `200`, e execute `npx playwright test ...` sem `PLAYWRIGHT_PORT` (reutilizando o servidor via `reuseExistingServer`) com `--global-timeout` explícito.
- **Encerramento correto:** utilize bloco `try / finally` para encerrar exclusivamente o processo ouvinte da porta `3000` (`Get-NetTCPConnection -LocalPort 3000 -State Listen`) e o processo iniciado pela tarefa, evitando processos órfãos.
