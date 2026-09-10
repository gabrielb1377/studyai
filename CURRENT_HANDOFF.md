# Handoff Atual — Sprint 16

Atualizado em 10 de setembro de 2026.

## Estado entregue

Sprint 16 concluiu uma auditoria e refatoração sem adicionar telas ou capacidades de produto.

- A persistência local foi centralizada em `src/lib/local-storage.ts`.
- Study Engine, Tutor, resumos, notas, flashcards e quiz passaram a reutilizar a mesma leitura/escrita defensiva do navegador.
- A validação do armazenamento de quizzes agora confere cada questão e resultado, não apenas a existência dos arrays.
- O Tutor deixou de gravar as conversas duas vezes após cada atualização.
- Alterações no Study Engine agora disparam uma atualização do contexto usado pelo Tutor.
- Hooks e serviços mais comprimidos foram reorganizados para facilitar manutenção.
- README, contexto do projeto e este handoff foram atualizados para refletir o estado real.

## Fluxos que devem permanecer estáveis

1. Abrir `/estudo?tema=vetores` grava ou atualiza o acesso ao tema.
2. Progresso, status, notas, flashcards e resultados de quiz permanecem no navegador.
3. O Tutor salva conversas localmente e envia contexto estruturado quando existe um tema recente.
4. Sem `GEMINI_API_KEY`, endpoints respondem com erro configurável, sem quebrar a conversa ou a interface.
5. Importação e organização são apenas fluxos simulados e não devem ser apresentados como upload real.

## Próximas sprints recomendadas

1. **Extração de conteúdo:** criar uma camada de ingestão separada dos componentes e sem conectar diretamente arquivos ao Tutor.
2. **Modelo de material normalizado:** substituir mocks por registros locais persistidos antes de introduzir busca.
3. **RAG:** somente após haver conteúdo extraído, normalizado e com proveniência.
4. **Ollama:** criar uma abstração de provider antes de oferecer a opção no cliente; nunca expor URLs, chaves ou SDKs diretamente a componentes client.

## Cuidados para continuidade

- Preserve `src/lib/local-storage.ts` como única porta de leitura/escrita para dados locais novos.
- Mantenha chamadas ao Gemini no servidor, através de Route Handlers.
- Não envie PDF, DOCX, vídeo, áudio ou qualquer arquivo físico ao Tutor. Apenas dados extraídos e estruturados podem integrar contexto futuro.
- O arquivo `src.zip` na raiz não é importado pelo projeto. Ele foi preservado nesta sprint por ser um artefato de usuário; confirmar sua finalidade antes de removê-lo.
- Execute `npm run lint`, `npm run typecheck`, `npm run test:e2e` e `npm run build` antes de entregar mudanças funcionais.
