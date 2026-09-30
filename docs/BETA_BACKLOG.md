# Backlog da Beta

Atualizado em 30 de setembro de 2026. Prioridades derivadas da auditoria da Sprint 36.5.

## P0 — bloqueadores

Nenhum P0 confirmado no código ou nas verificações focadas desta Sprint.

## P1 — antes da Beta pública

| Item | Evidência | Próxima ação |
| --- | --- | --- |
| Instabilidade de cenários assíncronos sob a suíte completa | Cloud Sync e atualização visual após exclusão passaram no retry e também isoladamente; a retomada pelo Dashboard recebeu uma correção de navegação e passou sem retry. | Coletar tempo de request/fila e eliminar dependência de estado temporal dos testes restantes. |
| Homologação externa não executada neste ambiente local | SMTP, PostgreSQL, S3, domínio, certificados e providers dependem de infraestrutura externa. | Validar runbook de `PRODUCTION.md` em ambiente separado com credenciais de teste. |

## P2 — qualidade e performance

| Item | Contexto | Próxima ação |
| --- | --- | --- |
| Bundle das rotas Academy/Lab | Geradores, SQL/WASM e exportações já usam `import()` dinâmico; a rota do Lab continua naturalmente mais pesada. | Medir com dados reais e orçamento de bundle antes de trocar editor/renderizadores. |
| Mermaid em exportações | A estrutura editável é preservada quando a renderização de imagem não está disponível. | Validar conversão visual em uma Sprint própria, sem degradar exportação offline. |
| Restore em grande volume | Restauração passou a ser validada e atômica, com limite de 50 MB/200 mil registros. | Executar ensaio com acervos próximos dos limites em navegadores de baixo recurso. |
| Telemetria de produto | Continua opt-in e limitada a métricas numéricas allowlisted. | Definir retenção e dashboard operacional antes da Beta pública. |

## Resolvido nesta Sprint

- A cadeia local de ML foi atualizada de forma controlada para `@huggingface/transformers 4.3.0`; OCR, transcrição, embeddings, build e regressão foram exercitados. `npm audit --omit=dev` retornou zero vulnerabilidades.

## Fora do escopo desta estabilização

- Novos providers, novos módulos e redesign amplo.
- Migração forçada de dependências com breaking changes.
- Publicação de domínio, lojas mobile ou instalador assinado.
- Métricas de produto sem consentimento explícito.
