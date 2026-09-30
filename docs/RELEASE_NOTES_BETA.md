# StudyAI Beta — Release Notes

## Escopo

Esta candidata à Beta consolida os fluxos existentes sem criar um novo domínio funcional. O foco foi estabilidade, segurança, recuperação de dados, feedback e documentação operacional.

## Melhorias da Sprint 36.5

- Canal de feedback acessível pela Central de Ajuda, com avaliações de experiência e relato estruturado de problemas.
- Diagnóstico opcional e mínimo: somente rota, navegador, dispositivo e horário; nenhum arquivo, conteúdo acadêmico ou segredo é enviado.
- Endpoint de feedback com limite de corpo, rate limit, validação, envio server-only por SMTP e telemetria apenas da contagem.
- Backup local v2 com preferências allowlisted e estado/layout do Workspace.
- Restauração compatível com backup v1, validada antes da escrita e executada em uma única transação IndexedDB.
- Rejeição de backup futuro, store desconhecido, volume excessivo e preferência não autorizada.
- Ação duplicada de download removida da tela de Conta.
- Runtime local de ML atualizado para a cadeia sem advisories conhecida pelo `npm audit`, com regressão de OCR/transcrição aprovada.
- Retomada “Continuar estudando” tornou-se resistente à perda de navegação após atualizações assíncronas do Dashboard.
- Guia de testes da Beta e backlog priorizado por risco verificável.

## Configuração adicional

`FEEDBACK_EMAIL` define o destinatário dos relatos. O envio também exige as variáveis `SMTP_*`. Quando o canal não está configurado, a interface informa o problema sem fingir que o relato foi entregue.

## Limitações conhecidas

- Providers, SMTP, PostgreSQL, S3 e HTTPS exigem serviços externos configurados.
- Ollama exige instância local e modelo instalado.
- A primeira transcrição local pode exigir download do modelo.
- Alguns cenários assíncronos ainda podem exigir estabilização de timing sob a carga total da suíte, embora passem no retry e isoladamente.
- Builds iOS, assinatura de desktop e publicação em lojas dependem dos respectivos ambientes e credenciais.
