# Release Notes — Sprint 37C.2: Academy Studio Pro — Exportação Profissional

Data: 19 de outubro de 2026
Branch: `v1.1-development`
Base: `b34e8f2` (Sprint 37C.1)

## Resumo

O Academy Studio passou a **exportar** os documentos e apresentações que ele
edita. O material salvo no Studio vira um **PDF profissional** ou um
**PowerPoint editável**, respeitando o template, as cores, a tipografia, o
espaçamento, a orientação, as margens, a capa, o cabeçalho/rodapé e a
numeração escolhidos no próprio editor.

O arquivo é gerado **no navegador** (sem servidor, sem chamada de IA), salvo
na **Biblioteca** vinculado ao documento-fonte e pode ser reaberto, editado e
exportado novamente.

A exportação da Academy (o fluxo antigo de PDF/apostila/PPTX a partir do
conteúdo gerado) continua intacta e independente.

---

## Arquitetura

```text
StudioDocument (estruturado)
  ↓
ExportDocumentModel / ExportDeckModel   (normalização determinística)
  ↓
resolveStudioTheme(customization)       (tokens compartilhados)
  ↓
StudioPdfExporter (pdf-lib)  |  StudioPptxExporter (JSZip / Open XML)
  ↓
StudioExportService
  ├─ download do artefato
  └─ Biblioteca: Material + ExtractedContent + chunks
```

O modelo canônico é a **única** entrada dos renderizadores. Nenhum
renderizador regenera conteúdo por IA e o documento-fonte nunca é alterado
durante a exportação.

### Theme tokens (fonte única de verdade)

`src/features/academy/studio/export/theme.ts` resolve cores, tipografia,
escala de tamanho, espaçamento, margens, orientação e regras de página a
partir da `StudioCustomization` do documento. A pré-visualização, o PDF e o
PPTX consomem **os mesmos** tokens — não existem três configurações de tema
paralelas.

A pré-visualização deixou de manter sua própria tabela de cores: ela passa a
consumir `studioColorSchemes`.

---

## PDF profissional

Renderizado com `pdf-lib`, já presente no projeto.

**Estrutura**

- Capa profissional (cor de destaque, título, subtítulo, autor e data).
- Sumário com números de página reais (calculados em dois passes).
- Introdução, objetivos, pré-requisitos, capítulos, seções, listas, tabelas,
  blocos de código, diagramas, exercícios, respostas (opcionais), conclusão e
  referências internas.
- Cabeçalho, rodapé e numeração conforme a configuração.

**Qualidade**

- A4 em retrato ou paisagem, com margens compacto/normal/amplo.
- Fontes legíveis (Helvetica, Times ou Courier conforme a família escolhida).
- Acentuação brasileira preservada (codificação WinAnsi).
- Paginação que evita texto cortado, títulos órfãos, tabelas partidas no
  meio e elementos fora da área útil.

**Limites**

- As fontes padrão do PDF cobrem Latin-1; caracteres fora desse conjunto são
  substituídos por `?` (com substituições explícitas para `→`, `≤`, `≥`,
  `≠`, `×` e as aspas curvas).
- A paginação é calculada pelo pdf-lib e pode diferir, em detalhes, da
  composição de um processador de textos.

---

## PowerPoint editável

Renderizado com **JSZip** e Open XML — as mesmas bibliotecas já usadas pela
exportação da Academy. Nenhuma dependência nova foi instalada.

- Cada título, parágrafo e lista é uma **caixa de texto editável**
  (`<p:sp>` + `<a:t>`), nunca uma imagem.
- Tabelas são `<a:tbl>` editáveis, com grade e células preenchíveis.
- Formas nativas (`rect`, `roundRect`) para réguas, caixas erealces.
- Notas do apresentador em `notesSlideN.xml`, com `notesMaster` e tema
  próprios.
- Diagramas entram como **fonte editável** (Mermaid) dentro de uma caixa
  monoespaçada, com aviso de que os elementos internos não são editáveis.
- 16:9 por padrão; 4:3 quando a orientação é retrato.
- Theme OOXML (`theme1.xml`) com as cores e a fonte do template.

**Layouts suportados** (os 10 já existentes no Studio): capa, título e
conteúdo, duas colunas, comparação, imagem e texto, diagrama, código,
exercício, resumo e em branco.

---

## Fidelidade da pré-visualização

- Novo botão **"Pré-visualizar exportação"** alterna a prévia entre a
  visualização de fluxo e a simulação da página exportada (A4, margens,
  cabeçalho/rodapé, numeração e escala real).
- A prévia usa os mesmos tokens do exportador e informa explicitamente que a
  paginação final do PDF pode diferir levemente do navegador.
- Zoom, navegação entre páginas e viewport simulado (mobile/tablet/desktop)
  foram preservados.

---

## Biblioteca e Workspace

- O material exportado entra na Biblioteca com o identificador estável
  `studio-export-{documento}-{formato}`: **reexportar substitui** o artefato
  anterior em vez de duplicá-lo.
- O material carrega `academyStudioDocumentId`, permitindo **"Reabrir no
  Studio"** a partir do card da Biblioteca.
- Materiais PPTX/DOCX recebem a ação **"Baixar original"** no leitor do
  Workspace; a lack de pré-visualização nativa do PowerPoint é informada de
  forma explícita, com o texto extraído disponível.
- O material exportado participa do mesmo indexamento por texto e chunks da
  Biblioteca.

---

## Segurança e desempenho

- O conteúdo exportado já passa por `sanitize.ts` (allowlist de tags, remoção
  de `script`/handlers, bloqueio de `javascript:` e `data:` perigosos).
- O Markdown é sanitizado novamente na etapa de normalização do modelo.
- Nome de arquivo normalizado (`studioFileStem`): apenas `[a-z0-9-]`, sem
  caminhos, sem acentos e com tamanho limitado.
- Limites aplicados antes da geração: 400 seções, 200 slides e 1 000 000
  caracteres, com mensagem clara ao aluno.
- A geração é 100% client-side: nenhum cálculo pesado no servidor, nenhum
  material enviado a serviço externo, nenhuma chave de API envolvida.
- Exports simultâneos são bloqueados pela interface enquanto um está em
  andamento.

---

## Arquivos

**Criados**

- `src/features/academy/studio/export/theme.ts`
- `src/features/academy/studio/export/model.ts`
- `src/features/academy/studio/export/pdf.ts`
- `src/features/academy/studio/export/pptx.ts`
- `src/features/academy/studio/export/service.ts`
- `src/features/academy/studio/components/StudioExportPanel.tsx`
- `tests/academy-studio-export.spec.ts`
- `tests/helpers/pdf-text.ts`
- `scripts/qa-studio-export.mjs`

**Modificados**

- `src/features/academy/studio/types.ts` (`StudioExportRecord`, `pageMargins`)
- `src/features/academy/studio/templates.ts`, `service.ts`, `hooks/useStudioEditor.ts`
- `src/features/academy/studio/StudioEditor.tsx` (aba Exportar)
- `src/features/academy/studio/components/StudioPreviewPanel.tsx` (theme compartilhado e modo de exportação)
- `src/features/academy/studio/components/StudioCustomizationPanel.tsx` (margens)
- `src/features/library/MaterialCard.tsx` ("Reabrir no Studio")
- `src/features/study/MaterialViewer.tsx` (download do original)
- `src/features/study/StudyWorkspace.tsx`, `src/types/study.ts` (`fileType`)
- `src/types/material.ts` (`academyStudioDocumentId`)
- `tests/helpers/indexed-db.ts` (store inexistente devolve lista vazia)

---

## Dependências

**Nenhuma dependência nova.** A exportação usa `pdf-lib` e `jszip`, já
presentes no projeto. `pptxgenjs` foi avaliado e **descartado**: as duas
bibliotecas existentes cobrem o pacote Open XML com controle total sobre
tabelas, notas e shapes.

---

## Validação

- ESLint: 0 erros (1 warning pré-existente em `src/features/ai/providers/OllamaProvider.ts:120`).
- TypeScript: sem erros.
- Playwright: **153/153** (19,2 min) — 138 anteriores + 15 novos; 152 passaram
  diretamente e 1 flaky (`lab.spec.ts`) passou no retry.
- Build: aprovado, 46 rotas. A rota `/academy/studio` ficou com 34 kB (189 kB de
  First Load) porque `pdf-lib` e `jszip` são carregados sob demanda.
- `npm audit --omit=dev`: 7 vulnerabilidades transitivas pré-existentes
  (sharp, next, katex, source-map-js) — nenhuma nova dependência foi
  adicionada nesta Sprint.
- `git diff --check`: sem problemas de whitespace.

### Testes novos (`tests/academy-studio-export.spec.ts`)

1. PDF do Studio é válido, estruturado e preserva título, acentos, tabelas e código
2. PDF aplica o template, a orientação e as margens escolhidas no Studio
3. PPTX do Studio é um pacote Open XML válido com elementos editáveis
4. PPTX mantém notas do apresentador e o tema aplicado
5. Exportação salva o artefato na Biblioteca e permite reabrir a fonte no Studio
6. Reexportar após edição substitui o artefato sem duplicar materiais
7. A Biblioteca oferece o retorno ao Studio e o material exportado
8. O material exportado abre no Workspace e pode ser baixado
9. PDF de documento longo pagina sem perder o conteúdo final
10. PPTX preserva tabelas editáveis e elementos dentro da área do slide
11. A exportação não mistura dados entre identidades
12. A prévia permite simular a página exportada
13. A exportação de apresentação registra o material PPTX sem duplicar
14. Erro de exportação é exibido sem travar a interface
15. A exportação permanece utilizável no celular

Nenhum cenário depende de IA externa. As fixtures são determinísticas e
semeadas diretamente no IndexedDB. O helper `tests/helpers/pdf-text.ts` extrai
o texto dos fluxos de conteúdo comprimidos do PDF, permitindo validar acentos,
tabelas e código sem renderização gráfica.

---

## QA visual

O script `scripts/qa-studio-export.mjs` gera os arquivos de exemplo
(apostila técnica extensa, apresentação de 14 slides e documento com
tabelas, código e acentuação), salva os artefatos em `test-results/qa-37c2/` e
captura a prévia e o leitor de PDF do próprio StudyAI para inspeção.

**Limitação registrada**: o ambiente não possui LibreOffice, PowerPoint ou
Poppler, portanto o PPTX não pode ser renderizado para inspeção visual. A
validação do PPTX é estrutural (OOXML, shapes, tabelas, notas, coordenadas
dentro da área do slide). O PDF é conferido visualmente pelo leitor de PDF do
próprio StudyAI.

---

## Limitações conhecidas

| Limitação | Impacto |
|-----------|---------|
| Sem renderização visual do PPTX no ambiente | Validado estruturalmente |
| Fontes do PDF limitadas a Latin-1 | Caracteres fora do conjunto viram `?` |
| Diagramas entram como fonte editável | Elementos internos não são editáveis |
| Sem pré-visualização nativa de PPTX na Biblioteca | Texto extraído e download disponíveis |
| Sem imagens embutidas a partir do Studio | Campo de imagem reservado no schema |
| Exportação não regenera conteúdo por IA | O exportado é exatamente o que está no editor |
