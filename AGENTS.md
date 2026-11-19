# Regras Operacionais — StudyAI (Codex, Claude Code & Antigravity)

Regras persistentes e obrigatórias para agentes atuando em `D:\studyai`.

## 1. Preparação e Diagnóstico Inicial
- Antes de iniciar qualquer trabalho, leia a seção **"Estado atual"** no topo de `CURRENT_HANDOFF.md`. Ela é a única fonte de estado; o restante do arquivo, `docs/NEXT_SESSION_PROMPT.md` e os relatórios de sprint são históricos. Consulte `docs/ROADMAP_V1_2.md` somente na seção relevante.
- Confirme o estado no Git antes de confiar em qualquer documento (`git status -sb`, `git log --oneline -10`, arquivos modificados/não rastreados). Se o Git divergir do handoff, o Git prevalece; registre a divergência.
- Consulte o runbook `.agents/skills/studyai-workflow/SKILL.md` quando precisar de procedimentos operacionais.
- A branch de trabalho é `v1.1-development`. `main` está defasada e é a origem do deploy no Railway; nada vai para `main` sem PR de release aprovado.

## 2. Experimentos e Working Tree
- O experimento de upload direto S3 está commitado na branch local `exp/s3-direct-upload` (`7b7be19`), fora da `v1.1-development`. Não faça merge, cherry-pick ou rebase dele sem revisão de segurança e autorização. Lacunas conhecidas: a rota `direct/` não chama `requireActiveSession` nem `validateFileUpload`.
- Mantenha o working tree limpo entre tarefas. Novo experimento vai para uma branch `exp/<nome>`, não para alterações soltas na `v1.1-development`.
- Antes de qualquer operação que possa descartar trabalho não commitado, faça backup (patch e arquivos não rastreados) fora do repositório.
- NUNCA inclua segredos (`.env`, `.env.local`) no staging ou em commits. Os arquivos `.env*.example` são versionados e não podem conter valores reais.

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
1. **Projeto e Plataforma**: Nome do projeto e plataforma em uso (Codex, Claude Code ou Antigravity).
2. **Modelo e Esforço**: Modelo exato e nível de esforço se verificáveis na sessão; caso contrário, registrar expressamente "não verificável".
3. **Sprint / Etapa**: Identificador da sprint ou tarefa executada.
4. **Status e Resumo**: Resultado da intervenção e descrição sucinta das alterações.
5. **Arquivos**: Criados, modificados e preservados (incluindo o estado das branches `exp/*`).
6. **Testes e Verificações**: Testes, lint, typecheck ou verificações realmente executados (com resultado numérico ou "nenhum teste de aplicação executado").
7. **Estado do Git**: Branch real, commit HEAD, staging e working tree observados.
8. **Riscos, Pendências e Próxima Etapa**: Riscos residuais e próximo item do roadmap.

*Regra de integridade*: NUNCA invente ou estime dados de modelo, esforço, consumo de tokens, testes ou estado do Git.

## 6. Manutenção do Estado
- Ao fechar uma tarefa que muda o estado do projeto, reescreva a seção "Estado atual" de `CURRENT_HANDOFF.md` (no máximo cerca de 60 linhas). Não acrescente uma nova seção "Estado atual" acima da anterior: mova a anterior para o histórico apenas se ela tiver informação que o Git não registra.
- Não duplique o estado em `docs/ROADMAP_V1_2.md` ou `docs/NEXT_SESSION_PROMPT.md`; esses arquivos apontam para o handoff.
