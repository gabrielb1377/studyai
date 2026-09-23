# Auditoria e estabilização — Sprint 32.5

**Data:** 23 de setembro de 2026  
**Projeto auditado:** StudyAI V2, estado após Sprint 32  
**Resultado:** 92 cenários Playwright aprovados; nenhum defeito P0 conhecido. Existem riscos P1 registrados no backlog, então a auditoria não considera a release pronta para exposição pública sem tratá-los.

## Escopo e método

Foram percorridas as rotas, módulos, serviços, persistência local e cloud, integrações de IA, configuração multiplataforma e documentação. A suíte completa cobriu os fluxos de importação, extração, OCR, transcrição, indexação, estudo, Mentor, Tutor, Cloud Sync, conflitos, backup, Workspace, responsividade e restauração.

Foram executados ESLint, TypeScript, build Next.js e Playwright. Também foi feito health check real dos quatro providers configurados. Não foram enviados materiais do usuário nem prompts de estudo aos providers. A análise de segurança é revisão de código e dependências; não é um pentest independente.

O arquivo `AGENTS.md` não existe na raiz auditada. A documentação principal usada como contexto foi README, PROJECT_CONTEXT, CURRENT_HANDOFF e PRODUCTION.

## Resumo executivo

| Área | Estado observado |
| --- | --- |
| Aplicação e rotas | 10 páginas e 27 Route Handlers; build e rotas principais aprovados. |
| Módulos | 27 módulos de feature, com fronteiras principais entre UI, serviços, persistência local e server. |
| Persistência | 13 object stores IndexedDB; escopo distinto para convidado e cada usuário autenticado. |
| Cloud | Testada por Playwright em backend de desenvolvimento em memória; PostgreSQL e S3 não estavam provisionados neste host. |
| IA | Gemini, Groq e OpenRouter responderam ao health check; Ollama estava offline. Geração real não foi executada nesta auditoria. |
| UX e responsividade | Rotas testadas sem overflow em 360, 390, 768, 1024, 1366, 1440 e 2560 px. |
| Testes | 92 cenários Playwright em 18 arquivos de especificação; não existe relatório de cobertura por linha/branch. |
| Segurança | CSP, cookies protegidos, CSRF, validação e isolamento por userId presentes; quatro vulnerabilidades altas transitivas seguem abertas. |

## Fluxos exercitados

| Fluxo | Evidência e resultado |
| --- | --- |
| Importar → extrair → Study → chunks → embeddings | PDF, DOCX, PPTX e TXT cobertos por testes de importação e integração; aprovado. |
| OCR | Teste local com imagem real reconhecida e indexada; aprovado. |
| Áudio → transcrição | Teste local do runtime de transcrição; aprovado no dispositivo de teste. |
| Knowledge Graph → Tutor | Parser, persistência, expansão semântica e contexto usados pelo Tutor; aprovado. |
| Mentor → aprendizagem → flashcards/quiz | Sessão, correção, recomendações e persistência exercitadas; aprovado. |
| Workspace | Layout, painéis, restauração, PDF Pro, Wiki, atalhos e drag/drop; aprovado. |
| Cloud Sync entre contextos | Cadastro em dois contextos, sync incremental, conflito e resolução; aprovado no backend de teste em memória. |
| Exclusão em outro dispositivo | Documento e binário OPFS removidos após tombstone remoto; corrigido e coberto por teste. |
| Backup e restauração | Snapshot de registros restaurado no IndexedDB local após sync; aprovado. Binários não fazem parte do snapshot; ver pendência P1. |
| Reimportação após restauração | Metadado preservado com binário local ausente; arquivo reimportado no mesmo id, sem duplicar registro; corrigido e aprovado. |

## Defeitos encontrados e corrigidos

1. **Binário OPFS órfão após exclusão remota:** ao receber tombstone de documento, Cloud Sync removia o registro IndexedDB, mas não o arquivo OPFS nem sua referência no manifesto. Agora remove os dois caches e a referência ao manifesto; há teste entre dois contextos de navegador.
2. **Reimportação bloqueada para documento sem binário local:** a deduplicação rejeitava o arquivo usando a identidade do registro mesmo quando o OPFS estava vazio. A importação agora detecta essa recuperação e reusa o id existente; teste confirma que só permanece um registro.
3. **Helpers de teste ignoravam o banco por conta:** o helper de leitura abria somente `studyai-db` de convidado. Agora resolve o banco segundo `studyai:storage-scope`, permitindo verificar restauração autenticada corretamente.
4. **Endpoint de telemetria sem limite de corpo e com rate limit baseado em id controlado pelo cliente:** agora limita o corpo a 4 KiB, rejeita JSON inválido com 400 e escolhe o endereço fornecido pelo proxy confiável para o rate limit. Teste cobre corpo excessivo e formato inválido.
5. **Matriz de viewport incompleta:** foram acrescentados 390, 1366 e 2560 px à verificação de rotas.

## Performance medida

Medição local em Chromium headless após build, uma execução sequencial das rotas, no host desta auditoria. Os números são referência de laboratório e não SLO: o servidor foi iniciado com `next start` apesar do aviso de output standalone, as navegações seguintes reutilizaram processo/cache e a medida `transferSize` corresponde ao documento principal, não ao total de recursos.

| Rota | DOMContentLoaded | load | Documento transferido |
| --- | ---: | ---: | ---: |
| Dashboard `/` | 76 ms | 212 ms | 56.042 B |
| Biblioteca | 56 ms | 184 ms | 52.926 B |
| Estudo | 48 ms | 100 ms | 36.894 B |
| Tutor | 47 ms | 100 ms | 43.004 B |
| Configurações | 50 ms | 112 ms | 55.771 B |

O heap reportado por `performance.memory` ficou próximo de 11,9 MB nas cinco rotas. Houve uma long task de 53 ms no primeiro carregamento; nenhuma nas navegações seguintes. Esses valores não incluem toda a memória nativa do Chromium nem o processo Next.js. CPU de sistema, RSS do servidor e cold start não foram isolados nesta medição.

Nos testes E2E, OCR levou cerca de 10,2 s e transcrição de áudio cerca de 27,7 s por cenário completo, incluindo seleção e navegação. Não são tempos puros dos motores. Retrieval, busca, sync e Tutor não possuem hoje métricas individuais estáveis de ponta a ponta; seus tempos nos testes contêm setup e espera de UI.

## Providers verificados

Health check real do servidor, 23/09/2026. Ele consultou disponibilidade/modelos e não gerou texto:

| Provider | Resultado | Latência observada | Modelos listados |
| --- | --- | ---: | ---: |
| Gemini | Online | 443 ms | 1 |
| Groq | Online | 357 ms | 11 |
| OpenRouter | Online | 296 ms | 458 |
| Ollama | Offline | 13 ms | 0 |

Retry, timeout, cache, modo manual/automático e streaming têm cobertura por implementação e testes locais/mockados; não foram submetidos a falhas de rede ou geração real com todos os provedores. Há modelos sem chave local para Ollama. O endpoint health também não é evidência de qualidade/resposta de modelo.

## Banco, arquivos e consistência

- IndexedDB usa 13 stores: `documents`, `contents`, `chunks`, `embeddings`, `studies`, `notes`, `summaries`, `flashcards`, `quizzes`, `transcriptions`, `ocr`, `knowledge` e `metadata`.
- A abertura por identidade usa `studyai-db:guest` ou `studyai-db:user-{id}`; os testes confirmam alternância entre os escopos.
- OPFS é cache local de binários. Exclusão recebida remotamente agora remove o arquivo cacheado.
- Sync mantém tombstones por entidade e usa versão-base para conflitos. A suíte confirmou conflito e escolhas de versão.
- PostgreSQL/S3 não estavam conectados nesta máquina. Os fluxos cloud automatizados usam o fallback de memória do servidor, portanto não validam transações, permissão IAM, criptografia ou lifecycle do bucket real.
- Backups atuais copiam `sync_records` e não bytes do Object Storage. Para recuperar um binário removido, é preciso ter o arquivo original e reimportá-lo; a recuperação local por identidade foi testada. Backup integral restaurável de documentos grandes é pendência P1.
- Não houve acesso a uma instalação/conta de produção; não foi possível verificar dados reais órfãos ou duplicados no servidor.

## Segurança

Revisados: `requireUser`, CSRF em operações mutáveis, escopo por `userId` nas queries de arquivos, sessão/refresh, rate limit, CSP, limites de payload do sync, validação de mensagens e contratos do telemetria. A API de arquivos é autenticada e o nome é codificado para `Content-Disposition`.

**Pendência P1:** `npm audit --omit=dev` reporta quatro vulnerabilidades altas transitivas por `@huggingface/transformers` → `onnxruntime-node`/`adm-zip` e `sharp` (Zip Slip/alocação excessiva em ZIP e advisories libvips/libheif). O `npm audit fix --dry-run` foi bloqueado pelo ambiente ao tentar buscar pacotes remotos (`EALLOWREMOTE`), então nenhuma atualização incompleta foi gravada. O risco permanece no pipeline de ML e exige atualização com testes OCR/Whisper/embeddings.

Não foi executado pentest, fuzzing de endpoints, análise dinâmica de dependências ou auditoria de IAM, porque não havia infraestrutura de produção provisionada.

## UI, acessibilidade e plataformas

- Sem overflow horizontal nas sete larguras solicitadas para Dashboard, Biblioteca, Estudo, Tutor, Importar, Organizar e Configurações.
- Foram revistos foco de teclado, retorno de foco, labels acessíveis, navegação mobile e o atalho `Ctrl+K` por E2E.
- PWA/service worker e contratos de Electron/Capacitor têm testes automatizados. Android APK e instalador Windows têm validação documentada na Sprint 31. iOS requer macOS/Xcode.
- Docker não está instalado; Compose, Caddy, Postgres e MinIO passaram apenas por verificações estáticas de contrato.

## Qualidade e cobertura

ESLint, `tsc --noEmit`, `next build` e `npm run test:e2e` foram executados. A suíte final contém **92 cenários aprovados** em 18 especificações Playwright. Não existe provider de cobertura de linhas/branches configurado; a cobertura aqui reportada é por fluxo, não percentual de código.

## Documentos relacionados

- [Inventário do projeto](./INVENTARIO_PROJETO.md)
- [Arquitetura, APIs e fluxos](./ARQUITETURA_E_FLUXOS.md)
- [Backlog priorizado](./BACKLOG_SPRINT_32_5.md)
