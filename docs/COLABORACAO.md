# Colaboração Inteligente

## Visão geral

A Sprint 33 adiciona colaboração como um domínio isolado sobre autenticação, PostgreSQL, Cloud Sync e recursos existentes. Dados pessoais continuam nos bancos IndexedDB por usuário; somente conteúdos explicitamente incluídos em uma sala entram no domínio colaborativo.

```text
Pessoa autenticada
  → Sala de estudo ou Turma
      → Membros + papéis
      → Recursos versionados
          ├─ Material
          ├─ Nota
          ├─ Flashcards
          ├─ Quiz
          ├─ Workspace
          └─ Plano de estudo
      → Comentários e respostas
      → Presença efêmera
      → Progresso individual
      → Histórico de auditoria
```

## Papéis

| Papel | Leitura | Comentário | Edição | Gerenciar pessoas | Excluir sala |
| --- | --- | --- | --- | --- | --- |
| Administrador | Sim | Sim | Sim | Sim | Sim |
| Editor | Sim | Sim | Sim | Não | Não |
| Comentador | Sim | Sim | Não | Não | Não |
| Leitor | Sim | Não | Não | Não | Não |

A transferência do papel Administrador também transfere a propriedade da sala. O proprietário não pode sair nem ser removido antes dessa transferência.

## Consistência e tempo quase real

- Recursos utilizam `version` e `expectedVersion`. Uma edição desatualizada recebe HTTP 409 em vez de sobrescrever outra pessoa.
- A versão anterior é armazenada em `collaboration_revisions` e pode ser restaurada.
- A interface renova a presença e consulta alterações a cada oito segundos enquanto está visível.
- Presenças sem heartbeat por 45 segundos deixam de aparecer.
- Todas as mutações importantes geram uma entrada em `collaboration_activity`.
- Escritas são limitadas por usuário para reduzir abuso.

## Persistência

PostgreSQL possui as tabelas:

- `study_rooms`
- `room_members`
- `room_invites`
- `room_resources`
- `collaboration_revisions`
- `collaboration_comments`
- `collaboration_presence`
- `collaboration_activity`
- `collaboration_progress`

Sem `DATABASE_URL`, o mesmo contrato utiliza memória do processo exclusivamente para desenvolvimento e testes. Esse modo não é durável.

## APIs internas

| Método e rota | Responsabilidade |
| --- | --- |
| `GET/POST /api/collaboration/rooms` | Listar e criar salas. |
| `GET/PATCH/DELETE /api/collaboration/rooms/:id` | Snapshot, edição e remoção da sala. |
| `POST /api/collaboration/invites` | Criar convite com papel, validade e limite de usos. |
| `POST /api/collaboration/join` | Entrar por convite. |
| `PATCH/DELETE /api/collaboration/rooms/:id/members` | Alterar papel, transferir administração, sair ou remover. |
| `POST/PATCH/DELETE /api/collaboration/rooms/:id/resources` | Compartilhar, editar e remover recursos. |
| `GET/POST /api/collaboration/rooms/:id/resources/:resourceId/revisions` | Consultar ou restaurar versões. |
| `POST /api/collaboration/rooms/:id/comments` | Comentar e responder. |
| `POST /api/collaboration/rooms/:id/presence` | Heartbeat de presença. |
| `POST /api/collaboration/rooms/:id/progress` | Progresso individual de decks e quizzes. |

Todas as escritas exigem cookie de sessão, token CSRF, validação do papel e rate limit. A resposta nunca confia em um papel enviado pelo cliente.

## Compartilhamentos independentes

Links já existentes agora registram visibilidade (`public` ou `private`) e acesso (`read`, `comment` ou `edit`). Links privados exigem sessão para leitura. Edição colaborativa e comentários com histórico ocorrem dentro de salas, onde identidade, papel e auditoria são verificáveis.

## Limites atuais

- Atualização quase em tempo real usa polling; WebSocket ou SSE poderá reduzir latência e requisições em uma evolução futura.
- O fallback em memória serve somente ao desenvolvimento.
- Binários continuam no Object Storage; a sala armazena referências e dados estruturados, evitando duplicar arquivos grandes.
- O modo Professor utiliza salas do tipo `classroom`, papéis e progresso individual. Correção automática por IA não foi adicionada nesta Sprint.

## Validação

A suíte final possui 95 cenários Playwright aprovados. A cobertura específica desta Sprint usa navegadores isolados para representar contas diferentes e valida convites, papéis, presença, comentários, respostas, progresso, conflito de versão, restauração, remoção/transferência e viewport de 360 px. Lint, TypeScript e build de produção também foram aprovados.
