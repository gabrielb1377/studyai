# Contexto do Projeto — StudyAI

Atualizado em 11 de setembro de 2026.

## Propósito

StudyAI é um workspace pessoal de estudos. A versão atual oferece extração com OCR e transcrição local, recuperação híbrida dos materiais, experiências para organizar uma rotina de estudo e uma integração inicial com Gemini.

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
| OCR local | Tesseract.js com dados em português e inglês |
| Transcrição local | Transformers.js com Whisper Tiny |
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
| `src/features/extraction` | Extração de documentos e mídia, OCR, transcrição, pipeline, persistência e status. |
| `src/features/retrieval` | Chunking, embeddings locais, buscas semântica e lexical, ranking híbrido e montagem do contexto. |
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
| `studyai:content-chunks` | Chunks versionados com proveniência, prontos para futura indexação. |
| `studyai:embeddings` | Vetores locais versionados, status e data da última indexação. |

Cada serviço valida o formato persistido antes de devolvê-lo. Valores inválidos não quebram a interface e são tratados como estado vazio.

## Fluxo de extração

```text
File selecionado
  → ExtractionPipeline
  → MediaExtractionPipeline
  → ContentExtractionService
  → OCRService, quando imagem ou PDF sem camada de texto
  → MediaTranscriptionService, quando áudio ou vídeo
  → texto + metadados
  → ContentStorage
  → ChunkService / ChunkStorage
  → EmbeddingService / EmbeddingStorage
  → Dashboard
```

PDF usa PDF.js; DOCX e PPTX são lidos como pacotes OOXML com JSZip; TXT usa a API nativa de `File`; mídia usa as APIs HTML5 e Web Audio. PNG, JPG, JPEG e WEBP passam pelo Tesseract.js. PDFs sem texto são renderizados página a página e enviados ao mesmo OCR. MP3, WAV, M4A e MP4 são convertidos para áudio mono de 16 kHz e transcritos pelo modelo `onnx-community/whisper-tiny` no navegador. O resultado segue automaticamente para chunks, embeddings e indexação. Materiais sem tema organizado recebem temporariamente `studyId: "unassigned"`.

O núcleo, o worker e os idiomas do OCR são servidos por rotas internas a partir das dependências instaladas, com cache imutável. Nenhum material do usuário passa por essas rotas. O modelo de transcrição é obtido do Hugging Face Hub no primeiro uso, armazenado no cache do navegador e executado localmente nas execuções seguintes.

## Fluxo do Tutor IA

```text
TutorWorkspace
  → useTutor / useTutorContext
  → TutorContextService
  → RetrievalService
  → SemanticSearchService + SearchService
  → RankingService
  → TutorService
  → /api/tutor
  → PromptBuilder
  → ContextAssembler
  → GeminiService
  → Gemini API
```

O `TutorContextService` seleciona o tema mais recentemente acessado e reúne `studyId`, título, matéria, status, progresso, resumo relacionado e notas do mesmo tema. O `RetrievalService` consulta somente chunks compatíveis com esse tema ou ainda marcados como `unassigned`. A recuperação combina similaridade vetorial, ranking lexical, afinidade de `studyId`, nome do arquivo e frequência dos termos, limitando o resultado aos cinco melhores trechos. O `PromptBuilder` é executado no servidor e recebe pergunta, histórico, contexto do estudo e chunks. Se os embeddings falharem, o ranking lexical permanece disponível; se não houver resultados, o fluxo continua com o contexto do estudo ou com a mensagem original.

Os embeddings usam o modelo interno `local-feature-hash-v1`, com 192 dimensões. Ele representa termos, raízes linguísticas, n-gramas e pares de palavras em um vetor normalizado. Todo o cálculo acontece no navegador, sem download de modelo, API externa ou banco vetorial. O contrato versionado permite substituir esse gerador por um modelo neural local futuramente.

## Endpoints existentes

| Endpoint | Finalidade |
| --- | --- |
| `POST /api/tutor` | Conversa contextual com Gemini. |
| `POST /api/tutor/summary` | Resumo de uma conversa. |
| `POST /api/tutor/flashcards` | Geração de flashcards JSON. |
| `POST /api/tutor/quiz` | Geração de questões JSON. |
| `GET /api/ocr/assets/[asset]` | Worker e núcleo WebAssembly locais do Tesseract.js. |
| `GET /api/ocr/languages/[language]` | Dados locais de idioma usados pelo OCR. |

Todos validam o corpo recebido e normalizam erros do `GeminiService`. Eles não recebem nem leem arquivos físicos.

## Limites conhecidos

- Biblioteca e organização ainda usam dados mockados.
- Importação não transfere nem persiste arquivos físicos; somente o resultado extraído é salvo.
- O PDF do workspace é uma demonstração local; a importação processa os arquivos escolhidos sem persistir o binário original.
- O primeiro uso da transcrição requer download do modelo Whisper; o tamanho e o tempo dependem da conexão e do dispositivo. Depois disso, o cache do navegador é reutilizado.
- A extração de áudio de MP4 e M4A depende dos codecs suportados pelo navegador. Arquivos incompatíveis recebem status de erro sem interromper os demais.
- Os embeddings atuais são linguísticos e determinísticos, não um modelo neural pré-treinado; não há banco, autenticação, cloud de processamento ou Ollama.
- O contexto do Tutor é baseado no tema acessado mais recentemente, e não em um seletor explícito de contexto.

## Qualidade

O projeto usa `strict` no TypeScript, aliases `@/*`, componentes de rota do App Router e testes Playwright para rotas, responsividade e fluxos locais principais.
