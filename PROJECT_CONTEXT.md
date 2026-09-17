# Contexto do Projeto — StudyAI

Atualizado em 16 de setembro de 2026.

## Propósito

StudyAI é um workspace pessoal de estudos. A versão atual oferece extração com OCR e transcrição local, recuperação híbrida dos materiais, experiências para organizar uma rotina de estudo e integrações funcionais com Gemini e Ollama.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Aplicação | Next.js 15 com App Router |
| Interface | React 19, TypeScript e Tailwind CSS 4 |
| Componentes base | shadcn/ui, Radix UI e Lucide |
| Estado de layout | Zustand |
| Tema | next-themes |
| Visualização de PDF importado | react-pdf |
| Documentos OOXML | JSZip |
| OCR local | Tesseract.js com dados em português e inglês |
| Transcrição local | Transformers.js com Whisper Tiny |
| Testes de interface | Playwright |
| Persistência local | IndexedDB nativo, banco `studyai-db` v1 |

## Estrutura de módulos

| Local | Responsabilidade |
| --- | --- |
| `src/app` | Páginas, estados de rota e endpoints internos. |
| `src/components/layout` | Shell, Header, Sidebar, busca global de páginas e tema. |
| `src/components/ui` | Primitivos visuais reutilizáveis. |
| `src/features/dashboard` | Painel inicial e indicadores. |
| `src/features/study` | Workspace de um tema e Study Engine. |
| `src/features/study-generator` | Análise estrutural local e criação automática de matérias, temas, subtemas e metadados de estudo. |
| `src/features/ai` | AIService, contrato de providers, seleção, prompts, contexto, retrieval e erros. |
| `src/features/tutor` | Conversas, persistência e interface do Tutor. |
| `src/features/{flashcards,quiz,notes,summaries}` | Recursos persistidos por tema. |
| `src/features/{library,import,organization}` | Registro, consulta e organização dos materiais importados. |
| `src/services/material-service.ts` | Fonte persistida dos metadados reais de materiais. |
| `src/services/material-runtime-store.ts` | Referências efêmeras aos arquivos físicos durante a sessão. |
| `src/features/extraction` | Extração de documentos e mídia, OCR, transcrição, pipeline, persistência e status. |
| `src/features/retrieval` | Chunking, embeddings locais, buscas semântica e lexical, ranking híbrido e montagem do contexto. |
| `src/lib/storage` | Banco IndexedDB, migrações, transações, paginação, erros e diagnóstico. |
| `src/types` | Tipos de domínio compartilhados. |

## Persistência local

O Storage V2 usa um único banco IndexedDB chamado `studyai-db`, versão 1. Nenhuma feature acessa o IndexedDB diretamente; todos os acessos passam por `StorageManager`.

| Object Store | Conteúdo |
| --- | --- |
| `documents` | Arquivos importados, status, progresso e organização. |
| `contents` | Texto, seções, metadados e logs de extração. |
| `chunks` | Trechos normalizados com proveniência. |
| `embeddings` | Vetores Int8/Base64 relacionados pelo `chunkId`. |
| `studies` | Estudos e progresso do Study Engine. |
| `notes`, `summaries`, `flashcards` | Recursos relacionados ao `studyId`. |
| `quizzes` | Questões e resultados identificados pelo campo `kind`. |
| `transcriptions`, `ocr` | Resultados pesados separados por arquivo e estudo. |
| `metadata` | Estado de migração, índice semântico e conversas do Tutor. |

`StorageManager` oferece get, getAll, upsert, escrita em lote, substituição atômica, transações, paginação e diagnóstico. Falhas de quota e indisponibilidade são normalizadas em mensagens amigáveis. Transações abortadas executam rollback nativo.

Na primeira abertura, `Migration` verifica as chaves legadas, grava tudo em uma única transação e remove o legado somente depois do commit. Assim, uma falha nunca apaga a fonte anterior. O `localStorage` permanece somente para preferências leves: tema, provider/configurações de IA, idioma, sidebar, workspace e última tela. A rota interna `/storage` mostra versão, contagens, espaço estimado e data da migração.

## Fluxo de extração

```text
File selecionado
  → MaterialService / MaterialRuntimeStore
  → StorageManager / documents
  → inferência de matéria e tema pelo caminho relativo
  → StudyEngine
  → ExtractionPipeline
  → MediaExtractionPipeline
  → ContentExtractionService
  → OCRService, quando imagem ou PDF sem camada de texto
  → MediaTranscriptionService, quando áudio ou vídeo
  → TextNormalizationService
  → StudyAnalyzer
  → SubjectDetector + TopicDetector + KeywordExtractor + ReadingTimeCalculator
  → StudyGeneratorService
  → matéria + tema + subtemas + capítulos + prévia + metadados
  → ContentStorage / contents / transcriptions / ocr
  → ChunkService / ChunkStorage / chunks
  → EmbeddingService / EmbeddingStorage / embeddings
  → Biblioteca / Organização / Dashboard / Workspace / Tutor
```

PDF usa PDF.js; DOCX e PPTX são lidos como pacotes OOXML com JSZip; TXT detecta UTF-8, UTF-16LE, UTF-16BE e Latin1/Windows-1252; mídia usa as APIs HTML5 e Web Audio. PNG, JPG, JPEG e WEBP passam pelo Tesseract.js. PDFs com qualquer camada de texto ignoram OCR; somente PDFs sem texto são renderizados página a página e enviados ao OCR. MP3, WAV, M4A e MP4 são convertidos para áudio mono de 16 kHz e transcritos pelo modelo `onnx-community/whisper-tiny` no navegador. A transcrição é persistida em segmentos com timestamps e capítulos de até cinco minutos.

`TextNormalizationService` corrige Unicode, hifenização entre linhas, controles inválidos, espaços, listas e parágrafos antes de qualquer chunk ou embedding. `StudyAnalyzer` coordena detectores pequenos e puros para identificar título, disciplina, tema, subtemas, capítulos, palavras-chave, idioma, total de palavras, tempo estimado de leitura e resumo inicial. `DocumentAnalyzer` permanece apenas como fachada compatível para a transcrição existente. O `StudyGeneratorService` persiste o resultado no documento, no material e no Study Engine; uma organização manual posterior mantém o destino escolhido e transporta todos os metadados estruturados para o novo `studyId`.

O `TopicDetector` reconhece a estrutura comum dos PDFs da Estácio pelos marcadores `OBJETIVOS`, `INTRODUÇÃO`, `UNIDADE`, `CAPÍTULO`, `SEÇÃO`, `ATIVIDADES`, `EXERCÍCIOS`, `CONCLUSÃO` e `REFERÊNCIAS`. Cada ocorrência gera um capítulo/seção tipado e ordenado, com página ou slide quando essa proveniência está disponível. Documentos sem identificação confiável recebem `Disciplina desconhecida`, `Tema desconhecido` ou um título derivado do arquivo; mesmo nesses casos, o Study básico é criado e o pipeline continua.

Cada documento mantém os estágios `document`, `extraction`, `ocr`, `normalization`, `analysis`, `study`, `chunks`, `embeddings` e `indexed`, além de um log cronológico. A etapa `study` registra documento analisado, tema criado, capítulos encontrados e Study criado ou atualizado. Erros registram arquivo, etapa, motivo, stack simplificada e ação sugerida. O Dashboard exibe o pipeline dos documentos mais recentes.

Todo material recebe um `studyId` antes da extração. Quando existe caminho relativo, os dois últimos diretórios representam matéria e tema; hierarquias maiores também preservam curso e semestre quando disponíveis. Arquivos avulsos usam o nome real do arquivo como tema. Materiais da mesma matéria e tema compartilham um Study. O mesmo `studyId` acompanha conteúdo, chunks, embeddings, resumos, flashcards, quizzes e notas.

O núcleo, o worker e os idiomas do OCR são servidos por rotas internas a partir das dependências instaladas, com cache imutável. Nenhum material do usuário passa por essas rotas. O modelo de transcrição é obtido do Hugging Face Hub no primeiro uso, armazenado no cache do navegador e executado localmente nas execuções seguintes.

## Fluxo do Tutor IA

```text
TutorWorkspace
  → useTutor / useTutorContext
  → TutorContextService
  → RetrievalPipeline
  → SemanticSearchService + SearchService
  → RankingService
  → TutorService
  → AIClient
  → /api/tutor
  → PromptBuilder
  → ContextBuilder
  → AIService
  → ProviderManager
  → ProviderRegistry / HealthService / LatencyService
  → AIProvider
  → GeminiProvider | OllamaProvider
  → Gemini API | Ollama local
```

O `TutorContextService` seleciona o tema mais recentemente acessado e reúne `studyId`, título, matéria, status, progresso, resumo relacionado e notas do mesmo tema. O `RetrievalPipeline` é a entrada única do AI Core para o RAG e consulta exclusivamente os chunks vinculados ao estudo quando há contexto. A recuperação combina similaridade vetorial, ranking lexical, afinidade de `studyId`, nome do arquivo e frequência dos termos, limitando o resultado aos cinco melhores trechos. `PromptBuilder` e `ContextBuilder` são executados no servidor. Tutor, resumo, flashcards e quiz usam o mesmo `AIService`; nenhuma feature conhece a implementação Gemini.

`AIProvider` define o contrato comum. `GeminiProvider` e `OllamaProvider` são funcionais; OpenRouter e Groq permanecem stubs seguros. `ProviderRegistry` é o único catálogo server-only, `HealthService` mantém verificações recentes em cache e `LatencyService` mede health e geração. `ProviderManager` resolve a seleção, registra tentativas e executa fallback na ordem Ollama, Gemini, Groq e OpenRouter. No modo automático, providers online são ordenados pela menor latência antes da cadeia de fallback.

O modo, provider preferencial e modelos escolhidos em Configurações são enviados às rotas internas pelo `AIClient`. O Ollama consulta dinamicamente `/api/tags`, verifica `/api/version` e `/api/ps`, e conversa por `/api/chat`, com timeout, cancelamento e suporte a resposta completa ou NDJSON. O navegador nunca acessa o processo local diretamente. Logs e métricas ficam em um singleton efêmero do processo servidor, limitado às 200 tentativas mais recentes. O Dashboard consulta somente o endpoint agregado do Manager para mostrar provider atual, modelo e métricas de uso.

Sem `GEMINI_API_KEY`, os endpoints retornam uma resposta controlada e a interface exibe: `Configure GEMINI_API_KEY em .env.local para utilizar o Tutor IA.` Nenhuma mensagem artificial é criada para substituir o provedor.

Os embeddings usam o modelo interno `local-feature-hash-v1`, com 192 dimensões. Ele representa termos, raízes linguísticas, n-gramas e pares de palavras em um vetor normalizado. Os vetores são quantizados para Int8 e persistidos em Base64 no formato V2, reduzindo substancialmente a pressão sobre a quota do navegador; dados V1 são migrados em memória na próxima sincronização. Todo o cálculo acontece no navegador, sem download de modelo, API externa ou banco vetorial.

## Endpoints existentes

| Endpoint | Finalidade |
| --- | --- |
| `POST /api/tutor` | Conversa contextual pelo provider selecionado. |
| `POST /api/tutor/summary` | Resumo baseado no contexto e nos chunks reais de um estudo. |
| `POST /api/tutor/flashcards` | Flashcards gerados somente de chunks reais. |
| `POST /api/tutor/quiz` | Questões geradas somente de chunks reais. |
| `GET /api/ai/providers/[provider]` | Disponibilidade, versão, latência e modelos do provider pelo AI Core. |
| `GET /api/ai/manager` | Health agregado, métricas de geração e logs recentes dos providers. |
| `GET /api/ocr/assets/[asset]` | Worker e núcleo WebAssembly locais do Tesseract.js. |
| `GET /api/ocr/languages/[language]` | Dados locais de idioma usados pelo OCR. |

Todos validam o corpo recebido e normalizam erros do AI Core. Eles não recebem nem leem arquivos físicos.

## Limites conhecidos

- Importação não transfere nem persiste os binários físicos; metadados, organização e resultados extraídos são salvos no IndexedDB.
- O binário original fica disponível somente durante a sessão atual. Após recarregar, o conteúdo extraído permanece, mas o arquivo precisa ser selecionado novamente para reprodução ou visualização binária.
- O primeiro uso da transcrição requer download do modelo Whisper; o tamanho e o tempo dependem da conexão e do dispositivo. Depois disso, o cache do navegador é reutilizado.
- A extração de áudio de MP4 e M4A depende dos codecs suportados pelo navegador. Arquivos incompatíveis recebem status de erro sem interromper os demais.
- Os embeddings atuais são linguísticos e determinísticos, não um modelo neural pré-treinado; não há banco, autenticação ou cloud de processamento.
- O Ollama precisa estar em execução no endereço configurado por `OLLAMA_URL` e possuir ao menos um modelo instalado.
- O contexto do Tutor é baseado no tema acessado mais recentemente, e não em um seletor explícito de contexto.
- A detecção de estrutura é heurística e local. Ela reconhece marcadores e vocabulário conhecidos, mas não substitui a edição manual quando o documento usa títulos ambíguos.

## Qualidade

O projeto usa `strict` no TypeScript, aliases `@/*`, componentes de rota do App Router e testes Playwright para rotas, responsividade e fluxos locais principais.
