# Regras Operacionais — StudyAI (Codex & Antigravity)

Regras persistentes e obrigatórias para agentes atuando em `D:\studyai`.

## 1. Preparação e Diagnóstico Inicial
- Antes de iniciar qualquer trabalho ou sprint, leia obrigatoriamente `CURRENT_HANDOFF.md`, `docs/NEXT_SESSION_PROMPT.md` e as seções relevantes de `docs/ROADMAP_V1_2.md`.
- Consulte o runbook `.agents/skills/studyai-workflow/SKILL.md` sempre que necessário para procedimentos operacionais.
- Inspecione o Git antes de qualquer alteração (`git status -sb`, `git log -1 --oneline` e arquivos modificados/não rastreados). Trate `v1.1-development` como branch de referência histórica, e não como garantia de estado.

## 2. Preservação de Experimentos S3 e Working Tree
- Preserve integralmente os experimentos S3 de upload direto e todas as alterações não commitadas preexistentes (`package.json`, `package-lock.json`, `CloudFileService.ts`, `CloudDatabase.ts`, `ObjectStorage.ts`, `src/app/api/files/[id]/direct/`, `tests/direct-upload.spec.ts`, `tests/deploy-security.spec.ts`, `scripts/generate-vercel-secret.ps1`, `docs/PROJECT_AUDIT_2026-11-05.md`).
- NUNCA inclua arquivos experimentais ou segredos (.env) no staging ou em commits.

## 3. Escopo, Qualidade e Diretrizes Visuais
- Respeite estritamente o escopo da sprint autorizada. Não avance para sprints futuras sem autorização.
- Mantenha a diretriz visual **Clean & Functional** (reduzir redundâncias visuais e cliques; foco no conteúdo; manter identidade própria).
- Execute testes focados para validar novas alterações e corrija imediatamente falhas introduzidas. Não use retries arbitrários para mascarar falhas preexistentes ou intermitentes.
- Registre riscos conhecidos (ex.: reload da Semana de Prova, ausência de banco em produção) sem declará-los resolvidos sem evidência comprovada.
- Carregue Skills especializadas apenas sob demanda quando relevantes para a tarefa específica.

## 4. Governança e Segurança do Git
- NUNCA execute `git commit`, `git push`, `git merge`, `git rebase`, deploy ou migrações de banco sem aprovação prévia e explícita do usuário.
- NUNCA use comandos destrutivos ou indiscriminados (`git add .`, `git add -A`, `git reset --hard`, `git clean`). Use caminhos explícitos e revise o diff.

## 5. Relatório Final Obrigatório
Toda conclusão ou checkpoint de intervenção deve apresentar o relatório estruturado:
1. **Projeto e Plataforma**: Nome do projeto e plataforma em uso (Codex ou Antigravity).
2. **Modelo e Esforço**: Modelo exato e nível de esforço se verificáveis na sessão; caso contrário, registrar expressamente "não verificável".
3. **Sprint / Etapa**: Identificador da sprint ou tarefa executada.
4. **Status e Resumo**: Resultado da intervenção e descrição sucinta das alterações.
5. **Arquivos**: Criados, modificados e preservados (listando experimentos S3 intactos).
6. **Testes e Verificações**: Testes, lint, typecheck ou verificações realmente executados (com resultado numérico ou "nenhum teste de aplicação executado").
7. **Estado do Git**: Branch real, commit HEAD, staging e working tree observados.
8. **Riscos, Pendências e Próxima Etapa**: Riscos residuais e próximo item do roadmap.

*Regra de integridade*: NUNCA invente ou estime dados de modelo, esforço, consumo de tokens, testes ou estado do Git.
