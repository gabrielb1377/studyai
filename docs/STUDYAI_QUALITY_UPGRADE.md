# StudyAI — Quality Upgrade (plano de auditoria e melhorias de interface)

> Documento de planejamento (não aprovado para implementação). Data-base: 22/11/2026. Complementa `docs/DESIGN_SYSTEM.md` (71 linhas); não o substitui.
> Fonte das evidências: auditoria somente leitura por subagente (grep, contagens aproximadas) e leitura de arquivos. **Nada foi executado no navegador, nenhum contraste foi calculado e o bundle não foi medido.** Cada achado abaixo precisa de uma amostra de confirmação antes de virar tarefa.

## 1. Princípios
- Preservar fluxos, rotas, regras e a diretriz **Clean & Functional**. Sem redesign por preferência.
- Só entra no plano o que tem evidência (arquivo e linha) e critério de aceite verificável.
- Reutilizar as primitivas existentes (`src/components/ui`, `EmptyState`, `Skeleton`, `Feedback`) antes de criar novas.

## 2. O que já está bom (não mexer)
| Ponto | Evidência |
|---|---|
| Tokens semânticos em 3 temas (claro, escuro, AMOLED) | `src/styles/globals.css` l.10-125 |
| Skip link, `lang="pt-BR"`, `<main>` | `app-shell.tsx:14-23`, `layout.tsx` |
| `:focus-visible` global e alvos de 44px em ponteiro grosso | `globals.css:179`, `l.321-330` |
| Busca universal acessível (Ctrl/Cmd+K, `aria-live`) | `search-dialog.tsx:52,88,105,115` |
| Respeito a movimento reduzido (CSS) | `globals.css:311-318,364,374` |
| Imports pesados já são dinâmicos (tesseract, transformers, PDF viewer, `next/dynamic` em ~9 pontos) | `OCRService.ts:36`, `MaterialViewer.tsx:22` |
| 1.361 usos de `getByRole` nos testes (a11y semântica implícita) | `tests/` |

## 3. Achados com evidência

### P1
| ID | Achado | Evidência | Esforço | Critério de aceite |
|---|---|---|---|---|
| Q-01 | **Sem identidade tipográfica.** Nenhuma fonte é carregada; a pilha é a do sistema, então a aparência varia por SO. É uma decisão documentada, mas deixa o produto sem assinatura própria | `layout.tsx` (sem `next/font`), `globals.css:152`, `docs/DESIGN_SYSTEM.md` | M | Decisão registrada (manter ou adotar fonte), com fonte licenciada para web (ver `LICENSES.md`: Fontshare exige não redistribuir arquivos isolados), sem aumento de layout shift medido |
| Q-02 | **Rotas sem `loading.tsx`/`error.tsx` próprios** e sem `global-error.tsx`. Só existem `loading`/`error` globais e em biblioteca/importar/organizar. Faltam: academy, aprendizagem, configuracoes, conta, estudo, lab, planejamento, provas, salas, storage, tutor | `src/app/**` | M | Cada rota principal tem loading com `role="status"` e erro com ação de repetir; `global-error.tsx` existe; teste de falha simulada por rota |
| Q-03 | **Texto de 9–11px em ~156 pontos (45 arquivos)** e `--muted-foreground #68716a` sobre `#f8faf7` usado nesses textos. O contraste não foi calculado | `sidebar.tsx:48`, `search-dialog.tsx:94-145`, `app/page.tsx` | M | Escala tipográfica semântica com mínimo definido; contraste de cada token de texto calculado (WCAG 2.2 AA) e registrado |
| Q-04 | **Sem teste de acessibilidade automatizado.** Não há `axe` no projeto | `package.json`, `tests/` | M | Verificação automática de ARIA e contraste nas rotas principais, rodando na CI sem retries. Atenção: adicionar `@axe-core/playwright` é uma **nova dependência** e exige aprovação; alternativa sem dependência: instantâneo de acessibilidade do próprio Playwright |

### P2
| ID | Achado | Evidência | Esforço |
|---|---|---|---|
| Q-05 | Valores fora dos tokens: ~155 cores arbitrárias e ~151 `text-[Npx]` em `src/features`, contra a regra do próprio design system | grep por pasta | G (por fases) |
| Q-06 | Botão `size="icon"` sem nome acessível, e texto "Editar/Excluir" dentro de botão de ícone | `AIQualityPanel.tsx:275-276,381` (amostra de 1 grep; auditar o resto) | P |
| Q-07 | Navegação mobile expõe 5 de ~11 destinos; Lab, Planejamento, Academy, Salas e Aprendizagem dependem do menu ou da busca | `mobile-navigation.tsx:9-13` | M |
| Q-08 | Skeleton e estado vazio duplicados e ad hoc; `Skeleton` usado em 5 arquivos e `EmptyState` em 4 | `StudyDashboard.tsx:23-24`, `app/loading.tsx`; `ExamWorkspace.tsx` sem nenhum dos dois | M |
| Q-09 | Componentes grandes sem estados via primitivas: `ExamWorkspace` (839 linhas), `PersonalizedLearningWorkspace` (785), `PlanningWorkspace` (668) | contagem de linhas | G |

### P3
| ID | Achado | Evidência |
|---|---|---|
| Q-10 | `<img>` 3× e nenhum `next/image`; CSS do KaTeX carregado globalmente; `ocr/pdf.ts:1` importa `react-pdf` estaticamente; `@xyflow/react` com import estático (não conclusivo) | grep |
| Q-11 | `prefers-reduced-motion` duplicado (`globals.css:364` e `374`); raio divergente no mesmo arquivo (`dropdown-menu.tsx:44` vs `:232`); `themeColor #fafbf9` ≠ `--background #f8faf7` | leitura |
| Q-12 | Texto de boas-vindas genérico no painel inicial (`app/page.tsx:9-11`); padrão "eyebrow" repetido | leitura |
| Q-13 | `app/layout.tsx:37` usa `headers()`, o que força renderização dinâmica em todas as rotas. Provável por causa do nonce da CSP; verificar o custo antes de qualquer mudança | leitura |

## 4. "Aparência genérica de IA": avaliação honesta
A evidência **não** sustenta o diagnóstico clássico: só 16 ocorrências de gradiente, nenhum gradiente roxo/azul de marca, e os usos de violeta são semânticos. O que existe é **baixa distintividade**: paleta verde única, ícones `lucide` padrão, fonte do sistema, e uma pilha homogênea de cartões (`rounded-xl` 228×, `rounded-2xl` 51×, sombras 192×). Recomendação: tratar como **identidade** (Q-01, Q-12 e consistência de raio), não como "remoção de slop". Skills como `impeccable` ou `taste-skill` só valem para um passe de crítica pontual, com autorização, porque a primeira grava arquivos (`PRODUCT.md`/`DESIGN.md`).
Não verificado: emojis em TSX, cartões ícone+título repetidos, telas de learning, planning e collaboration em detalhe.

## 5. Plano em sprints pequenas (ver detalhes e dependências em `STUDYAI_FUTURE_ROADMAP.md`)
| Sprint | Escopo | Aceite |
|---|---|---|
| QU-1 Estados e erros | Q-02, Q-08 (primitivas unificadas) | Todas as rotas listadas têm loading/erro; sem skeleton ad hoc nas telas tocadas |
| QU-2 Tipografia e escala | Q-01, Q-03, Q-11 | Escala semântica, contraste calculado e documentado, mínimo de tamanho aplicado nas telas tocadas |
| QU-3 Acessibilidade verificável | Q-04, Q-06 | Verificação automática na CI; botões de ícone com nome |
| QU-4 Navegação mobile e consistência | Q-07, Q-05 (primeira pasta), Q-12 | Destinos acessíveis em até 2 toques; sem overflow em 390×844 |
| QU-5 Telas grandes | Q-09 (uma tela por vez) | Cada tela com loading, vazio e erro pelas primitivas; sem regressão nas specs existentes |

## 6. Verificação e riscos
- Cada sprint: typecheck, lint, specs da tela tocada, viewport 390×844 e teclado. Sem retries.
- Risco principal: **regressão visual sem teste visual**. O projeto não tem comparação de screenshots; mudanças em tokens globais afetam todas as telas. Mitigar mudando token por token, em PRs pequenos.
- Dispositivo físico e leitor de tela real continuam sem validação (pendência já registrada no roadmap).
- Recursos AI-RULES recomendados: `anti-ai-slop-master` (coordenadora), `accessibility-auditor`, `typography-engineering`, `navigation-ui-design`, `mobile-ui-design`, `frontend-ui-engineering`. Evitar duplicatas já nativas (`audit-suite:*`, `frontend-design`).
