# Sprint 45 — Semana de Prova 2.0

## Encerramento no escopo do MVP pessoal

As etapas 45 a 45.4 entregaram preparação por disciplina, agenda, simulados locais com histórico por avaliação, conferência de gabarito, revisão de materiais e retomada. O checkpoint seletivo pode registrar esse escopo.

Validação de encerramento: 23 testes focados passaram, incluindo retomada de simulados locais e rejeição de acesso a tentativas de outra conta. Typecheck, lint, build e `git diff --check` passaram. O lint manteve 50 avisos preexistentes.

A persistência de avaliações no servidor, o vínculo com tentativas protegidas e a migração ficam adiados até antes de expansão multiusuário ou ativação do vínculo protegido. O simulado local funciona sem esse vínculo. A API protegida continua usando a identidade da sessão para criar, ler e corrigir tentativas. IDs de avaliação enviados pelo cliente não criam associação. As tentativas protegidas continuam sem histórico por avaliação. A proposta de schema e os riscos de atribuição indevida estão no registro 45.4 abaixo.

## Continuação 45.4

- Validação: 31/31 regressões de preparação, Modo Prova e armazenamento passaram. Em uma execução separada, 1/1 teste criou dois simulados locais pela interface em sessões autenticadas A → B → A no mesmo navegador. O servidor local em memória usou contas sintéticas. O teste verificou ausência do registro de A em B e retomada da resposta de A sem dados de B. Nenhuma associação protegida nova foi exercitada. Lint passou com 50 avisos preexistentes. Build, typecheck e `git diff --check` passaram.

- O esquema atual não oferece vínculo durável entre avaliação e tentativa. O ExamService mantém avaliações no navegador. O servidor usa o usuário autenticado para consultar e corrigir a tentativa, mas `exam_attempts` não tem uma referência de avaliação.
- Foi avaliado o reaproveitamento de `sync_records`. Os registros de tipos públicos como `metadata` são graváveis e removíveis por sincronização e podem ser compartilhados. Uma entidade reservada exigiria excluir esses dados de backups, restaurações e leituras genéricas, além de criar um contrato para impedir vínculos órfãos. A coluna `questions` tem leitores que esperam um array e guarda gabaritos protegidos. Reaproveitá-la para metadados mudaria esse contrato. Nenhum desses caminhos foi usado.
- Proposta para aprovação: tabela mínima de avaliações com chave de proprietário e identificador emitido pelo servidor, referência opcional em `exam_attempts` com chave estrangeira composta pelo dono e avaliação, e índice para consultas por avaliação. Criar o vínculo na transação da tentativa usando a identidade da sessão. Devolver o mesmo erro para referência inexistente ou de outra conta. Manter as linhas legadas com referência nula e preservar o fluxo local. A exclusão de avaliações com histórico deve preservar a referência, por exemplo com arquivamento. Não houve alteração de schema ou migração.

## Continuação 45.3

- Associação protegida permanece bloqueada. Menor mudança proposta para aprovação: registrar a avaliação com ID emitido pelo servidor e proprietário derivado da sessão, acrescentar uma referência opcional em `exam_attempts` e vincular por chave composta de avaliação e proprietário. A criação deve validar o vínculo na mesma transação da tentativa e as consultas devem filtrar por proprietário e avaliação. As tentativas legadas mantêm referência nula. Exclusão e importação de avaliações locais exigem política explícita para preservar o histórico e evitar atribuição indevida. Nenhum schema foi alterado.
- O catálogo preserva o arquivo e a página de PDFs mistos, exclui OCR ainda não revisado e ignora alternativas antigas fundidas em uma linha. A interface orienta revisão ou reextração manual do original. Não houve reprocessamento em massa.
- Build, typecheck, lint e `git diff --check` aprovados. A rodada consolidada de preparação, tentativas protegidas, armazenamento e quotas passou em 35/35, com zero falhas e ignorados. Lint apresentou os 50 avisos preexistentes.
- A rodada adicional passou em 2/2: importação e OCR real de PDF misto e autenticação A → B → A em servidor local em memória, no mesmo navegador e em duas abas. O cenário autenticado usou registros sintéticos inseridos no armazenamento, verificou ausência dos dados de A em B, rejeição de identidade divergente pela API e restauração da tentativa de A após reload. A criação dos dois simulados pela interface com login não foi executada. O cenário de criação pela interface passou separadamente em modo offline. O servidor de desenvolvimento registrou `ECONNRESET` durante a rodada adicional, sem falha de asserção.

## Continuação 45.2

- Uma sugestão aparece após a entrega quando a extração tem uma única questão e um único marcador explícito de resposta. A sugestão jamais corrige a tentativa. O aluno consulta o material e confirma a alternativa explicitamente. O histórico registra a origem, a data e a versão da questão, separando correção por conferência própria de autoavaliação. Mudança de enunciado, alternativas ou disponibilidade do material suspende o uso da confirmação. Fontes institucionais estruturadas ainda não têm um contrato de ingestão.
- O servidor protege leitura e correção por `user_id` autenticado. O schema de `exam_attempts` guarda a tentativa, mas não identifica a avaliação, e o ExamService local não fornece um registro de propriedade que o servidor possa consultar. Fechar este ponto exige persistência de avaliações autorizadas no servidor e associação durável da tentativa. Nenhum ID local foi aceito como prova de propriedade. As tentativas anteriores continuam no fluxo legado.
- O teste completo A → B → A com duas contas autenticadas e tentativas locais próprias ainda é um critério pendente.
- Validação 45.2: `node node_modules/@playwright/test/cli.js test --config "$env:TEMP/studyai-44a-validation.cjs" sprint45-exam-preparation exam-attempt-server sprint41g3b-storage-isolation sprint42-security-quota sprint44a-discipline sprint44b-topic-review`, com `STUDYAI_44A_BROWSER=1`, executou 37 testes em 50,9 s, todos aprovados, sem falhas ou ignorados. A regressão com contas simuladas verifica a remoção do registro de tentativas do armazenamento da conta A na transição. O teste em 360 × 780 verifica duas avaliações do mesmo estudo, sugestão sem pontuação automática e confirmação persistida após reload. A invalidação de alternativas foi verificada em teste focado. Typecheck, lint, build e `git diff --check` passaram, com 50 avisos preexistentes de lint. A matriz de PDFs mistos e documentos anteriores ainda não foi repetida.

## Continuação 45.1

- A Semana de Prova seleciona questões extraídas somente dos materiais vinculados que continuam na disciplina. O aluno escolhe a quantidade, responde, finaliza e revisa o resultado. Cada tentativa local guarda identificadores de avaliação, disciplina, materiais e estudos, além das respostas e da origem. A conta é definida pelo escopo de armazenamento existente do ExamService.
- A tentativa guarda apenas o conteúdo das questões selecionadas, para manter o histórico consultável mesmo que um material seja removido. Gabaritos detectados no texto não são promovidos a correção objetiva. A autoavaliação fica separada das respostas sem correção. A correção objetiva continua no Modo Prova protegido existente.
- O primeiro teste com importação real mostrou que a normalização fundia linhas de alternativas. A normalização agora preserva linhas de questão, alternativas e indicação de gabarito. Documentos já extraídos com linhas fundidas podem exigir reextração.
- A agenda agora inclui sugestões derivadas de exercícios, simulados e revisões em atraso ou marcadas como difíceis nos estudos vinculados. O checklist manual continua persistido independentemente dessas sugestões.
- O histórico legado continua no estudo e está rotulado como compartilhado. A associação de tentativas protegidas no servidor com uma avaliação e a correção objetiva de questões importadas ainda dependem de contrato confiável para identificar a avaliação e verificar o gabarito. O checkpoint final permanece pendente.
- Validação 45.1: a primeira rodada passou em 28/29 casos. Após preservar as linhas na extração, a repetição focada passou em 5/5, incluindo duas avaliações do mesmo estudo com respostas distintas, autoavaliação e reload em 360 × 780. A rodada adicional de quotas e recuperação passou em 5/5, com 16 subtestes de progresso aprovados. Não foi possível recuperar a saída final da repetição consolidada. O isolamento de tentativas locais entre contas autenticadas ainda não foi verificado de ponta a ponta.

## Registro da Sprint 45 original

Base `3938714a39995b9ea10fa75345a663055bcf14e2`. Implementação parcial.

- Em **Provas**, escolha uma disciplina da Biblioteca ou mantenha o cadastro manual. Cada avaliação guarda horário opcional, vínculos, sequência, checklist e totais de autoavaliação no armazenamento existente da conta. As ações contextuais usam materiais ainda pertencentes à disciplina. Alterar a disciplina exige selecionar os vínculos novamente.
- O plano distribui os temas cadastrados até a data da prova, mantém a conclusão e permite mudar a ordem. No mesmo dia, distribui a meta diária pelos temas. Uma data passada não cria atividades.
- A prática reutiliza as questões detectadas em páginas da extração que dispensam revisão adicional. Mostra enunciado, alternativas e página. O aluno confirma o próprio resultado. O extrator não verifica gabaritos. Os totais manuais ficam separados dos resultados do quiz. A correção objetiva continua nos fluxos existentes de Quiz e Modo Prova.
- O Tutor abre um rascunho da disciplina com os materiais selecionados. O envio depende do aluno e segue as políticas existentes de recuperação de trechos, quotas, roteamento e fallback. O atalho de pontos fracos abre a revisão 44B, priorizando erros registrados, dificuldade declarada e atraso.

## Critérios pendentes

- O plano ainda usa temas e prioridades cadastrados. Falta integrar automaticamente exercícios, simulados e evidências da revisão à agenda.
- O Modo Prova protegido continua operando por estudo elegível, com geração mediante ação explícita. Falta montar uma tentativa com questões existentes de vários materiais, oferecer redução de quantidade quando o banco for insuficiente e persistir a associação entre tentativa e avaliação. Resultados históricos de estudo podem aparecer em duas avaliações vinculadas ao mesmo estudo. Os totais de autoavaliação são separados por avaliação, mas ainda não há histórico por resposta de prática extraída.
- Falta validar a sincronização e a homologação externa. A Sprint 46 permanece fora desta entrega.

## Validação local

- Playwright com configuração temporária sem setup global, Chromium local, Service Worker bloqueado e dados sintéticos. A rodada sem servidor passou em 25/25 testes Playwright, além de 16 subtestes Node de progresso. Cobriu agenda, extração, quotas, recuperação de materiais e Modo Prova protegido com dependências simuladas.
- A rodada com build local passou inicialmente em 28/30, incluindo os quatro testes da Sprint 45. As duas falhas da 41I.C vieram de uma dependência de OCR ausente na configuração do teste e de uma fixture escrita antes da sessão offline estar pronta. Os dois casos passaram na repetição focada após ajustar a preparação, com as mesmas asserções. Nenhum caso selecionado foi ignorado.
- Typecheck, build e lint passaram. O lint reportou 50 avisos preexistentes. `git diff --check` passou. A matriz completa e a homologação externa não foram executadas.
