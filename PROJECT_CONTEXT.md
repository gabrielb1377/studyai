# Contexto do Projeto — StudyAI

Atualizado em 10 de setembro de 2026.

## Propósito

StudyAI é um workspace pessoal de estudos. A versão atual oferece extração local de materiais, experiências para organizar uma rotina de estudo e uma integração inicial com Gemini. A aplicação ainda não possui recuperação semântica de conhecimento.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Aplicação | Next.js 15 com App Router |
| Interface | React 19, TypeScript e Tailwind CSS 4 |
| Componentes base | shadcn/ui, Radix UI e Lucide |
| Estado de layout | Zustand |
| Tema | next-themes |
| Material PDF mockado | react-pdf |
| Documentos OOXML | JSZip |
| Testes de interface | Playwright |

## Estrutura de módulos

| Local | Responsabilidade |
| --- | --- |
| `src/app` | Páginas, estados de rota e endpoints internos. |
| `src/components/layout` | Shell, Header, Sidebar, busca global de páginas e tema. |
| `src/components/ui` | Primitivos visuais reutilizáveis. |
| `src/features/dashboard` | Painel inicial e indicadores. |
| `src/features/study` | Workspace de um tema e Study Engine. |
| `src/features/tutor` | Conversas, contexto, prompt e comunicação com o Tutor. |
| `src/features/{flashcards,quiz,notes,summaries}` | Recursos persistidos por tema. |
| `src/features/{library,import,organization}` | Fluxos mockados de materiais. |
| `src/features/extraction` | Extração, pipeline, persistência e status de conteúdo. |
| `src/lib/local-storage.ts` | Leitura, escrita e remoção tipadas do `localStorage`. |
| `src/types` | Tipos de domínio compartilhados. |

## Persistência local

Não existe banco de dados. As chaves atuais são:

| Chave | Conteúdo |
| --- | --- |
| `studyai:study-engine` | Progresso e último acesso de cada tema. |
| `studyai:tutor-conversations` | Conversas e mensagens do Tutor. |
| `studyai:summaries` | Resumos gerados e, opcionalmente, seu `studyId`. |
| `studyai:flashcards` | Flashcards e métricas de revisão. |
| `studyai:quizzes` | Questões geradas e resultados. |
| `studyai:notes` | Notas em Markdown básico. |
| `studyai-theme` | Preferência visual. |
| `studyai:extracted-content` | Texto, metadados e status produzidos pelo pipeline. |

Cada serviço valida o formato persistido antes de devolvê-lo. Valores inválidos não quebram a interface e são tratados como estado vazio.

## Fluxo de extração

```text
File selecionado
  → ExtractionPipeline
  → ContentExtractionService
  → texto + metadados
  → ContentStorage
  → Dashboard
```

PDF usa PDF.js; DOCX e PPTX são lidos como pacotes OOXML com JSZip; TXT usa a API nativa de `File`; MP3 e MP4 usam `loadedmetadata` dos elementos HTML5. Áudio e vídeo ainda não produzem transcrição. Materiais sem tema organizado recebem temporariamente `studyId: "unassigned"`.

## Fluxo do Tutor IA

```text
TutorWorkspace
  → useTutor / useTutorContext
  → TutorContextService
  → TutorService
  → /api/tutor
  → PromptBuilder
  → GeminiService
  → Gemini API
```

O `TutorContextService` seleciona o tema mais recentemente acessado e reúne `studyId`, título, matéria, status, progresso, resumo relacionado e notas do mesmo tema. O `PromptBuilder` é executado no servidor. Se não houver contexto, a mensagem segue sem alteração.

## Endpoints existentes

| Endpoint | Finalidade |
| --- | --- |
| `POST /api/tutor` | Conversa contextual com Gemini. |
| `POST /api/tutor/summary` | Resumo de uma conversa. |
| `POST /api/tutor/flashcards` | Geração de flashcards JSON. |
| `POST /api/tutor/quiz` | Geração de questões JSON. |

Todos validam o corpo recebido e normalizam erros do `GeminiService`. Eles não recebem nem leem arquivos físicos.

## Limites conhecidos

- Biblioteca e organização ainda usam dados mockados.
- Importação não transfere nem persiste arquivos físicos; somente o resultado extraído é salvo.
- O PDF é uma demonstração local; vídeos e áudios não possuem fonte real.
- Não há RAG, embeddings, OCR, transcrição, banco, autenticação, cloud ou Ollama.
- O contexto do Tutor é baseado no tema acessado mais recentemente, e não em um seletor explícito de contexto.

## Qualidade

O projeto usa `strict` no TypeScript, aliases `@/*`, componentes de rota do App Router e testes Playwright para rotas, responsividade e fluxos locais principais.
