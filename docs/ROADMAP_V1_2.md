# StudyAI — roadmap V1.2

Planejamento, não promessa de implementação. A Sprint 41 estabiliza a base V1.1 antes da evolução para V1.2. Validar escopo e prioridades no início de cada sprint; não considerar funcionalidades planejadas como entregues. Módulos citados são pontos de partida, sujeitos a auditoria.

## Sprint 41 — Estabilização e correções

- **Prioridade:** P0 para bugs de simulado, Academy, segurança de fallback e isolamento; P1 para integração de prova; P2 para ajuda.
- **Objetivos e funcionalidades:** concluir as correções descritas em [SPRINT_41_STATUS.md](SPRINT_41_STATUS.md), incluindo proteção de gabarito, geração real de três modalidades, troca segura e opcional de modelo, sincronização entre contas/dispositivos, associação de atividades aos planos e ajuda acessível.
- **Dependências:** código e testes existentes, contrato de autenticação, políticas de custo e consentimento; validação real apenas em ambiente autorizado.
- **Módulos:** `src/features/quiz`, `src/features/workspace`, `src/features/academy`, `src/features/ai`, `src/features/sync`, `src/features/exam`, `src/features/help`, `src/server/ai`.
- **Conclusão:** fluxos críticos funcionais, sem exposição indevida ou perda de dados; diferenças entre testes simulados e validação real documentadas; nenhum bug crítico aberto declarado como resolvido sem evidência.
- **Testes:** typecheck, lint, build isolado, Playwright desktop/mobile e teclado; API com mocks para falhas/limites de IA; persistência, conflitos, troca de usuários e regressão de autenticação.
- **Riscos:** cobrança por troca inesperada de provedor; contaminação de preferências entre contas; gabarito disponível no cliente; geração real pode falhar por provedor ou configuração.

## Sprint 42 — Segurança, autorização, rate limiting e quotas

- **Prioridade:** P0 para isolamento, autorização e proteção de segredos; P1 para observabilidade e limites operacionais.
- **Objetivos e funcionalidades:** auditar sessão, CSRF, autorização por recurso, chaves BYOK, isolamento de conta e registros; revisar rate limits e quotas para serviços compartilhados, incluindo concorrência e falhas de dependências.
- **Dependências:** estabilização da Sprint 41; inventário de rotas e decisão explícita sobre limites, modos de falha e migração de dados.
- **Módulos:** `src/server/auth`, `src/server/security`, `src/server/ai`, `src/app/api`, `src/features/account`, `src/features/sync`.
- **Conclusão:** política documentada e aplicada às rotas pertinentes, sem segredos em respostas/logs; acesso entre usuários negado e contagem consistente sob concorrência.
- **Testes:** autorização entre duas contas, CSRF, sessão, BYOK, limites, concorrência, indisponibilidade de PostgreSQL e regressão dos fluxos existentes, com dados sintéticos.
- **Riscos:** bloquear usuários legítimos, mudança de limites ou rotação incorreta de chaves; nunca enfraquecer TLS/autenticação para passar testes.

## Sprint 43 — IA por tarefa e fallback econômico

- **Prioridade:** P0 para consentimento, custo e isolamento; P1 para políticas por tarefa e transparência.
- **Objetivos e funcionalidades:** selecionar modelos compatíveis por tarefa; refinar o fallback seguro da Sprint 41, políticas de custo/ordem configuráveis e exibição de modelo realmente utilizado, sem novas tentativas após resposta parcial.
- **Dependências:** política de fallback e autorização da Sprint 41; quotas e limites da Sprint 42; capacidades e preços confirmados no momento da implementação.
- **Módulos:** `src/features/ai`, `src/features/settings`, `src/server/ai`, rotas de Tutor, Academy, flashcards, quiz e resumos.
- **Conclusão:** cada tarefa respeita a seleção e a lista autorizada; falhas não recuperáveis não são repetidas; mudança de provedor pago exige consentimento; dados e chaves permanecem isolados.
- **Testes:** cenários de indisponibilidade, 429, timeout, 401/403, validação, streaming interrompido, limites de tentativas, orçamento e isolamento, sempre com provedores simulados.
- **Riscos:** catálogos, custos e capacidades dos modelos mudam; respostas incompletas ou repetição de chamadas podem gerar cobrança e conteúdo inválido.

## Sprint 44A — Tutor IA com contexto completo de matérias

- **Prioridade:** P1, depois de segurança e política de IA; P0 para privacidade e fidelidade ao material.
- **Objetivos e funcionalidades:** melhorar recuperação e seleção de contexto de matérias e temas, com rastreabilidade de fontes e limites explícitos para materiais ausentes ou grandes.
- **Dependências:** Sprint 43, indexação/extratação existente e decisão sobre escopo e retenção do contexto.
- **Módulos:** `src/features/tutor`, `src/features/retrieval`, `src/features/ai`, `src/features/study`.
- **Conclusão:** Tutor utiliza contexto pertinente autorizado, identifica ausência de fonte e mantém associações corretas sem misturar usuários ou matérias.
- **Testes:** múltiplos materiais e matérias, limites de contexto, citação, arquivo ausente, conteúdo malicioso no material, isolamento e streaming.
- **Riscos:** alucinação, injeção em documentos, custo elevado e exposição de material fora do escopo.

## Sprint 44B — Revisão inteligente e Caderno de Erros

- **Prioridade:** P1 para revisão; P0 para preservação de dados e rastreabilidade dos resultados.
- **Objetivos e funcionalidades:** organizar revisão a partir de progresso, flashcards e erros reais, com caderno de erros e ações de estudo; evitar duplicar registros existentes.
- **Dependências:** Sprint 44A, resultados confiáveis de simulado, sincronização e modelo de dados revisado.
- **Módulos:** `src/features/learning`, `src/features/flashcards`, `src/features/quiz`, `src/features/study`, `src/features/sync`.
- **Conclusão:** registro deriva de atividades reais e identifica estudo/origem; alterações persistem e sincronizam sem duplicação; o usuário controla sua revisão.
- **Testes:** respostas certas/erradas, reexecução, dados antigos, sincronização, conflitos, exclusões e acessibilidade.
- **Riscos:** recomendações falsas, duplicatas, perda de histórico ou associação a matéria incorreta.

## Sprint 45 — Semana de Prova 2.0 e Simulados Adaptativos

- **Prioridade:** P1; segurança do gabarito e consistência da pontuação são P0.
- **Objetivos e funcionalidades:** evoluir planos ligados a matérias, materiais, atividades e progresso; simulados adaptativos baseados em desempenho real e parâmetros explícitos.
- **Dependências:** integração da Sprint 41, política de IA da Sprint 43 e dados de revisão da Sprint 44B.
- **Módulos:** `src/features/exam`, `src/features/quiz`, `src/features/learning`, `src/types/exam.ts`, sincronização e rotas associadas.
- **Conclusão:** plano abre a atividade correta, registra conclusão apenas com vínculo válido e mantém resultados íntegros; adaptação é explicável e não vaza gabarito.
- **Testes:** plano completo, vínculos removidos, pontuação, múltiplos dispositivos, atualização, privacidade de respostas e acessibilidade mobile.
- **Riscos:** contagem duplicada, adaptação com dados insuficientes, sincronização conflituosa e associação incorreta.

## Sprint 46 — Dashboard, busca universal e mobile

- **Prioridade:** P1 para continuidade entre telas e usabilidade; P2 para refinamentos visuais.
- **Objetivos e funcionalidades:** consolidar informações reais no dashboard, pesquisa universal coerente com permissões e navegação responsiva para celular.
- **Dependências:** dados consolidados das Sprints 44–45; design system e critérios de acessibilidade.
- **Módulos:** `src/features/dashboard`, `src/components/layout`, `src/features/library`, `src/features/help`, páginas Next.js.
- **Conclusão:** ações levam ao conteúdo correto, pesquisa respeita usuário e estados vazios, navegação funciona em desktop e celular sem overflow.
- **Testes:** viewport pequeno/grande, teclado e toque, busca com acentos, dados vazios/grandes, isolamento e fluxos de navegação.
- **Riscos:** indicadores desatualizados, resultados não autorizados e degradação de desempenho em dispositivos modestos.

## Sprint 47 — Microinterações, testes finais e preparação de lançamento

- **Prioridade:** P0 para regressão e segurança; P1 para desempenho/acessibilidade; P2 para microinterações.
- **Objetivos e funcionalidades:** polir feedback e estados de carregamento/erro, respeitar movimento reduzido e preparar checklist de lançamento, observabilidade e reversão.
- **Dependências:** funcionalidades críticas concluídas nas sprints anteriores; ambiente de homologação e autorização para qualquer teste externo ou publicação.
- **Módulos:** componentes compartilhados, `src/features`, `tests`, documentação de deploy/monitoramento.
- **Conclusão:** regressão e segurança aprovadas, riscos e rollback revisados, operação e critérios de aceite registrados; implantação depende de autorização separada.
- **Testes:** suíte relevante e E2E, responsividade, leitores de tela/teclado, movimento reduzido, desempenho, recuperação, backup/restore sintéticos e smoke test autorizado.
- **Riscos:** animações prejudicarem acessibilidade, diferenças entre mock e produção, regressões ou dependências externas indisponíveis.

## Referências visuais e de pesquisa

- [Unslop](https://github.com/heydamir/unslop).
- UI UX Pro Max — referência indicada; verificar fonte e licenciamento antes de uso.
- [Appllama Skills](https://github.com/Appllama/appllama-skills).
- [SwiftUI Microinteractions](https://github.com/iAmVishal16/swiftui-microinteractions).

São referências para pesquisa futura; nenhuma ferramenta foi instalada neste checkpoint. Avaliar pertinência ao stack web, acessibilidade e licença antes de adotar qualquer recurso.
