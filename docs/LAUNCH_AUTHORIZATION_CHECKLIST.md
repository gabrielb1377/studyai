# Launch Authorization Checklist — StudyAI V1.1

**Status:** preparação apenas; nenhum passo de produção executado. Não constitui
autorização de deploy. Cada ação abaixo requer aprovação humana do responsável.

## A. Antes de pedir autorização

- [ ] Owner decide release commit/branch e janela; congelar SHA imutável.
- [ ] Acesso Railway **read-only** autorizado; identificar projeto, environment,
      service e deploy ativo sem copiar valores de secrets.
- [ ] Resolver modelo de config: legacy `railway.toml` **ou** Railway IaC. Confirmar
      config path/ownership no remoto; não misturar os dois. Rever plano IaC sem
      aplicar, se escolhido.
- [ ] Confirmar source trigger e entrega (GitHub service ou GHCR + webhook). O
      workflow atual escuta `main`; webhook/target não verificados.
- [ ] Confirmar builder, Dockerfile, build/start, port (`PORT`), liveness
      `/api/health/live`, restart, domain/TLS e resource limits no serviço ativo.
- [ ] Confirmar nomes/presença dos env vars no environment/service certo sem ler
      nem exportar valores: `AUTH_SECRET`, `API_KEYS_ENCRYPTION_KEY` (se existem
      dados v2), `DATABASE_URL`, SSL, S3 bucket/credentials/region/endpoint,
      `APP_URL`, `HEALTH_SECRET`, provider(s) e SMTP se necessário.
- [ ] Conferir persistência/estabilidade de `AUTH_SECRET` e chave BYOK. Não
      rotacionar como parte de deploy. Fazer teste funcional sem revelar chave.
- [ ] Verificar compatibilidade do artifact candidato com ciphertext `enc:v1:` e
      `enc:v2:` e com o schema existente; nunca fazer rollback para binário v1-only
      enquanto houver registros v2 sem plano autorizado de rekey/restore.
- [ ] Preparar runbook de migração, lock/concurrency e abort conditions após DBA
      revisar o schema remoto por leitura.
- [ ] Definir canal/owner de monitoramento e plano de comunicação; thresholds
      devem ser aprovados, não tratados como alertas já ativos.
- [ ] Owner/produto aceita riscos residuais e assina autorização separada de
      deploy, DDL, escrita de secrets, backup/cópia e testes pós-publicação.

## B. Janela aprovada — sequência futura, não executar neste checklist

1. Registrar aprovação, operador, janela UTC, commit SHA, service/environment e
   condição de abort.
2. Congelar artifact; revisar GitHub Actions, origem GHCR/webhook/Git integration
   e evitar dois gatilhos de deploy simultâneos.
3. Read-only preflight do serviço/config remotos; conferir matriz em
   `docs/RAILWAY_CONFIGURATION_DECISION.md`.
4. Confirmar presença/função das env vars sem exibir valores; bloquear release se
   variável obrigatória falta ou foi rotacionada.
5. Com aprovação específica do custodiante de dados, fazer backup PostgreSQL
   para destino criptografado aprovado, verificar archive/hash e restaurar para
   banco isolado novo, conforme `docs/ROLLBACK_V1_1.md`. Nunca usar `pg_dump` na
   produção sem essa autorização.
6. Com autorização separada, aplicar política de backup/versionamento de Object
   Storage pelo owner/provedor; ensaiar recuperação de canário em bucket/destino
   isolado. Não assumir que versioning existe. Não listar/baixar arquivos reais
   sem escopo e autorização explícitos.
7. DBA/owner aprova migration; considerar `db:migrate` no container start e
   inicialização de schema no primeiro query. Não iniciar réplicas concorrentes
   sem estratégia de DDL/lock aprovada.
8. Owner autoriza trigger de deploy específico. Verificar imagem/commit antes de
   promover tráfego; não habilitar simultaneamente webhooks/Git triggers por
   suposição.
9. Validar `/api/health/live` 2xx e readiness `/api/health`; Railway healthcheck
   é gate de rollout, não monitor contínuo.
10. Executar smoke checks aprovados, conta dedicada e fixtures sintéticas;
    verificar custo de provider e persistência apenas de dados autorizados.
11. Ativar monitoramento/alerta aprovado, operador responsável, logs redigidos e
    observação pós-release. Persistência de logs/alerting depende do plano Railway
    e não está conhecida.
12. Decidir manter ou abortar via artifact rollback. Código rollback não desfaz
    schema nem restaura DB/S3; preservar chaves BYOK e dados escritos depois do
    deploy. Restore de DB pode perder escritas e requer aprovação específica.

## C. Aprovações separadas

| Ação | Quem aprova | Status |
|---|---|---|
| Verificação read-only Railway | Owner do projeto | PENDENTE |
| Mudar IaC/Config-as-Code/Dashboard | Owner + revisão de engenharia | PENDENTE |
| Adicionar/rotacionar secrets | Owner/custodiante | PENDENTE; não rotacionar auth/BYOK |
| Backup de DB real / cópia S3 | Owner dos dados | PENDENTE |
| DDL/migração | DBA/owner | PENDENTE |
| Deploy/traffic switch | Responsável por release/produto | PENDENTE |
| Smoke test com contas/custos externos | Owner de produto/provedor | PENDENTE |
| Rollback ou restore em produção | Owner + DBA/responsável incidente | PENDENTE |

**Gate atual: CONDITIONAL.** Nenhuma caixa nesta seção foi executada em produção.
