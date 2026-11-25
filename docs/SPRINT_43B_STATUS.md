# Sprint 43B — OCR e revisão de exercícios

Branch `v1.1-development`, base `d3e575d3bc77f14f2da390a113699b38daac089f`. Alterações locais.

## Pipeline

A fila existente valida extensão e agora rejeita PDFs acima de 150 MiB e imagens acima de 40 MiB antes de calcular o hash e gravar o arquivo. O OPFS guarda o binário original. Texto, diagnóstico e correções continuam nos registros existentes do IndexedDB.

PDF.js inspeciona cada página. O motor existente usa texto selecionável quando adequado e rasteriza somente páginas que precisam de OCR no modo automático. O limite é de 300 páginas por documento e 80 páginas de OCR por execução, em sequência. O Tesseract.js carrega assets e idiomas português/inglês servidos pela aplicação. PNG, JPEG e WebP são aceitos pelo pipeline. O tratamento de PDF libera o documento após falhas de abertura, explica a proteção por senha e libera recursos ao terminar a inspeção de cada página. O cancelamento interrompe a espera pelo resultado de reconhecimento.

Na Biblioteca, abra **Revisar** e compare o editor com a página original. A prévia procura enunciados numerados e alternativas consecutivas A–E, quando presentes. A indicação de página e linhas acompanha a estrutura detectada. Casos ambíguos continuam editáveis como texto bruto. A detecção de fórmulas e símbolos é heurística, sem reconstrução de frações, matrizes ou gabarito. Layout em colunas e alternativas na mesma linha podem exigir correção manual.

**Confirmar texto e abrir Tutor** prepara um rascunho editável com a fonte e a página. O rascunho fica em memória, expira após um minuto enquanto aguarda navegação e é descartado na troca de sessão. O botão **Enviar** dispara o fluxo existente do Tutor, com Smart Routing, quota e fallback consentido. A recuperação de IA exclui arquivos com páginas pendentes de revisão, inclusive em PDFs mistos, para evitar misturar material revisado e incerto. A busca local continua disponível.

## Validação

- A rodada relacionada executou 46 casos (44 passaram, 2 falharam). O teste de recuperação usava o diretório OPFS anterior ao isolamento por sessão. O teste de revisão passou a aguardar a rota e revelou que a leitura do rascunho podia ser repetida na montagem do Tutor. O teste do OPFS passou a verificar o diretório da sessão offline, e o Tutor passou a consumir o rascunho uma vez por sessão.
- A rodada focada de sete casos teve cinco aprovações, incluindo cancelamento com o original byte a byte e diagnóstico de PDF corrompido sem carregamento de OCR. A última repetição focada aprovou os dois casos que ainda falhavam.
- Total de 48 casos distintos aprovados na sua última execução, sem falhas restantes ou skips do runner. O teste de transcrição de áudio foi excluído por escopo. Não houve matriz única de 48 casos.
- OCR real no Chromium processou PNG, JPEG, PDF escaneado e PDF misto no mesmo teste, dentro do prazo de 150 s da fila. A primeira página do PDF misto permaneceu nativa e apenas a segunda passou pelo OCR. Não foi medido tempo isolado por formato. O Tutor usou resposta simulada.
- Fotos inclinadas, contraste irregular, WebP, PDF com senha e precisão matemática em material real ainda precisam de amostras próprias. O cenário de cancelamento comprova a resposta da interface e preservação do original, sem medir tempo de encerramento de um worker sob carga.
- Typecheck, lint, build de produção e `git diff --check` aprovados. O lint manteve 50 avisos preexistentes e zero erros.

## Arquivos

- Importação e OCR: `src/features/import/useImport.ts`, `src/features/extraction/OCRService.ts`, `src/features/ocr/pdf.ts`.
- Revisão: `src/features/ocr/exercise-review.ts`, `src/features/ocr/components/ExtractionReviewPanel.tsx`.
- Tutor e contexto: `src/features/tutor/TutorWorkspace.tsx`, `src/features/tutor/services/ReviewedTutorDraft.ts`, `src/features/tutor/services/TutorContextService.ts`, `src/features/ai/RetrievalPipeline.ts`.
- Testes: `tests/import.spec.ts`, `tests/sprint43b-exercise-review.spec.ts`.
- Documentação: `CURRENT_HANDOFF.md`, `docs/NEXT_SESSION_PROMPT.md`, este relatório.
