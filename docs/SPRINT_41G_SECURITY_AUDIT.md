# Sprint 41G — auditoria de isolamento e prova

## Sprint 41G.1 — andamento parcial

**Incompleta: não usar a troca de contas como fronteira de segurança.** A geração do banco local agora muda a cada troca de escopo. Operações que aguardam a inicialização e a abertura do IndexedDB são rejeitadas se a geração mudar, inclusive em A → B → A. Ao detectar a mudança em uma transação, o resultado é rejeitado e tenta-se abortar a transação, mas não há garantia de reversão de uma transação já concluída. Isso não protege dados persistidos contra scripts da mesma origem. Testes simulados verificam esses casos sem gravar registros.

Permanecem abertos: transição de autenticação e múltiplas abas, sincronizações e uploads em andamento, respostas atrasadas, limpeza de caches e estado, conteúdo em localStorage, bancos IndexedDB antigos, OPFS e Cache Storage. O escopo não prova propriedade ou confidencialidade. Antes de remover qualquer conteúdo, definir recuperação explícita e preservação de alterações offline ainda não sincronizadas; não atribuir dados legados sem dono à conta ativa. A migração legada ainda pode ocorrer automaticamente no banco de visitante e não é um fluxo de recuperação com consentimento.

`/sync` usa a identidade dos cookies no servidor, mas isso não vincula a requisição à identidade que iniciou a fila: uma troca de cookies durante processamento assíncrono ainda pode levar dados à conta errada. A auditoria de ownership em todas as APIs e os testes cruzados não foram concluídos. A correção da prova protegida pertence à Sprint 41G.2 e não foi alterada.

Validação desta etapa: `typecheck` passou; `lint` passou com 69 avisos existentes. Playwright com módulos simulados: 6 aprovados, 0 falhos e 0 ignorados na última execução (3 corridas e 3 migração). A primeira execução teve duas falhas no próprio matcher, corrigidas na repetição. O build de uma cópia sem arquivos de ambiente falhou na resolução das fontes KaTeX pelo caminho da junção Windows para dependências em outra unidade; WSL não está instalado. O teste de navegador foi tentado em servidor isolado, mas a mesma falha impediu a aplicação de iniciar. Não houve testes com serviços reais. Faltam testes reais de navegador desktop/celular, API entre contas, sincronizações simultâneas, conflitos, exclusões e recuperação explícita.

**Status: incompleta.** Não considerar esta versão segura para avaliações sigilosas ou troca de contas no mesmo navegador. Esta auditoria e os testes locais não acessam produção.

## Inventário e achados

- `localStorage` inclui planos (`studyai:exams`), configurações de IA, perfil acadêmico e preferências de experiência, workspace/posição/respostas, notas por painel, opções do Professor e aulas, seleção de biblioteca, áudio, laboratório de qualidade e editor Studio. Essas chaves são compartilhadas na origem e não são uma fronteira de segurança por usuário. A sincronização coleta prefixos de preferências para `workspace:preferences`.
- Nenhuma utilização direta de `sessionStorage` foi encontrada na busca por código de aplicação. Isso não prova ausência em dependências ou no navegador.
- O IndexedDB tem nomes por escopo de usuário e guarda documentos, estudos, notas, resumos, flashcards, quizzes, histórico e metadados. Nomes por conta impedem uso acidental por componentes, mas scripts na mesma origem podem acessá-los; não equivalem a autorização ou criptografia.
- O OPFS mantém binários em `studyai-materials`, diretório compartilhado entre contas. Os IDs não são controle de acesso. A recuperação, migração e isolamento de binários existentes ainda precisam ser desenhados sem perda de dados.
- `MaterialRuntimeStore` mantinha arquivos e URLs de objeto em memória entre trocas de escopo. Agora limpa e revoga esses URLs quando `StorageManager.setUserScope` efetivamente altera o escopo; outros caches, componentes e tarefas em andamento precisam de auditoria e invalidação abrangentes.
- Cache Storage inclui `studyai-shared-v1` para compartilhamento de arquivos, além dos caches gerenciados por `CacheManager` e service worker. Avaliar retenção, arquivos pendentes, escopo de conta e limpeza sem perda; não presumir que todos são públicos ou que logout os limpa.
- `CloudSyncManager` tem fila, manifesto e estado em IndexedDB e processos assíncronos em variáveis de módulo. Ao trocar de conta, operações pendentes podem continuar após a sessão/cookies ou banco ativo mudar. A separação dos registros no backend por `user.sub` não elimina essa corrida no cliente. A aplicação agora restringe chaves de preferências recebidas aos prefixos previstos e a valores texto, mas isso **não** isola contas nem cancela sincronizações.
- As rotas `/sync` e `/api/files/[id]` usam a identidade autenticada; esse fato, isoladamente, não comprova todos os cenários de autorização, nem foi verificado contra produção.

## Migração e dados existentes

`Migration.run()` anteriormente lia chaves legadas sem dono e as importava para o banco ativo, inclusive de usuário autenticado; então removia as chaves. Agora bancos autenticados registram a versão de migração sem importar ou remover esse conteúdo. O banco de visitante pode recuperar os registros legados existentes; a migração só remove as chaves após a transação local. Se o nome do banco mudar durante a leitura inicial, a migração falha antes de gravar. Isso é uma contenção parcial: a recuperação de dados sem dono ainda não tem fluxo explícito de identificação/consentimento e não deve ser atribuída automaticamente à próxima conta. Uma verificação isolada não cobre todas as corridas de transações e abas.

## Gabarito e necessidade de backend

`/api/tutor/quiz` devolve `correctAnswer` e `explanation` em cada questão. `QuizService` persiste esses campos localmente e `QuizWorkspace` corrige a prova no navegador. Logo, ocultar a explicação na interface não protege o gabarito. O modo existente foi identificado na interface como local e sem sigilo; a proteção por tentativa vinculada ao usuário, armazenamento seguro no servidor, correção transacional, idempotência e limite de tentativas **ainda não foi implementada**. Não usar o modo local como avaliação protegida.

Para concluir, projetar armazenamento no servidor que não fique disponível por `/sync`, migração explícita e separada, associação à identidade autenticada, verificações de autorização, expiração, limites, submissão atômica e testes de concorrência/idempotência. Preservar o modo prática e documentar a opção offline sem garantia de sigilo. Não criar tabelas em requisições ou migrar produção automaticamente.

## Riscos abertos e próximos testes

1. Reproduzir e corrigir A → B → A sem expor `localStorage`, sem perda e sem atribuição automática dos dados legados. Prefixos por usuário não protegem contra scripts da mesma origem; definir quais dados podem permanecer no dispositivo.
2. Impedir que qualquer envio, resposta, arquivo ou evento de sincronização iniciados por A sejam aplicados sob B, inclusive mudança de cookie, reload e múltiplas abas. Validar identidade também no backend.
3. Limpar e invalidar estados React, caches e handles em logout/troca; resolver OPFS e Cache Storage sem apagar dados irrecuperáveis.
4. Implementar e testar tentativas protegidas: payload inicial sem gabarito, acesso cruzado negado, submissão concorrente/duplicada, correção no servidor e desktop/celular.
5. Confirmar comportamento offline e plano de migração/recuperação com dados sintéticos, incluindo falha, interrupção e rollback.

As alterações parciais e resultados efetivos ficam também no handoff e nos commits locais; não são autorização para push ou deploy.

## Validação local

- `npm run typecheck`: aprovado; `npm run lint`: 0 erros, 69 avisos; `npm run build` aprovado na cópia isolada. A validação ocorreu sem conexão com bancos ou credenciais de produção.
- Playwright em cópia isolada: rodada de armazenamento/sincronização com 10 aprovados e 1 falha (painel de conflito não apareceu); o caso de conflito passou em repetição. Outra rodada focada teve 6 aprovados: três testes de migração, um de cache, um de filtragem de preferências e a repetição de conflito. Os testes de migração e cache usam dependências simuladas.
- Rodada de Workspace e auditoria A → B: 3 aprovados (incluindo desktop e celular simulados) e 1 falha; `studyai:exams` de A permaneceu acessível após login em B. Esse harness exploratório com contas sintéticas fica em `work/sprint41/tests/sprint41f-two-accounts-audit.spec.ts` na cópia isolada, não no repositório.
- Não foi executado um teste completo de A → B → A, corridas de sincronização na troca de identidade ou avaliação protegida no servidor. Não houve testes com serviços reais. Repetição bem-sucedida do caso de conflito não elimina possível intermitência.
