# Sprint 41 — estado e validação

Checkpoint de 30 de outubro de 2026. **Sprint não concluída; não autoriza publicação.** Este registro descreve o repositório e os testes locais, não uma nova inspeção dos serviços externos.

## Estado Git

- Branch: `v1.1-development`. HEAD da implementação antes do checkpoint de documentação: `19cb815`.
- `0215035`: prepara os dados para o middleware de quota na geração Academy.
- `f6bcb58`: adiciona Semana de Prova ao menu principal.
- `19cb815`: persiste estado do simulado e remove o limite que impedia abertura de ferramentas.
- A referência remota local `origin/v1.1-development` estava em `331bc15`, quatro commits atrás do HEAD; não houve fetch nesta auditoria, portanto isso não confirma o estado remoto atual. `3b54bb8`, anterior aos três commits acima, também estava apenas na branch local segundo essa referência.

## Implementado localmente

- Academy: `src/app/api/academy/generate/route.ts` fornece `history` e `message` preparados ao middleware de quota. Antes, a construção antecipada do prompt recebia campos ausentes. A correção não prova que todas as respostas reais dos provedores são válidas.
- Semana de Prova: entrada para `/provas` em `src/lib/navigation.ts`.
- Simulado: `QuizWorkspace.tsx` e `WorkspacePersistence.ts` guardam respostas, modo e posição, preservando lacunas em respostas não preenchidas. O modo prova mostra seleção sem exibir explicação na interface antes da entrega.
- Estudos: removido o limite de seis painéis em `PanelManager.ts`, que podia impedir a abertura de outra ferramenta e selecionar painel incorreto. Revisão, IA Quality, Lab e Resumos abriram em teste local depois de outros painéis.

## Validado localmente na sessão anterior

- `npm run typecheck`: aprovado. `npm run lint`: aprovado, 0 erros e 69 avisos. `npm run build`: aprovado em cópia isolada, sem credenciais externas configuradas.
- Playwright dirigido: uma rodada com 6 aprovados, incluindo testes de rotas de flashcards/quiz com mocks, contrato Academy com mocks e Workspace. Outra rodada teve 13 testes: 11 passaram e 2 expiraram com espera de 5 segundos; ambos passaram em repetição com expectativa de 20 segundos. Não somar esses números como casos únicos nem tratá-los como suíte completa.
- Simulado: seleção e alteração A–D, navegação, atualização de página, Enter, pontuação e entrega em 1280 px e 390 px; respostas de geração simuladas. O modo prática e toque físico não foram integralmente validados nessa rodada.
- Sincronização: testes de desenvolvimento passaram para fila incremental/offline, conflitos entre dois contextos e exclusão sincronizada. Não comprovam uso do PostgreSQL/S3 de produção nem isolamento completo na troca de contas.
- Os testes que expiraram foram integração Academy com abertura no Professor e cadastro/sessão: o primeiro aguardava navegação e o segundo ainda estava carregando o cadastro. A repetição passou; a causa precisa ser investigada com tempos, compilação e possíveis falhas intermitentes, sem assumir que foi apenas lentidão.
- A causa dos cliques que não respondiam no ambiente publicado não foi reproduzida conclusivamente.

## Não validado em produção após as alterações

- Geração real de material, trilha e projeto Academy; disponibilidade, timeout e formatos dependem de provedor/modelo reais.
- Tutor, flashcards, quiz e demais fluxos de IA com a nova versão.
- Conexão PostgreSQL, TLS e S3 com esta versão; o build isolado não acessou esses serviços.
- Comportamento após publicação em PC e celular, inclusive teclado e toque físico.

## Pendências críticas

1. Implementar fallback opcional e limitado: modelo escolhido primeiro; outro modelo previamente autorizado do mesmo provedor apenas para falhas recuperáveis; outro provedor apenas com consentimento explícito. Não repetir falhas de autenticação, permissão ou validação. Exibir modelo efetivo e troca, considerar custo e não persistir resposta parcial. O modo automático existente pode alternar provedores e precisa ser revisto antes de alegar que cumpre essa política.
2. Isolar preferências e planos entre contas no mesmo navegador: IndexedDB tem escopo por usuário, mas dados e preferências em `localStorage` usados na sincronização são compartilhados. Investigar migração sem perda e testar troca de conta, conflitos e reconexão.
3. Integrar planos existentes de Semana de Prova a estudos, materiais, flashcards, quizzes e progresso somente por associações válidas; não duplicar dados.
4. Evoluir Central de Ajuda: categorias expansíveis, guias e solução de problemas, mantendo pesquisa e rolagem existentes; não documentar fallback como funcional antes de implementá-lo.
5. Revisar o gabarito: as questões incluem a resposta correta no navegador antes da entrega. Ocultação visual não é sigilo; definir e testar correção e proteção apropriadas.
6. Investigar os dois timeouts descritos acima e reproduzir/diagnosticar a queixa original de seleção do simulado no ambiente apropriado.

## Arquivos experimentais a preservar

Já estavam não commitados: `package.json`, `package-lock.json`, `playwright.config.ts`, `src/features/sync/CloudFileService.ts`, `src/server/cloud/CloudDatabase.ts`, `src/server/storage/ObjectStorage.ts`, `src/app/api/files/[id]/direct/route.ts`, `tests/deploy-security.spec.ts`, `tests/direct-upload.spec.ts` e `scripts/generate-vercel-secret.ps1`. Não presumir que upload direto foi aprovado nem incluir esses arquivos em commits de outra tarefa.

Consulte [CURRENT_HANDOFF.md](../CURRENT_HANDOFF.md), [roadmap](ROADMAP_V1_2.md) e [prompt da próxima sessão](NEXT_SESSION_PROMPT.md).
