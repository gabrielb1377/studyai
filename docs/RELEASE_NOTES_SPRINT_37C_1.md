# Release Notes — Sprint 37C.1: Academy Studio Pro

Data: 19 de outubro de 2026
Branch: `v1.1-development`

## Resumo

O Academy ganhou um **editor visual** para os materiais e apresentações gerados
pela própria Academy. O aluno abre um conteúdo, edita seções e slides,
personaliza o template, acompanha a prévia, recebe sugestões de escrita por IA
e salva o trabalho localmente, sem depender de exportação.

A exportação profissional em PDF/PPTX permanece na Sprint 37C.2: hoje o Studio
edita, personaliza e salva o documento; a exportação existente da Academy
continua disponível e inalterada.

## Recuperação do WIP

A Sprint anterior havia deixado a implementação do Studio fora do build, em
`tmp/wip-academy-studio-37C1`, por erro de sintaxe JSX. O material foi
analisado antes de qualquer alteração e o diagnóstico foi:

| Arquivo | Problema encontrado | Decisão |
| --- | --- | --- |
| `types.ts` | Válido (12 templates, 10 layouts, 10 tipos de seção) | Recuperado integralmente |
| `templates.ts` | Válido (6 templates de documento + 6 de apresentação) | Recuperado integralmente |
| `storage.ts` | Válido; identificador duplicado no `create` | Recuperado e corrigido |
| `service.ts` | Assinaturas divergentes, imports duplicados, IA fora do contrato | Reescrito sobre a lógica válida |
| `hooks/useStudioEditor.ts` | Sem undo/redo; autosave sem versionamento | Recuperado e evoluído |
| `components/*.tsx` (8 arquivos) | Tags não fechadas, `)}` extras, estrutura de função quebrada | Reescritos com JSX válido |
| `StudioEditor.tsx` / `StudioEditorPage.tsx` / `StudioPage.tsx` | `any` implícito, `useEffect` sem dependências, renderização duplicada | Reescritos |

Nenhuma funcionalidade válida foi descartada. Os tipos, os 12 templates e a
lógica de persistência do WIP foram preservados; os componentes quebrados foram
reescritos sobre o mesmo contrato de dados.

As exclusões temporárias de `tmp/` em `tsconfig.json` e `eslint.config.mjs`
foram **revertidas**: o build passa a incluir todo o código versionado sem
exceções, e o backup do WIP foi removido depois da validação.

## Entregas

1. **Editor de documentos** — título, subtítulo e descrição do documento;
   seções dos tipos título, parágrafo, lista, código, tabela, exemplo,
   exercício, resumo, diagrama e citação. Ações: adicionar, remover, duplicar,
   reordenar, desfazer, refazer, salvar e pré-visualizar. O conteúdo original
   da Academy é preservado integralmente.
2. **Editor de apresentações** — slides com capa, título e conteúdo, duas
   colunas, comparação, imagem e texto, diagrama, código, exercício, resumo e
   em branco. Adicionar, duplicar, excluir, reordenar, editar título, texto e
   notas do apresentador.
3. **Templates visuais** — 6 templates de documento (Acadêmico, Moderno,
   Minimalista, Técnico, Apostila, E-book) e 6 de apresentação (Acadêmico,
   Profissional, Moderno, Minimalista, Tecnológico, Educação).
4. **Personalização** — esquema de cores, tipografia, tamanho, espaçamento,
   orientação, cabeçalho, rodapé, numeração de páginas, capa e sumário.
5. **Pré-visualização** — documento paginado (capa, sumário e seções) e
   apresentação em proporção 16:9, com zoom, navegação entre páginas e
   simulação de viewport (mobile, tablet, desktop). A prévia reflete o
   conteúdo editado em tempo real.
6. **Assistência por IA contextual** — melhorar redação, resumir, expandir,
   simplificar, criar exemplo, gerar exercício e reorganizar. A proposta é
   exibida antes de ser aplicada; o conteúdo nunca é sobrescrito
   silenciosamente.
7. **Persistência** — store IndexedDB `studio-documents` (schema v5), autosave
   com debounce de 1,5 s, versionamento por documento e recuperação após
   reload. Nenhum documento é guardado em `localStorage`.
8. **Integrações** — "Abrir no Studio" na Academy e na Biblioteca,
   "Reabrir no Studio" e "Abrir no Workspace" na página do Studio, e deep link
   por URL (`/academy/studio?estudo=&conteudo=&tipo=`).
9. **Segurança** — sanitização de HTML e Markdown, allowlist de tags, remoção
   de handlers e URLs perigosas, limite de tamanho de entrada e validação de
   ações no Route Handler.
10. **Responsividade** — no desktop, painel lateral, editor e prévia lado a
    lado; no mobile, abas Editar/Prévia/Organizar sem overflow horizontal.

## Arquivos

Criados:

- `src/features/academy/studio/types.ts`
- `src/features/academy/studio/templates.ts`
- `src/features/academy/studio/storage.ts`
- `src/features/academy/studio/service.ts`
- `src/features/academy/studio/sanitize.ts`
- `src/features/academy/studio/StudioAssistService.ts`
- `src/features/academy/studio/StudioEditor.tsx`
- `src/features/academy/studio/StudioPage.tsx`
- `src/features/academy/studio/hooks/useStudioEditor.ts`
- `src/features/academy/studio/hooks/useStudioAssist.ts`
- `src/features/academy/studio/services/StudioAssistClient.ts`
- `src/features/academy/studio/components/StudioDocumentSidebar.tsx`
- `src/features/academy/studio/components/StudioDocumentEditor.tsx`
- `src/features/academy/studio/components/StudioPresentationEditor.tsx`
- `src/features/academy/studio/components/StudioPreviewPanel.tsx`
- `src/features/academy/studio/components/StudioTemplatesPanel.tsx`
- `src/features/academy/studio/components/StudioCustomizationPanel.tsx`
- `src/features/academy/studio/components/StudioAIPanel.tsx`
- `src/app/academy/studio/page.tsx`
- `src/app/api/academy/studio/assist/route.ts`
- `src/components/ui/textarea.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/scroll-area.tsx`
- `tests/academy-studio.spec.ts`

Modificados:

- `src/lib/storage/StorageVersion.ts` (store `studio-documents`, schema v5)
- `src/lib/storage/Database.ts` (índices do novo store)
- `src/features/sync/types.ts`, `src/features/sync/CloudSyncManager.ts`,
  `src/server/cloud/types.ts` (entidade `studio-documents` no Cloud Sync)
- `src/features/academy/components/AcademyPage.tsx` (acesso ao Studio)
- `src/features/academy/components/AcademyContentViewer.tsx` ("Abrir no Studio")
- `src/features/library/MaterialCard.tsx` ("Abrir no Studio")
- `tests/helpers/indexed-db.ts` (versão do banco derivada da fonte)

## Arquitetura

```text
Academy (conteúdo gerado)
  → /academy/studio?estudo=&conteudo=&tipo=
  → StudioPage → StudioEditor
      ├─ StudioDocumentSidebar (estrutura, templates, personalização, IA)
      ├─ StudioDocumentEditor / StudioPresentationEditor
      └─ StudioPreviewPanel
  → useStudioEditor → StudioService → StudioStorage → IndexedDB `studio-documents`

Assistência por IA
  → StudioAIPanel → StudioAssistClient
  → POST /api/academy/studio/assist (server-only)
  → StudioAssistService → AIService → ProviderManager → provider
```

O AI Core é o único caminho de geração. Não existe provider paralelo nem
chamada direta do navegador a um serviço de IA. O Route Handler aplica a
chave individual (BYOK) do usuário quando há sessão autenticada e usa o
fallback do servidor no modo visitante.

## Persistência

| Store | Conteúdo |
| --- | --- |
| `studyai-db/studio-documents` | Documentos do Studio: estrutura, slides, template, customização, versão e status. |

O schema do IndexedDB avançou de v4 para v5. O Cloud Sync ganhou a entidade
`studio-documents`, mantendo o mesmo contrato incremental das demais.

## Decisões técnicas

1. **Sem módulo paralelo** — o Studio vive em `src/features/academy/studio/`
   e reutiliza `AcademyStorage`, `AcademyService`, `AIService` e o Design
   System existente.
2. **Sem exclusões de build** — nenhuma configuração de TypeScript, ESLint ou
   Git foi alterada para esconder erros do código recuperado.
3. **Prévia honesta** — a prévia representa a estrutura e a customização, mas
   não promete fidelidade de paginação idêntica à exportação. A exportação
   profissional é a Sprint 37C.2.
4. **Proposta antes da alteração** — a IA sempre devolve uma sugestão
   separada; aplicar é uma ação explícita do aluno.
5. **Primitivas de UI mínimas** — `Textarea`, `Select` (elemento nativo, para
   acessibilidade e seletor nativo no mobile) e `ScrollArea` foram adicionadas
   ao Design System em vez de duplicar componentes.
6. **Escritas debounced** — os campos de texto livre confirmam no `blur`,
   evitando uma escrita no IndexedDB por tecla digitada.

## Limitações conhecidas

- A exportação PDF/PPTX a partir do documento editado do Studio chega na
  Sprint 37C.2.
- A paginação da prévia é lógica (capa, sumário, seções), não uma composição
  tipográfica de paginação real.
- Não há criação de template personalizado pela interface; o painel reserva o
  espaço e a ação ainda será habilitada junto da exportação.
- Sem arrastar e soltar para reordenar; a reordenação é feita por botões de
  mover, acessível por teclado.
- A assistência por IA depende de provider configurado; sem provider, o
  Editor continua totalmente funcional.

## Validação

- ESLint: 0 erros (1 warning pré-existente em `src/features/ai/providers/OllamaProvider.ts:120`).
- TypeScript: sem erros.
- Playwright: **138/138** (16,6 min) — 126 anteriores + 12 novos, sem flaky.
- Build: aprovado, 46 rotas (eram 44).
- `npm audit --omit=dev`: 7 vulnerabilidades transitivas pré-existentes
  (sharp, next, katex, source-map-js) — nenhuma nova dependência foi
  adicionada nesta Sprint.

### Testes novos (`tests/academy-studio.spec.ts`)

1. `o Studio sanitiza HTML e Markdown antes de renderizar o conteúdo`
2. `o Studio cria o documento a partir do conteúdo da Academy e o persiste`
3. `o Studio recupera o documento já salvo sem criar cópias duplicadas`
4. `o Studio edita a seção, reordena e desfaz e refaz a alteração`
5. `o Studio troca o template preservando o conteúdo original`
6. `o Studio cria apresentação e permite editar, duplicar e excluir slides`
7. `o Studio salva automaticamente e recupera o trabalho após recarregar`
8. `a Biblioteca abre o material da Academy no Studio`
9. `o Studio abre o estudo da Academy no Workspace`
10. `a assistência por IA do Studio propõe a alteração antes de aplicá-la`
11. `a prévia do Studio reflete o conteúdo editado`
12. `o Studio permanece utilizável no celular`

Nenhum cenário depende de IA externa: a rota de assistência é interceptada no
navegador.

### Correção associada

O schema do IndexedDB foi de v4 para v5. Os testes que abriam o banco com a
versão fixada (`indexedDB.open("studyai-db", 4)`) passaram a usar
`STORAGE_DATABASE_VERSION`, a mesma fonte de verdade do runtime, evitando que
a versão volte a divergir.

