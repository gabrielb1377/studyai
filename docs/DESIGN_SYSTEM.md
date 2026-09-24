# Design System — StudyAI UX/UI 3.0

Atualizado em 24 de setembro de 2026.

## Princípios

O sistema visual prioriza conteúdo, leitura prolongada e previsibilidade. Funcionalidades técnicas permanecem acessíveis no modo Avançado; o modo Simples mostra primeiro as jornadas de estudo. As mesmas primitives atendem Web, PWA, Electron e Capacitor.

## Tokens

Os tokens canônicos ficam em `src/styles/globals.css` e são expostos ao Tailwind 4 por `@theme inline`.

| Grupo | Contrato |
| --- | --- |
| Cores | `background`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` e `sidebar` |
| Superfícies | `--surface-raised` e `--surface-subtle` |
| Sombras | `--shadow-card` para conteúdo e `--shadow-floating` para menus, navegação e diálogos |
| Raio | Base de `0.875rem`, com escala `sm` a `xl` |
| Movimento | `--motion-fast`, `--motion-normal` e `--ease-out` |
| Tipografia | Pilha nativa do sistema, números tabulares quando necessário e escala controlada por preferência |

Os temas suportados são Claro, Escuro, AMOLED e Sistema. O tema AMOLED usa preto real nas superfícies principais sem perder bordas, foco ou contraste semântico.

## Primitives

Componentes reutilizáveis ficam em `src/components/ui`. Telas não devem recriar Button, Card, Input, Badge, Progress, Tabs, Dialog, Dropdown, Tooltip ou Skeleton. Estados vazios devem usar `src/components/empty-state.tsx`; cabeçalhos de páginas usam `src/components/page-heading.tsx`.

Variações visuais devem ser expressas por props ou classes no componente base. Cores semânticas nunca devem ser definidas por hexadecimal dentro de features.

## Acessibilidade

- Foco visível global com contraste reforçado no modo Alto contraste.
- Alvos de toque de pelo menos 44 px em ponteiros coarse.
- Preferência manual de redução de movimento, além de `prefers-reduced-motion`.
- Escalas de texto Pequena, Padrão, Grande e Extra.
- Navegação por teclado em dialogs, menus, tabs, pesquisa e divisórias do Workspace.
- Regiões, labels e estados live devem permanecer presentes ao alterar o visual.

As preferências leves ficam em `studyai:experience-settings` e são aplicadas como atributos `data-*` no elemento `html`.

## Responsividade

| Faixa | Comportamento principal |
| --- | --- |
| Mobile | Navegação inferior, uma ferramenta ativa do Workspace, cards roláveis e navegação de estudos recolhível |
| Tablet | Conteúdo em uma ou duas colunas, controles com scroll horizontal e dialogs adaptáveis |
| Notebook | Sidebar compactável e grids de menor densidade |
| Desktop/Ultrawide | Multipainel, grids amplos e largura máxima de conteúdo de 1560 px |

## Movimento e performance

Animações usam apenas opacity, transform e propriedades visuais curtas. Listas e painéis ocultos não devem montar conteúdo pesado. Skeletons usam uma única animação de shimmer; rolagem interna aplica `overscroll-behavior` e scrollbar discreta. Memoização deve ser usada somente em limites com renderização custosa ou props estáveis.

## Padrões por área

- **Dashboard:** continuar estudando é a ação principal; indicadores técnicos aparecem somente no modo Avançado.
- **Biblioteca:** visualizações Grade, Lista e Compacta compartilham o mesmo `MaterialCard` e persistem a preferência.
- **Tutor:** resposta do usuário e da IA têm hierarquia distinta; contexto é recolhível; ações ficam próximas à resposta.
- **Workspace:** multipainel no desktop, ferramenta ativa única no mobile; tamanhos, layout e scroll continuam persistidos.

## Checklist para novos componentes

1. Reutiliza uma primitive existente?
2. Funciona em 360 px sem overflow horizontal?
3. Possui nome acessível e foco visível?
4. Respeita Claro, Escuro e AMOLED?
5. Respeita redução de movimento e escala de fonte?
6. Possui loading, vazio e erro quando aplicável?
7. Evita montar conteúdo pesado quando oculto?
