# StudyAI

Workspace pessoal de estudos. A V2 inclui a fundação, a Biblioteca e a experiência local simulada de importação, com navegação responsiva e aparência clara/escura.

## Executar

Requisitos: Node.js 22 ou superior e npm.

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. Para produção:

```bash
npm run build
npm start
```

## Escopo entregue

| Área          | Estado nesta sprint                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Dashboard     | Saudação, continuar estudando, importar material, últimos temas e progresso semanal. Dados explicitamente demonstrativos. |
| Biblioteca    | Dez materiais fictícios, pesquisa local, filtros por formato/favoritos e estados vazio, carregando e erro.                |
| Importar      | Seleção múltipla, drag and drop, remoção e progresso simulado para seis formatos.                                         |
| Estudo        | Estado inicial, com título do tema demonstrativo selecionado.                                                             |
| Configurações | Tema claro, escuro ou do sistema.                                                                                         |
| Header        | Pesquisa de páginas, alternância de tema e menu pessoal.                                                                  |
| Sidebar       | Cinco destinos, com overlay em telas menores que 1024px.                                                                  |

Os botões de importação do Dashboard e da Biblioteca levam à rota `/importar`. Ela lê somente os metadados básicos dos arquivos escolhidos para montar uma lista temporária no estado React. Nenhum arquivo é enviado, persistido ou analisado. IA, upload real, extração, organização, banco, autenticação, API, IndexedDB, Ollama e visualização de PDF não fazem parte das sprints entregues.

## Estrutura

```text
src/
├── app/                  # App Router: páginas, layout e estados globais
│   ├── biblioteca/
│   ├── configuracoes/
│   ├── importar/
│   └── estudo/
├── components/
│   ├── layout/           # Sidebar, Header, pesquisa e tema
│   └── ui/               # Nove componentes shadcn/ui
├── features/
│   ├── dashboard/        # Cards e dados demonstrativos centralizados
│   ├── import/           # Seleção local e processamento simulado
│   ├── library/          # Biblioteca, filtros, cards e estados
│   └── settings/         # Aparência
├── hooks/                # Estado transitório do menu com Zustand
├── lib/                  # Navegação, utilitário de classes e mock/materials.ts
├── services/             # Reservado; sem serviços nesta sprint
├── styles/               # Tokens, temas e estilos globais
└── types/                # Tipos compartilhados
tests/                    # Verificação das rotas e interações
```

As páginas são Server Components por padrão. A Biblioteca recebe os mocks pela página e utiliza uma fronteira client para a pesquisa e os filtros; seus cards não possuem estado próprio. Zustand mantém apenas o estado do menu; `next-themes` salva exclusivamente a aparência no localStorage. Dados de estudo não são persistidos.

## Design System

Componentes locais gerados pelo CLI oficial shadcn/ui: `Button`, `Card`, `Input`, `Badge`, `Dialog`, `DropdownMenu`, `Tooltip` e `Tabs`. Os componentes compostos usam Radix para teclado, foco e semântica.

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

<Card>
  <CardContent>
    <Button variant="outline">Uma ação</Button>
  </CardContent>
</Card>;
```

Reutilize os tokens semânticos `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border` e `text-primary`. Suas cores e raios são definidos em `src/styles/globals.css`. Novos componentes podem ser adicionados com `npx shadcn@latest add <componente>`; mantenha o utilitário `cn` em `@/lib/utils`.

Layouts usam grids flexíveis, navegação móvel, foco visível e animações curtas que respeitam `prefers-reduced-motion`. A fonte usa a pilha do sistema, sem downloads externos.

## Verificação

```bash
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes de navegador cobrem as quatro rotas em 360, 768, 1024 e 1440px, overflow horizontal, menu móvel, pesquisa, teclado, tema persistido e diálogo de importação. Screenshots ficam em `test-results/`, ignorado pelo Git.

Para usar o Microsoft Edge instalado no Windows, sem baixar outro navegador:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
npm run test:e2e
```

Next.js permanece na versão 15 solicitada. O override de PostCSS em `package.json` atualiza a dependência transitiva vulnerável da versão 15; o build deve ser validado ao alterar esse override.

## Próxima etapa

Conectar a primeira funcionalidade real de estudo mediante nova sprint. Reutilizar este layout e os componentes existentes, mantendo os dados demonstrativos isolados até sua substituição.

Referências: [Next.js App Router](https://nextjs.org/docs/app/getting-started), [shadcn/ui CLI](https://ui.shadcn.com/docs/cli).

## Arquivos da Sprint 1

Validação executada nesta entrega: `npm run lint`, `npm run typecheck` e `npm run build` passaram sem erros. `npm run dev` iniciou e serviu as quatro rotas. Os seis testes Playwright passaram no Microsoft Edge, com revisão das capturas clara/escura e responsivas. A auditoria npm retornou zero vulnerabilidades. A verificação responsiva foi realizada em viewports emulados; não inclui dispositivos físicos.

Arquivos existentes modificados: `README.md` (documentação) e `.gitignore` (artefatos dos testes). `LICENSE` foi preservado. Nenhum arquivo foi removido.

Arquivos criados:

```text
.prettierignore
components.json
eslint.config.mjs
next-env.d.ts
package.json
package-lock.json
playwright.config.ts
postcss.config.mjs
tsconfig.json
src/app/layout.tsx
src/app/page.tsx
src/app/loading.tsx
src/app/error.tsx
src/app/not-found.tsx
src/app/biblioteca/page.tsx
src/app/estudo/page.tsx
src/app/configuracoes/page.tsx
src/components/providers.tsx
src/components/page-heading.tsx
src/components/empty-state.tsx
src/components/layout/app-shell.tsx
src/components/layout/header.tsx
src/components/layout/sidebar.tsx
src/components/layout/search-dialog.tsx
src/components/layout/theme-toggle.tsx
src/components/ui/button.tsx
src/components/ui/card.tsx
src/components/ui/input.tsx
src/components/ui/badge.tsx
src/components/ui/dialog.tsx
src/components/ui/dropdown-menu.tsx
src/components/ui/tooltip.tsx
src/components/ui/tabs.tsx
src/features/dashboard/data.ts
src/features/dashboard/continue-studying.tsx
src/features/dashboard/import-material.tsx
src/features/dashboard/recent-topics.tsx
src/features/dashboard/weekly-progress.tsx
src/features/settings/appearance-settings.tsx
src/hooks/use-layout-store.ts
src/lib/navigation.ts
src/lib/utils.ts
src/services/.gitkeep
src/styles/globals.css
src/types/study.ts
tests/foundation.spec.ts
```

## Sprint 2 — Biblioteca

A rota `/biblioteca` usa o layout e o Design System da Sprint 1. Não houve alterações no Header global, na Sidebar, no Dashboard ou nos tokens visuais, nem adição de dependências.

- `src/lib/mock/materials.ts` contém dez registros fictícios: quatro PDFs, dois vídeos, dois áudios e dois slides. Quatro são favoritos de exemplo.
- `src/types/material.ts` define o contrato de um material e os filtros permitidos. Nenhum registro contém arquivo físico ou URL de download.
- `LibraryBrowser` mantém somente pesquisa e filtro em estado local. A busca combina palavras, ignora acentos/maiúsculas e inclui nome, curso, semestre, matéria e tema. Os filtros de formato e favoritos combinam com a pesquisa.
- `MaterialCard` é reutilizável e mostra todos os campos de organização, tipo, favorito e última atualização. Os cards são informativos, sem abertura ou reprodução de arquivos. As datas são formatadas em UTC para renderização consistente.
- `LibraryHeader` e `ImportMaterialButton` são reutilizados nos estados da rota.
- `LibraryStates` diferencia biblioteca vazia de busca sem resultados; a segunda permite limpar pesquisa e filtros. O estado vazio exibe “Você ainda não possui materiais.” e o botão visual “Importar primeiro material”.
- `loading.tsx` e `error.tsx` usam as convenções do App Router. Os mocks são síncronos: não existem atrasos ou falhas artificiais. O skeleton será exibido quando a navegação suspender; a tela de erro oferece nova tentativa quando ocorrer uma falha na rota.

Arquivos criados:

```text
src/types/material.ts
src/lib/mock/materials.ts
src/features/library/ImportMaterialButton.tsx
src/features/library/LibraryHeader.tsx
src/features/library/LibraryBrowser.tsx
src/features/library/MaterialCard.tsx
src/features/library/LibraryStates.tsx
src/features/library/material-utils.ts
src/app/biblioteca/loading.tsx
src/app/biblioteca/error.tsx
tests/library.spec.ts
```

Arquivos modificados: `src/app/biblioteca/page.tsx` (composição da Biblioteca), `tests/foundation.spec.ts` (expectativas da página e capturas responsivas) e `README.md` (documentação). Nenhum arquivo removido.

Os testes específicos cobrem pesquisa, combinação de filtros, favoritos, teclado, dados do card e acesso à importação. As capturas responsivas são salvas em `test-results/library-<largura>.png` e `test-results/library-dark.png`.

Os estados sem dados, carregando e erro também foram verificados em um cenário temporário no navegador, incluindo o callback de nova tentativa. O cenário de verificação foi retirado antes do build e não cria uma rota no produto.

Validação final da Sprint 2: `npm run lint`, `npm run typecheck` e `npm run build` concluídos sem erros; nove testes Playwright aprovados no Microsoft Edge. `npm run dev` serviu a Biblioteca com HTTP 200. A responsividade foi verificada em viewports emulados de 360, 768, 1024 e 1440px, além dos temas claro e escuro. Não foram testados dispositivos físicos. Foram criados 11 arquivos e modificados três nesta sprint; nenhuma dependência foi adicionada.

## Sprint 3 — Importação

A rota `/importar` aceita PDF, DOCX, PPTX, TXT, MP4 e MP3 por seleção múltipla ou drag and drop. Arquivos incompatíveis e repetidos são ignorados com feedback visível. Cada item exibe nome, formato, tamanho, status, progresso e ação de remoção.

Ao escolher “Importar”, um temporizador local atualiza as barras e os estados de “Arquivo enviado” para “Processando...” e “Concluído”. O fluxo não usa `fetch`, `FormData`, Route Handler ou serviço remoto. Sair ou recarregar a página descarta a seleção.

Arquivos criados:

```text
src/app/importar/page.tsx
src/app/importar/loading.tsx
src/features/import/DropZone.tsx
src/features/import/ImportFileCard.tsx
src/features/import/ImportProgress.tsx
src/features/import/ImportWorkspace.tsx
src/features/import/import-utils.ts
src/features/import/useImport.ts
src/types/import.ts
src/components/ui/progress.tsx
tests/import.spec.ts
```

Arquivos modificados: `src/lib/navigation.ts`, `src/components/layout/sidebar.tsx`, `src/features/dashboard/import-material.tsx`, `src/features/library/ImportMaterialButton.tsx`, `src/features/library/LibraryStates.tsx`, `tests/foundation.spec.ts`, `tests/library.spec.ts`, `package.json`, `package-lock.json` e `README.md`. O `Progress` usa o Radix já instalado, sem nova dependência final. Nenhum arquivo foi removido.

Validação final da Sprint 3: `npm run lint`, `npm run typecheck` e `npm run build` concluídos sem erros; os 12 testes Playwright foram aprovados. O fluxo foi validado com seleção, remoção, drag and drop, bloqueio de duplicatas, progresso simulado e confirmação de que nenhuma requisição de upload é disparada. A responsividade foi verificada em viewports emulados de 360, 768, 1024 e 1440px. Não foram testados dispositivos físicos.

## Sprint 4 — Organização

A rota `/organizar` apresenta uma árvore de materiais mockados agrupada por curso, semestre e matéria. Cada arquivo mostra ícone, nome, tipo e tamanho, com ações locais para renomear, mover e excluir. Nenhuma alteração é persistida.

O botão “Finalizar organização” navega para `/biblioteca`. A rota também está disponível na navegação principal.

Arquivos criados: `src/app/organizar/page.tsx`, `src/app/organizar/loading.tsx`, `src/features/organization/OrganizationWorkspace.tsx`, `src/features/organization/OrganizationTree.tsx`, `src/features/organization/OrganizationFileItem.tsx`, `src/lib/mock/organization.ts`, `src/types/organization.ts` e `tests/organization.spec.ts`.

Arquivos modificados: `src/lib/navigation.ts`, `src/components/layout/sidebar.tsx`, `tests/foundation.spec.ts` e `README.md`. Nenhum arquivo foi removido.

Validação final da Sprint 4: `npm run lint`, `npm run typecheck` e `npm run build` concluídos sem erros. A suíte Playwright aprovou a árvore, as ações locais, o redirecionamento para a Biblioteca e a responsividade em viewports emulados de 360, 768, 1024 e 1440px. Não foram testados dispositivos físicos.

## Sprint 5 — Estudo

A rota `/estudo` agora é o workspace principal do tema. O cabeçalho apresenta breadcrumb, matéria, tema e retorno ao Dashboard. As abas Material, IA e Estudar mantêm interfaces mockadas e responsivas, sem acessar materiais físicos ou serviços externos.

Arquivos criados: `src/lib/mock/study-workspace.ts`, `src/features/study/StudyHeader.tsx`, `src/features/study/MaterialTab.tsx`, `src/features/study/AiTab.tsx`, `src/features/study/StudyToolsTab.tsx`, `src/features/study/StudyWorkspace.tsx` e `tests/study.spec.ts`.

Arquivos modificados: `src/app/estudo/page.tsx`, `src/types/study.ts` e `README.md`. Nenhum arquivo foi removido.

Validação final da Sprint 5: `npm run lint`, `npm run typecheck` e `npm run build` concluídos sem erros. Os testes Playwright validaram as abas, o material mockado, a interface do tutor, as ações rápidas, os cards de estudo, o retorno e a responsividade mobile. Não foram testados dispositivos físicos.

## Sprint 6 — Visualizador de Material

A aba Material agora possui um visualizador por tipo. PDFs usam `react-pdf` com worker local, zoom, página atual e navegação. Vídeos e áudios usam elementos HTML5; arquivos TXT são exibidos em uma prévia monoespaçada. A lista lateral permite alternar entre os quatro materiais mockados, e os controles anterior/próximo percorrem a sequência.

Arquivos criados: `src/features/study/MaterialViewer.tsx` e `src/features/study/PdfMaterialViewer.tsx`.

Arquivos modificados: `src/features/study/MaterialTab.tsx`, `src/lib/mock/study-workspace.ts`, `src/types/study.ts`, `tests/study.spec.ts`, `package.json`, `package-lock.json` e `README.md`. A dependência `react-pdf@9.2.1` foi adicionada; não há upload, banco ou API.
