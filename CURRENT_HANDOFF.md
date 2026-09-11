# Handoff Atual — Sprint 20

Atualizado em 11 de setembro de 2026.

## Estado entregue

O pipeline de extração agora reconhece texto em imagens e PDFs escaneados, além de transcrever áudio e a faixa de áudio de vídeos compatíveis. Todo o resultado continua alimentando o RAG local já existente.

```text
ImportWorkspace
  → useImport
  → ExtractionPipeline
  → MediaExtractionPipeline
      → ContentExtractionService
      → OCRService
      → MediaTranscriptionService
  → ContentStorage
  → ChunkService / ChunkStorage
  → EmbeddingService / EmbeddingStorage
  → RetrievalService
  → Tutor contextual
```

## OCR

- PNG, JPG, JPEG e WEBP são reconhecidos com Tesseract.js.
- PDFs sem camada de texto são renderizados página a página com PDF.js antes do OCR.
- Os idiomas `por` e `eng`, o worker e o núcleo WebAssembly vêm das dependências instaladas e são servidos por rotas internas com cache.
- Os arquivos do usuário nunca são enviados às rotas de OCR.
- O resultado registra confiança, quantidade de páginas, dimensões e tempo de processamento.

## Transcrição

- MP3, WAV e M4A são decodificados pelas APIs Web Audio.
- MP4 preserva os metadados de vídeo e tenta decodificar sua faixa de áudio pelo mesmo fluxo.
- O áudio é normalizado para mono em 16 kHz.
- `onnx-community/whisper-tiny` roda via Transformers.js e ONNX Runtime Web em precisão `fp32`.
- O modelo é baixado no primeiro uso, armazenado no cache do navegador e reutilizado depois.
- O resultado registra duração, modelo utilizado e tempo de processamento.

## Pipeline e persistência

`ExtractionPipeline` permanece como orquestrador único. Ele persiste `processing`, `extracted` ou `error`, substitui os chunks daquele conteúdo e sincroniza o índice semântico. Uma falha em um arquivo não interrompe os demais.

Novos metadados em `studyai:extracted-content`:

```text
ocrPerformed
ocrConfidence
transcriptionPerformed
transcriptionModel
processingTimeMs
```

## Dashboard

O resumo de extração mostra:

- status consolidado;
- quantidade de OCRs concluídos;
- quantidade de transcrições concluídas;
- tempo acumulado de processamento;
- extraídos, processando e erros.

## Validação automatizada

- OCR real de PNG.
- OCR real de PDF composto apenas por imagem.
- Geração de chunks e embeddings a partir do texto reconhecido.
- Inicialização e inferência reais do Whisper com um WAV válido.
- Aceitação dos novos formatos de imagem e áudio.
- Dashboard com estatísticas da Sprint 20.

## Limites atuais

- A primeira transcrição exige acesso ao Hugging Face Hub para obter o modelo; não há upload do áudio nem inferência remota.
- A compatibilidade de MP4/M4A depende dos codecs que o navegador consegue decodificar.
- OCR e transcrição usam CPU/WASM e podem ser lentos em dispositivos modestos.
- Arquivos físicos continuam efêmeros; somente os resultados estruturados são persistidos.
- Não há banco, Ollama ou serviço cloud de processamento.
- `npm audit --omit=dev` aponta quatro alertas altos transitivos em `onnxruntime-node` e `sharp`, trazidos pelo Transformers.js e sem correção disponível. A aplicação importa o runtime de navegador/WASM, mas o alerta permanece no grafo instalado e deve ser reavaliado quando o pacote publicar uma atualização.

## Próximo passo seguro

Mover OCR e transcrição para Web Workers dedicados com fila e cancelamento por arquivo, mantendo os mesmos contratos. Para distribuição totalmente offline, empacotar também os pesos do Whisper como ativos locais versionados.

## Comandos de validação

```text
npm run lint
npm run typecheck
npm run test:e2e
npm run build
```
