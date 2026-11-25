# StudyAI — roadmap reconciliado V1.2

## Situação em 19/11/2026

As Sprints 41–58 da tabela abaixo estão implementadas e commitadas na `v1.1-development` (48–58 entre 13 e 16/11/2026; 53, 54 e 55 como fundação). Nenhuma tem homologação externa. A fase atual é o **fechamento da V1.2**, sem novas sprints de funcionalidade. O estado vigente e a lista ordenada de pendências estão somente em [CURRENT_HANDOFF.md](../CURRENT_HANDOFF.md#estado-atual--fechamento-da-v12-19112026); este arquivo não repete esse estado. Funcionalidades futuras pertencem a V1.3 ou posterior.

## Registro histórico — Sprint 49D

As etapas 49A–C foram integradas e validadas localmente na 49D. O desenvolvimento segue a diretriz StudyAI Clean & Functional: menos botões redundantes e poluição visual, mais conteúdo, menos cliques e identidade própria. A próxima etapa planejada é a Sprint 50; 51 permanece Estudo Livre 2.0, 52 Laboratório 2.0 e 53–58 funcionalidades inteligentes. Nenhuma aprovação de publicação decorre desta validação. O risco de reload da Semana de Prova permanece sem causa comprovada e deve ser reavaliado antes do release.


## Registro histórico — 12 de novembro de 2026

A Sprint 46 está implementada localmente. Seu fechamento para o MVP pessoal é proposto com ressalvas: 46A em `027e498`, 46B em `d33ae02` e 46C em `d5ade4c`. A 46D registrou 66 testes aprovados inicialmente e uma falha intermitente. Na 46D.1, o teste afetado passou em 10/10 repetições isoladas e a bateria vizinha em 8/8. A falha após reload mobile da Semana de Prova não voltou a ocorrer e sua causa permanece desconhecida. A decisão de produto aceita provisoriamente esse risco exclusivamente para a continuidade do desenvolvimento do MVP pessoal. A causa permanece desconhecida e a falha não está corrigida. Ela deve ser reavaliada antes de qualquer publicação.

A avaliação técnica da Sprint 47 foi concluída localmente, sem aprovação para publicação. Foram 47 testes aprovados, sem falhas ou retries; typecheck e build passaram; lint teve zero erros e 50 avisos preexistentes. Uma amostra local em Chromium carregou seis rotas em 267–505 ms, sem equivalência com produção, e não registrou exceções de página com Service Worker permitido. Não houve alteração de código na Sprint 47. As Sprints 48–58 permanecem planejadas e não estão aprovadas para implementação imediata. Os detalhes anteriores abaixo são um registro histórico de 6/11, não o estado atual.

| Sprint | Planejamento |
| --- | --- |
| 47 — Preparação técnica de release | Avaliação técnica local concluída; publicação e homologação externa permanecem pendentes. |
| 48 — Design System | Identidade visual, cores, tipografia, componentes reutilizáveis, ícones, botões, formulários, cards, estados e microinterações consistentes em desktop e mobile. |
| 49 — Refinamento das telas | Dashboard, Biblioteca, Tutor, Estudo, Revisões e Provas, reutilizando a lógica existente. |
| 50 — Experiência premium e mobile | Navegação, usabilidade, responsividade, acessibilidade, feedback visual, microinterações leves e revisão no navegador. |
| 51 — Estudo Livre 2.0 | Evoluir o criador existente com editor por blocos, templates de aulas, resumos e exercícios, capítulos, pré-visualização, rascunhos, salvamento automático, IA opcional e exportação futura. |
| 52 — Laboratório 2.0 | Revisar ferramentas existentes e planejar código, matemática, gráficos, simulações, desafios com IA, visualização de dados e práticas guiadas. |
| 53 — Planejamento inteligente | Plano de estudos, metas e prioridades, integrado à Semana de Prova. |
| 54 — Aprendizagem personalizada | Mapa de dificuldades, Caderno de Erros e revisões direcionadas. |
| 55 — Tutor avançado | Referências a materiais, explicações por nível, exercícios graduais e contexto por disciplina. |
| 56 — Avaliações adaptativas | Simulados adaptativos, revisões inteligentes e indicadores confiáveis. |
| 57 — Multimodal | Importação de áudio e vídeo e Tutor por voz, avaliando custos, privacidade e infraestrutura. |
| 58 — Produtividade e offline | Modo foco, metas semanais e recursos offline conforme viabilidade. |

### Pendências e critérios

- A associação segura no servidor entre avaliações e tentativas protegidas depende de persistência de avaliações com propriedade verificável e de decisão sobre schema. Antes de expansão multiusuário ou ativação do vínculo, exigir autorização e testes de propriedade cruzada, recuperação e tentativas legadas. O MVP pessoal usa simulados locais independentes desse vínculo.
- O suporte avançado a múltiplas contas foi despriorizado para o MVP pessoal. Qualquer expansão depende de validar isolamento real, sincronização e recuperação com contas de teste.
- A falha de reload da Semana de Prova permanece pendente antes do release. Preservar regressões existentes e investigar imediatamente nova ocorrência, com trace, estado e etapas. Não ocultar falhas com retries ou esperas arbitrárias.
- Aparelhos físicos e leitores de tela exigem validação futura. Critério: percorrer navegação, foco e fluxos principais nos dispositivos disponíveis, registrando resultados.
- Os experimentos S3 permanecem fora dos checkpoints funcionais. Sua integração depende de revisão de segurança e testes com infraestrutura apropriada.
- Segurança de prompt: o **PS-1a** (imagem Markdown remota bloqueada e trecho selecionado do Professor dentro do delimitador) faz parte do fechamento e está commitado localmente em `7e7a157`, sem push e sem validação de CI. É um controle estrutural, não uma proteção absoluta contra injeção. O **PS-1b** (system prompt por provedor, delimitador em Lab, Studio, diagramas, áudio e juiz de qualidade, e revisão da CSP `img-src`) continua pendente e **fora** do fechamento. Estado e evidências no handoff; planejamento em [STUDYAI_FUTURE_ROADMAP.md](STUDYAI_FUTURE_ROADMAP.md).

## Registro histórico — fotografia de 6 de novembro de 2026


Atualizado em **6 de novembro de 2026**. O planejamento original de 30/10 foi preservado e confrontado com o código. Funcionalidade existente não é sinônimo de validação em produção.

## Visão geral

| Sprint | Objetivo | Estado em 6/11/2026 |
| --- | --- | --- |
| 41 | Estabilização, correções, sincronização e fallback básico | PARCIALMENTE IMPLEMENTADA |
| 42 | Segurança, autorização, rate limiting e quotas | PLANEJADA; parte da base já existe |
| 43 | IA por tarefa e fallback avançado | PLANEJADA; fallback entre providers está suspenso |
| 43B | Leitura de prints e extração de exercícios | PROPOSTA; não implementada |
| 44A | Tutor IA com contexto completo de matérias | PLANEJADA; recuperação local já existe |
| 44B | Revisão inteligente e Caderno de Erros | PLANEJADA; revisão básica já existe |
| 45 | Semana de Prova 2.0 e simulados adaptativos | PLANEJADA; Semana de Prova básica já existe |
| 46 | Dashboard, busca universal e melhorias mobile | PLANEJADA; componentes básicos já existem |
| 47 | Microinterações, desempenho e validação final | PLANEJADA |

## Sprint 41 — Estabilização, correções, sincronização e fallback básico

- **Objetivos:** estabilizar Academy, quiz/simulado, sessão, sincronização, armazenamento local, ajuda e fallback antes da V1.2.
- **Entregue:** contrato Academy/quota; navegação Semana de Prova; persistência do simulado; abertura de ferramentas; contenção de fallback não consentido; ajuda categorizada; geração de sessão; Modo Prova protegido; escopos locais por conta.
- **Subdivisões:** 41 inicial e 41G.1B/2B/2C/3A/3B/3C estão validadas localmente; 41F continua parcial; 41G.3D está verde localmente, não commitada e aguarda repetição PostgreSQL descartável. Não há evidência documental de 41H ou 41I.
- **Dependências:** autenticação, CSRF, PostgreSQL para prova protegida, política de dados legados e ambiente de navegador com duas contas sintéticas.
- **Prioridade:** P0 para isolamento, typecheck e migração; P1 para fallback e Semana de Prova; P2 para polimento.
- **Módulos:** `src/features/account`, `sync`, `storage`, `quiz`, `exam`, `academy`, `ai`, `help`, rotas de conta/sync/arquivo/prova.
- **Conclusão:** todos os checks estáticos verdes; isolamento negativo A → B → A demonstrado no navegador e API; nenhuma perda silenciosa; decisão explícita sobre fallback; escopo restante movido formalmente.
- **Testes:** typecheck, lint, build, VM/unitários, Playwright desktop/mobile, duas contas, múltiplas abas, API cross-user, PostgreSQL descartável e falhas/timeout de IA com mocks.
- **Riscos:** namespace local confundido com autorização; dados legados atribuídos à conta errada; resposta atrasada aplicada após logout; regressão do modo prática; falso positivo de testes mockados.

## Sprint 42 — Segurança, autorização, rate limiting e quotas

- **Objetivos:** revisar todas as rotas e recursos por ownership, consolidar CSRF, sessões, BYOK, quotas e rate limits concorrentes.
- **O que já existe:** cookies seguros em produção, CSRF, `requireUser`, `requireSessionOwner` em sync/arquivos/prova, criptografia de chaves, rate limit em login/registro/recuperação/API keys e quota compartilhada.
- **Escopo restante:** matriz completa de autorização das 53 rotas atuais; persistência distribuída de limites; concorrência; revogação; logs redigidos; regras de colaboração e compartilhamento; políticas de erro.
- **Dependências:** encerramento da 41G, inventário de recursos e decisão de hospedagem.
- **Prioridade:** P0 para cross-user, segredos e quotas; P1 para observabilidade.
- **Módulos:** `src/server/auth`, `security`, `ai`, `collaboration`, `src/app/api`, `src/app/auth`.
- **Conclusão:** acesso cruzado negado em todos os recursos privados; mutações protegidas; limites consistentes sob concorrência; nenhum segredo em resposta/log.
- **Testes:** duas contas, CSRF, replay, sessão expirada, IDOR, quotas concorrentes, BYOK, indisponibilidade do banco e fuzz de IDs/payloads.
- **Riscos:** bloquear usuário legítimo, rate limit somente em memória na Vercel, rotação indevida de chaves e diferenças entre mocks e PostgreSQL.

## Sprint 43 — IA por tarefa e fallback avançado

- **Objetivos:** escolher modelos por tarefa, custo e capacidade; permitir fallback curto e explícito; mostrar provider/modelo efetivo.
- **O que já existe:** `ProviderManager`, seleção manual, BYOK, health, cache, quotas, normalização de erros. A lista de candidatos está restrita ao provider escolhido para impedir troca silenciosa.
- **Escopo restante:** lista autorizada por usuário/tarefa, consentimento para outro provider, orçamento, limite de tentativas, sem repetição após resposta parcial e telemetria de modelo efetivo.
- **Dependências:** políticas e quotas da Sprint 42.
- **Prioridade:** P0 para consentimento/custo; P1 para roteamento por tarefa.
- **Módulos:** `src/features/ai`, settings, `src/server/ai`, Tutor, Academy, quiz, flashcards, resumos e Lab.
- **Conclusão:** toda chamada respeita seleção e orçamento; troca paga é consentida; autenticação/validação não é repetida; UI informa modelo real.
- **Testes:** 401/403/429/5xx, timeout, stream parcial, cache, BYOK, shared key, orçamento e isolamento, usando providers simulados.
- **Riscos:** preços/catálogos mudam, cobrança duplicada, fallback com resultado incompatível e exposição de chaves.

## Sprint 43B — Leitura de imagens e extração de exercícios

**Estado: PROPOSTA DE ROADMAP. Não está implementada e não deve ser iniciada antes das Sprints 41–43.**

- **Objetivos:** importar capturas de tela, listas e simulados, especialmente materiais acadêmicos da Estácio, e extrair questões estruturadas com revisão humana.
- **Funcionalidades:** PNG, JPG, WEBP e PDF com imagens; OCR local ou modelo multimodal autorizado; enunciados, alternativas, fórmulas, tabelas e código; matéria/unidade/tema com confirmação; trechos ilegíveis revisáveis; deduplicação; Biblioteca; limites de páginas/tamanho/custo.
- **Regras:** preservar enunciados e alternativas; não inventar gabarito oficial; identificar conteúdo inferido; isolar arquivos por usuário; manter origem e página.
- **Integrações futuras:** Tutor, Quiz, Simulados, Flashcards e Caderno de Erros.
- **Dependências:** segurança/quota da Sprint 42, roteamento da 43, pipeline de OCR/importação e modelo de proveniência.
- **Prioridade:** P1; isolamento, fidelidade e custo são P0.
- **Módulos prováveis:** `src/features/import`, `ocr`, `extraction`, `library`, `ai`, novos tipos/validação de questões.
- **Conclusão:** amostras reais são extraídas com proveniência e revisão; trechos incertos não viram fatos; duplicatas são detectadas; nenhum gabarito é inventado.
- **Testes:** imagens reais sintéticas/licenciadas, baixa resolução, rotação, tabelas, fórmulas, código, duplicatas, limites, offline e isolamento, sem serviço pago obrigatório.
- **Riscos:** OCR incorreto, direitos autorais, custo multimodal, fórmulas corrompidas, injeção em imagem e associação à disciplina errada.

## Sprint 44A — Tutor IA com contexto completo de matérias

- **Objetivos:** recuperar contexto autorizado de vários materiais e matérias, com proveniência e limites explícitos.
- **O que já existe:** chunks, busca lexical/vetorial local, grafo de conhecimento, `RetrievalPipeline`, Tutor/Professor e histórico.
- **Integração 43B:** usar questões extraídas para explicação simples/profunda, resolução passo a passo, exercícios interativos, simulados semelhantes, resumos, flashcards e conceitos cobrados.
- **Regra de transparência:** diferenciar texto extraído do material, conhecimento complementar e resposta inferida.
- **Dependências:** 43/43B, indexação e política de retenção/contexto.
- **Prioridade:** P1; privacidade e fidelidade são P0.
- **Módulos:** `src/features/tutor`, `retrieval`, `semantic`, `study`, `ai`.
- **Conclusão:** contexto certo, origem rastreável, ausência de fonte indicada e nenhum cruzamento entre contas/matérias.
- **Testes:** múltiplos materiais, limites de contexto, arquivo ausente, conteúdo malicioso, fontes, streaming e isolamento.
- **Riscos:** alucinação, prompt injection em documentos, contexto excessivo e custo.

## Sprint 44B — Revisão inteligente e Caderno de Erros

- **Objetivos:** transformar erros e progresso reais em revisão planejada, com deduplicação e controle do usuário.
- **O que já existe:** Learning Engine, flashcards, quizzes, progresso, revisão básica e resultados do Modo Prova protegido.
- **Integração 43B:** registrar dificuldades observadas nas questões importadas/respondidas, preservando origem, histórico, privacidade e deduplicação.
- **Dependências:** 44A, resultados confiáveis, sincronização e modelo de eventos.
- **Prioridade:** P1; integridade do histórico é P0.
- **Módulos:** `src/features/learning`, `flashcards`, `quiz`, `study`, `sync` e novos registros de erro.
- **Conclusão:** somente atividades reais geram erros; cada item tem origem; reexecução não duplica; sincronização preserva edições/exclusões.
- **Testes:** certo/errado, reexecução, dados antigos, conflitos, exclusões, questão importada e acessibilidade.
- **Riscos:** recomendação falsa, duplicata, perda de histórico e matéria incorreta.

## Sprint 45 — Semana de Prova 2.0 e Simulados Adaptativos

- **Objetivos:** evoluir a tela básica para planos ligados a matérias, materiais e atividades; gerar simulados adaptativos explicáveis.
- **O que já existe:** rota/menu `/provas`, CRUD local, prioridades, plano diário e progresso manual; Modo Prova protegido separado.
- **Escopo restante:** IDs estáveis de estudo/material/atividade, conclusão sem duplicação, resultados, sincronização, adaptação por desempenho e retomada.
- **Dependências:** 41 concluída, política de IA 43 e dados 44B.
- **Prioridade:** P1; integridade de resultado e gabarito são P0.
- **Módulos:** `src/features/exam`, `quiz`, `learning`, `types/exam.ts`, sync e APIs de tentativa.
- **Conclusão:** plano abre a atividade correta, resultado atualiza uma vez, adaptação é explicável e gabarito não vaza.
- **Testes:** vínculos removidos, pontuação, múltiplos dispositivos, offline, privacidade e mobile.
- **Riscos:** progresso duplicado, associação incorreta e adaptação com poucos dados.

## Sprint 46 — Dashboard, busca universal e melhorias mobile

- **Objetivos:** consolidar dados reais no dashboard, busca autorizada e navegação mobile coerente.
- **O que já existe:** dashboard, busca local/global, sidebar, PWA e layouts responsivos.
- **Dependências:** dados consolidados das Sprints 44–45 e design system.
- **Prioridade:** P1 para navegação/continuidade; P2 visual.
- **Módulos:** `src/features/dashboard`, `search`, `library`, `help`, `src/components/layout` e páginas.
- **Conclusão:** ações abrem o recurso correto, busca respeita a conta e mobile não apresenta overflow/bloqueio.
- **Testes:** teclado, toque, leitores de tela, viewport, acentos, conjuntos grandes/vazios, isolamento e desempenho.
- **Riscos:** indicadores desatualizados, resultado não autorizado e regressão em dispositivos modestos.

Referências visuais preservadas para pesquisa futura, sem instalação nesta auditoria:

- [Unslop](https://github.com/heydamir/unslop)
- UI UX Pro Max
- [Appllama Skills](https://github.com/Appllama/appllama-skills)
- [SwiftUI Microinteractions](https://github.com/iAmVishal16/swiftui-microinteractions)

## Sprint 47 — Microinterações, desempenho e validação final

- **Objetivos:** estados de carregamento/erro, movimento reduzido, desempenho, observabilidade, rollback e gate de lançamento.
- **Dependências:** funcionalidades críticas concluídas e homologação autorizada.
- **Prioridade:** P0 para regressão/segurança; P1 para desempenho/acessibilidade; P2 para microinterações.
- **Módulos:** componentes compartilhados, features, testes e documentação operacional.
- **Conclusão:** suíte e segurança aprovadas, acessibilidade revisada, riscos aceitos e procedimento de rollback testado.
- **Testes:** E2E completo, segurança, desktop/mobile, teclado/leitor de tela, movimento reduzido, backup/restore e smoke test autorizado.
- **Riscos:** polimento introduzir regressão, diferença mock/produção e dependências externas indisponíveis.

## Ordem recomendada

1. Repetir o gate PostgreSQL descartável e revisar/commitá-lo isoladamente quando autorizado.
2. Executar Sprint 42.
3. Executar Sprint 43.
4. Planejar e validar a proposta 43B.
5. Prosseguir para 44A, 44B, 45, 46 e 47 na ordem de dependências acima.
