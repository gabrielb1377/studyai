# StudyAI

Workspace pessoal de estudos que organiza materiais importados e reúne ferramentas de aprendizagem com apoio de IA.

## Sobre o projeto

O StudyAI busca reduzir a fragmentação entre materiais de estudo, consulta contextual e revisão. O aplicativo processa materiais localmente, organiza os dados por estudo e oferece um Workspace com Tutor, resumos, flashcards, quizzes e notas.

## Principais funcionalidades

- Importação de PDF, DOCX, PPTX, TXT, imagens, áudio e vídeo, com extração de texto, OCR ou transcrição conforme o formato suportado.
- Organização automática de estudos e identificação de tópicos a partir do conteúdo extraído.
- Biblioteca e Workspace com visualização de materiais, notas, resumos, flashcards, quizzes e sessões de estudo.
- Tutor integrado a recuperação lexical e busca vetorial local sobre o material indexado.
- Modo Professor adaptativo com níveis, métodos de ensino, aula guiada, planos, exercícios, diagramas Mermaid e explicação contextual de trechos selecionados.
- Providers de IA selecionáveis: Gemini, Ollama, OpenRouter e Groq, com modo automático, verificação de disponibilidade e fallback.
- Persistência local e suporte a sincronização, conta, colaboração e execução em web, PWA, Electron e projetos Capacitor.

## Tecnologias

| Área | Tecnologias confirmadas |
| --- | --- |
| Frontend | Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, Zustand, Radix UI e Lucide React |
| Backend/API | Route Handlers do Next.js, Node.js e PostgreSQL via `pg` |
| IA e processamento | Providers via `fetch`; Transformers.js/Whisper para transcrição local; Tesseract.js para OCR; recuperação lexical e vetores locais |
| Dados e arquivos | IndexedDB, OPFS, PostgreSQL e armazenamento S3 compatível via AWS SDK |
| Testes | Playwright (testes end-to-end) |
| Infraestrutura e plataformas | Docker/Compose, Caddy, GitHub Actions, Electron, PWA e Capacitor para Android/iOS |

## Arquitetura

```text
Interface (Next.js)
  ├─ Importação → extração/OCR/transcrição → estudos e índice local
  ├─ Tutor e ferramentas → recuperação de contexto → AIClient
  │                                        ↓
  │                              Route Handlers internos
  │                                        ↓
  │                        AIService → ProviderManager → provider
  └─ StorageManager → IndexedDB/OPFS
                         ↓ (conta e sincronização configuradas)
                  API de sincronização → PostgreSQL/S3 compatível
```

As features consomem serviços de domínio. O acesso do navegador a IA passa pelas rotas internas; providers e `AIService` são módulos exclusivos do servidor. `StorageManager` centraliza a persistência local, e o pipeline de importação produz conteúdo indexável antes que o Tutor recupere trechos relevantes.

## Desafios técnicos

1. **Orquestrar materiais heterogêneos e falhas por arquivo.** O pipeline coordena extração por formato, normalização, OCR para imagens e PDFs sem camada de texto, transcrição local de áudio/vídeo, geração do Study e indexação. Etapas e erros ficam associados ao material para que a falha de um arquivo não encerre o lote. Evidências: [`ExtractionPipeline.ts`](src/features/extraction/ExtractionPipeline.ts), [`MediaExtractionPipeline.ts`](src/features/extraction/MediaExtractionPipeline.ts) e [`OCRService.ts`](src/features/extraction/OCRService.ts).
2. **Isolar integrações de IA e permitir troca de provider.** A camada do servidor concentra seleção, verificação de disponibilidade, streaming, cache e fallback; o cliente chama endpoints internos em vez de importar providers. Evidências: [`AIService.ts`](src/features/ai/AIService.ts), [`ProviderManager.ts`](src/features/ai/ProviderManager.ts), [`AIClient.ts`](src/features/ai/AIClient.ts) e [`src/app/api/ai`](src/app/api/ai).
3. **Manter busca e persistência local para materiais grandes.** O `StorageManager` encapsula operações transacionais do IndexedDB; a recuperação combina ranking lexical com vetores locais e retorna ao lexical se a etapa vetorial falhar. Evidências: [`StorageManager.ts`](src/lib/storage/StorageManager.ts), [`RetrievalService.ts`](src/features/retrieval/RetrievalService.ts) e [`SemanticSearchService.ts`](src/features/retrieval/SemanticSearchService.ts).

## Executando localmente

Requer Node.js 22 (versão usada no workflow de CI) e npm.

```bash
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Acesse `http://localhost:3000`. Preencha somente as credenciais dos serviços que pretende usar em `.env.local`; não versione esse arquivo. Gemini, OpenRouter e Groq dependem de credenciais configuradas no servidor. Ollama requer uma instância local acessível. Para o backend de sincronização/armazenamento, consulte [`PRODUCTION.md`](PRODUCTION.md) e o [`docker-compose.yml`](docker-compose.yml); os valores padrão locais do Compose não são adequados para produção e devem ser substituídos.

## Testes e verificações

Os scripts disponíveis no `package.json`:

```bash
npm run lint
npm run typecheck
npm run test:e2e
npm run build
```

`test:e2e` executa a suíte Playwright em Chromium.

## Status

Projeto pessoal em desenvolvimento contínuo. Algumas integrações exigem configuração externa; a presença de suporte no código não significa que serviços de produção estejam provisionados.

## Autor

[Gabriel Brito](https://github.com/gabrielb1377) · Ciência da Computação

Repositório: [github.com/gabrielb1377/studyai](https://github.com/gabrielb1377/studyai)
