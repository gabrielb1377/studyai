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
| Tipografia | `Inter` (SIL OFL 1.1, self-hosted via `next/font/google`, `display: "swap"`, `adjustFontFallback: true`, OpenType `cv02/cv03/cv04/cv11`) com fallback nativo do sistema; escala semântica com piso de `12px` (`0.75rem`) |

### Escala tipográfica e contraste WCAG 2.2 AA (QU-2)

- **Decisão tipográfica (Q-01)**: Adotada a família `Inter` via `next/font/google` (sem nova dependência npm, self-hosted em `/_next/static/media`, compatível com CSP `font-src 'self' data:` e uso offline/PWA).
- **Escala semântica (Q-03)**: Piso mínimo de `0.75rem` (`12px` na escala padrão) via classes `.type-eyebrow`, `.type-caption`, `.type-label`, `.type-supporting`, `.type-body`, `.type-subtitle`, `.type-section-title` e `.type-page-title`. Evitar textos abaixo de `12px` (`text-[9px]`–`text-[11px]`).
- **Auditoria de contraste calculada (WCAG 2.2 AA >= 4.50:1 para texto normal)**:
  - **Claro (`:root`)**: `--foreground` (`#252b28`) sobre `--background`/`--card` = `13.75:1` / `14.43:1`; `--muted-foreground` ajustado de `#68716a` (`4.45:1` em `--secondary`, abaixo de AA) para `#5a645d` (`5.86:1` em `--background`, `6.15:1` em `--card`, `5.51:1` em `--muted`, `5.42:1` em `--secondary`, `5.59:1` em `--sidebar`); `--primary` (`#29664d`) = `6.45:1`–`6.77:1`; `--destructive` (`#bc3636`) = `5.38:1`–`5.65:1`; feedbacks semânticos = `7.09:1`–`8.19:1`.
  - **Escuro (`.dark`)**: `--foreground` = `13.24:1`–`14.58:1`; `--muted-foreground` (`#a0ada3`) = `5.44:1`–`7.48:1`; `--primary` (`#a0c9a9`) = `8.06:1`–`9.49:1`; `--destructive` (`#fa8b8b`) = `6.89:1`–`7.58:1`; feedbacks = `9.49:1`–`10.05:1`.
  - **AMOLED (`.amoled`)**: `--foreground` = `17.86:1`–`19.08:1`; `--muted-foreground` (`#a9b4ac`) = `8.42:1`–`9.81:1`; `--primary` (`#a8dab6`) = `11.92:1`–`13.37:1`; `--destructive` (`#ff9494`) = `9.28:1`–`9.92:1`; feedbacks = `12.09:1`–`12.91:1`.

Os temas suportados são Claro, Escuro, AMOLED e Sistema. O tema AMOLED usa preto real nas superfícies principais sem perder bordas, foco ou contraste semântico.

## Primitives

Componentes reutilizáveis ficam em `src/components/ui`. Telas não devem recriar Button, Card, Input, Badge, Progress, Tabs, Dialog, Dropdown, Tooltip ou Skeleton. Estados vazios devem usar `src/components/empty-state.tsx`; cabeçalhos de páginas usam `src/components/page-heading.tsx`.

Desde a Sprint 37C.1, o conjunto inclui também `Textarea`, `Select` e `ScrollArea`. O `Select` usa o elemento `<select>` nativo do navegador — mantenha essa escolha: o seletor nativo é mais acessível em dispositivos móveis e preserva a navegação por teclado do sistema.

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
