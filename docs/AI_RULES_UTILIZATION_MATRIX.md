# StudyAI × AI-RULES — matriz de aproveitamento

> Documento de planejamento (não aprovado para implementação). Data-base: 22/11/2026. Biblioteca: `D:\FERRAMENTAS\AI-RULES` no checkpoint `b6e0216` (v4.1.0), roteador 3.3.0, índice `SKILLS_INDEX.json` v3.4.0 de 21/11/2026.
> Evidência: roteador executado em modo DEEP (4 consultas) e índice lido por metadados (nomes, descrições, origem, tokens). Nenhum `SKILL.md` foi lido integralmente. Nada foi habilitado, instalado ou alterado.

## 1. Fatos verificados sobre o ecossistema

| Item | Valor observado |
|---|---|
| Skills indexadas | 532 (384 core + 148 OpenAI OSS); 382 ativas no core, 2 fixtures descartadas |
| Origem do core | 99 Trail of Bits, 87 marketplace sem verificação, 59 plugins curados, 59 próprias, 57 Anthropic, 9 Vercel, 6 Google, 6 OpenAI |
| Cap do modo DEEP | 8 skills por seleção; hooks (125) e MCPs externos ficam desabilitados até aprovação |
| Custo de contexto | Seleção DEEP de 8 skills: 12,6 a 21,5 mil tokens estimados nas 4 consultas (heurística de ~1,15 token/palavra, não telemetria) |
| Skill própria do projeto | `studyai-workflow` existe na biblioteca (`skills/custom/`, 702 tokens) **e** em `.agents/skills/` do repositório — duas cópias que podem divergir |
| Cobertura de domínio | O roteador cobre **desenvolvimento**. Uma consulta sobre "tutor com ensino socrático, repetição espaçada e tool calling" foi classificada como "General Engineering & Multi-Agent Workflow"; não há domínio pedagógico. O motor pedagógico precisa ser criado no StudyAI |

## 2. Discrepâncias a corrigir na biblioteca (não alterei nada lá)

1. A consulta sem `--agent` devolveu `target_agent: antigravity`. Use sempre `--agent claude-code` ao rodar no Claude Code.
2. `hallmark` aparece com origem `specialist-security-trailofbits` no índice, enquanto `LICENSES.md` o atribui a Nutlope (MIT). Classificação de origem provavelmente errada.
3. Não existem skills `docx`, `pptx`, `xlsx` nem `ocr` no catálogo AI-RULES. Esses recursos vêm dos plugins nativos do Claude (`anthropic-skills:docx|pptx|xlsx|pdf`) ou do runtime OpenAI (`pdf`, `Spreadsheets`). O OCR do StudyAI é código próprio (`src/features/ocr`).
4. O roteador escolheu `remotion-video-production` e `video-production-master` para a consulta de animação educacional. Remotion tem licença própria para equipes com mais de 3 pessoas (ver `LICENSES.md`) e é excessivo para o StudyAI atual.

## 3. Classificação dos recursos relevantes

Legenda: **A** desenvolvimento imediato · **B** melhoria visual · **C** arquitetura e performance · **D** segurança e qualidade · **E** inspira funcionalidade educacional · **F** candidato a runtime do StudyAI · **G** redundante ou incompatível · **H** depende de licença, credencial, custo ou aprovação.

### 3.1 Design e frontend

| Recurso (catálogo) | Origem | Classe | Observação |
|---|---|---|---|
| `anti-ai-slop-master` | própria | B | Coordenadora; decide quais das demais carregar. Ponto de entrada do Quality Upgrade |
| `impeccable` | plugin curado (MIT) | B | Auditoria mecânica de padrões genéricos e `PRODUCT.md`/`DESIGN.md` persistentes. Atenção: ele cria arquivos; usar só com autorização |
| `taste-skill` | plugin curado (MIT) | B | Voltada a landing pages e direção de arte; baixo encaixe em app de estudo. Uso pontual |
| `emil-design-engineering`, `make-interfaces-feel-better` | plugin curado (MIT) | B, G | **Duplicadas** com `audit-suite:*` já nativo no Claude. Usar a nativa |
| `hallmark`, `stageshow`, `ui-ux-pro-max-skill` | curado / marketplace | G | Foco em landing e vitrines de produto; descartar para as telas do StudyAI |
| `navigation-ui-design`, `mobile-ui-design` | própria | B | Úteis: o app tem navegação desktop e mobile e histórico de falhas mobile |
| `typography-engineering`, `component-engineering`, `design-system-engineering`, `interaction-design` | própria | B, C | Úteis para consolidar `docs/DESIGN_SYSTEM.md` e `src/components/ui` |
| `accessibility-auditor` (própria), `a11y-debugging` (Google), `frontend-ui-engineering` | própria / oficial | A, D | Núcleo da trilha de acessibilidade. `a11y-debugging` exige o MCP Chrome DevTools, **não disponível nesta sessão** (H) |
| `anthropic-frontend-design` | Anthropic | G | **Duplicada** com o plugin nativo `frontend-design` |
| `vercel-react-best-practices`, `web-design-guidelines`, `vercel-react-view-transitions` | Vercel (MIT) | C, B | A primeira está duplicada em `audit-suite`. View Transitions só se houver ganho medido |
| `motion-engineering`, `scroll-motion-engineering`, `lottie-animation` | própria | B | Baixa prioridade. O app já usa `tw-animate-css`. Scroll e Lottie sem justificativa pedagógica hoje |

### 3.2 Dados e visualização

| Recurso | Classe | Observação |
|---|---|---|
| `dashboard-design` (própria), `dashboards-and-real-time-visualization`, `data-visualization` (OpenAI curado) | A, E | Úteis para o painel "Meu progresso" e indicadores de aprendizagem |
| `d3-data-visualization`, `react-and-nextjs-data-visualization`, `statistical-and-uncertainty-visualization`, `accessibility-and-inclusive-visualization` | E, F | Base para gráficos de desempenho. O projeto **não** tem D3 no `package.json`; só `@xyflow/react` e KaTeX. Decisão: preferir SVG nativo, como o Diagram Studio já faz |
| `threejs-*`, `three-webgl-game`, `geospatial-*`, `gantt-*`, `scrollytelling-*` | G | Sem benefício educacional demonstrado. Three.js só se um conteúdo 3D específico justificar (geometria, física) |

### 3.3 Inteligência artificial

| Recurso | Classe | Observação |
|---|---|---|
| `context-engineering`, `prompt-engineering-master`, `skill-engineering` | A, E | Para **desenvolvimento** e para desenhar o formato das skills pedagógicas. Não vão para o runtime |
| `ai-sdk` (OpenAI curado, 10,5 mil tokens) | F, G | Descreve o Vercel AI SDK. O StudyAI tem `ProviderManager`, BYOK, quotas e fallback consentido próprios; adotar o SDK seria troca de arquitetura sem benefício demonstrado. Usar só como referência de padrões de tool calling e saída estruturada |
| `goal-prompt`, `routing-middleware`, `netlify-caching` | G | Sem relação com o runtime atual |
| `math-olympiad` (Anthropic) | E | Inspira verificação adversarial de resoluções matemáticas; não copiar instruções para o tutor |
| `teach`, `eli5` (marketplace, 90 tokens) | E | Inspiração de formato. `eli5` é de origem não verificada |

### 3.4 Backend e qualidade

| Recurso | Classe | Observação |
|---|---|---|
| `security-and-hardening` (própria) | D | Já usada nas auditorias. Mantém |
| `semgrep`, `fp-check`, `differential-review`, `sharp-edges`, `supply-chain-risk-auditor`, `spec-to-code-compliance`, `trailmark*` (Trail of Bits) | D, H | Valiosas para o fechamento da V1.2. `semgrep` e `trailmark` executam scripts (exigem auditoria dos scripts e instalação da ferramenta). Recomendação: `fp-check` e `differential-review` imediatamente (só leitura); `semgrep` somente com aprovação |
| `test-driven-development` (própria), `superpowers-tdd`, `tdd` (Pocock) | A, G | **Triplicadas** (e `superpowers:test-driven-development` nativa). Escolher uma: a nativa do Superpowers |
| `debugging-and-error-recovery` (própria), `systematic-debugging`, `diagnosing-superpowers` | A, G | Sobreposição. Manter `debugging-and-error-recovery` (já referenciada pela skill do projeto) |
| `code-review` (3 variantes), `requesting/receiving-code-review` | D | O plugin nativo `code-review` basta |
| `writing-plans`, `to-spec`, `grilling`, `domain-modeling`, `codebase-design` | A, C | Úteis para transformar este planejamento em sprints e em um glossário do domínio |
| `supabase`, `supabase-postgres-best-practices`, `neon-*`, `nextjs`, `react-best-practices` | C, H | Supabase é o banco real. As skills `neon-*` não se aplicam. Consultar `supabase-postgres-best-practices` (639 tokens) para os índices pendentes |
| `chrome-devtools`, `a11y-debugging`, `memory-leak-debugging` | D, H | Dependem do MCP Chrome DevTools, não presente. Alternativa já disponível: Playwright e o navegador embutido do app |

### 3.5 Documentos e multimídia

| Recurso | Classe | Observação |
|---|---|---|
| `pdf`, `reports-pdfs-and-slide-automation`, `Spreadsheets` (OpenAI runtime) | G | O StudyAI já gera PDF e PPTX no Studio (`src/features/academy/studio/export/`). Sem benefício |
| `anthropic-skills:docx|pptx|xlsx|pdf` (nativos do Claude) | G para o runtime | Servem ao desenvolvimento, não ao app |
| `ffmpeg-engineering` | A (dev) / H | O app já processa áudio e vídeo no cliente. FFmpeg no servidor só com decisão de custo e infraestrutura |
| `manim-animation`, `educational-animation` (próprias) | E, F | `educational-animation` contém princípios de carga cognitiva e progressão úteis para desenhar explicações visuais. Manim exige Python e renderização no servidor: **não** entra no runtime atual. Candidato: pré-renderizar poucos módulos offline, como ativos estáticos |
| `remotion-*`, `motion-canvas-engineering`, `video-production-*`, `three*`, `lottie`, `godot`, `character-animation` | G, H | Sem demanda do roadmap. Remotion tem licença com condição para equipes maiores |

## 4. Recursos nativos do Claude e duplicidade

| Capacidade | Nativa nesta sessão | Equivalente AI-RULES | Decisão |
|---|---|---|---|
| Revisão de código | `code-review`, `mattpocock-skills:code-review` | `code-review` (3) | Usar a nativa; não carregar as do AI-RULES |
| TDD | `superpowers:test-driven-development`, `mattpocock-skills:tdd` | `test-driven-development`, `superpowers-tdd`, `tdd` | Usar uma só (Superpowers) |
| Depuração | `superpowers:systematic-debugging`, `mattpocock-skills:diagnosing-bugs` | `debugging-and-error-recovery`, `systematic-debugging` | Manter `debugging-and-error-recovery` (referenciada pelo projeto) |
| Planejamento | `superpowers:writing-plans`, `brainstorming` | `writing-plans` | Usar a nativa |
| Auditoria de design | `audit-suite:*` (inclui Emil e Make Interfaces) | `emil-design-engineering`, `make-interfaces-feel-better` | Usar `audit-suite` |
| Frontend design | `frontend-design` | `anthropic-frontend-design` | Usar a nativa |
| Documentação de bibliotecas | Context7 (MCP) | — | **Requer autorização via `/mcp`**; indisponível até lá. Existe um `.mcp.json` não rastreado criado por outro agente, que não toquei |
| Subagentes | `feature-dev`, `code-review`, `claude-security` | recomendados pelo roteador | Só sob demanda |

## 5. Leitura da classificação

- Nenhum recurso do catálogo foi classificado **F** sem ressalva: o conteúdo das skills é para agentes de programação e não entra no runtime do tutor. A classe F aparece só como *inspiração de padrão* (`ai-sdk`, `educational-animation`, `math-olympiad`) e como candidatos condicionais descritos em `STUDYAI_INTELLIGENCE_ENGINE.md` e `STUDYAI_TOOL_ENGINE.md`.
- A maior parte do valor imediato está em **D** (segurança e qualidade) e **B** (interface), alinhada ao fechamento da V1.2 e ao Quality Upgrade.
- A classe **G** (redundante ou incompatível) é grande: duplicatas com plugins nativos do Claude e recursos de vídeo, 3D e landing page sem demanda do roadmap.
- Um recurso pode ter mais de uma classe. As contagens por classe não são apresentadas porque a classificação é qualitativa e feita por metadados.

## 6. Recomendação de carga por tarefa (cap 8, sem duplicar nativas)

| Tarefa | Skills a carregar |
|---|---|
| Fechamento V1.2 (auth, quotas, DB, CI) | `studyai-workflow`, `security-and-hardening`, `debugging-and-error-recovery`, `fp-check`, `differential-review`, `supabase-postgres-best-practices` |
| Quality Upgrade (auditoria de telas) | `anti-ai-slop-master`, `accessibility-auditor`, `typography-engineering`, `navigation-ui-design`, `mobile-ui-design`, `frontend-ui-engineering`, `impeccable` (com autorização), `audit-suite:*` nativa |
| Desenho do motor pedagógico | `context-engineering`, `prompt-engineering-master`, `skill-engineering`, `domain-modeling`, `writing-plans` (nativa) |
| Gráficos de desempenho | `dashboard-design`, `data-visualization`, `accessibility-and-inclusive-visualization`, `statistical-and-uncertainty-visualization` |

## 7. Riscos de adotar o ecossistema

- **Contexto:** carregar as 8 skills pode consumir de 12 a 21 mil tokens por tarefa; carregar tudo (1,4 milhão estimado) é inviável.
- **Origem:** 87 skills de marketplace sem verificação e 99 de segurança executam scripts; exigir `audit --scan-file` antes de usar.
- **Cópias divergentes:** a `studyai-workflow` do repositório e a da biblioteca podem divergir; definir qual é a fonte.
- **Hooks:** 125 hooks seguem desabilitados e devem continuar assim neste repositório.
