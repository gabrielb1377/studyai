# Backlog após auditoria — Sprint 32.5

Ordenado por risco. P0 significa bloqueador/crítico, P1 risco importante, P2 melhoria. Nenhum P0 foi encontrado durante a auditoria.

## Bugs críticos

Nenhum defeito P0 conhecido.

## Bugs médios

- **P1 · Dependências com advisories altos:** atualizar `onnxruntime-node`/`adm-zip` e `sharp` para versões corrigidas; validar OCR, leitura de arquivos compactados, Whisper e embeddings antes de publicar. Atualização ficou bloqueada nesta máquina por `EALLOWREMOTE` ao obter pacotes. Dono: manutenção de dependências.
- **P1 · Backup não preserva bytes:** snapshots incluem registros syncáveis, não arquivos no S3. Definir retenção/manifesto de binários e testar exclusão → restore → download sem arquivo de origem disponível. Dono: Cloud/Storage.
- **P2 · Provider health sem teste de geração real:** criar ambiente de homologação com chaves e modelo de baixo custo para validar geração, timeout, abort, retry e streaming em cada adapter. Hoje os health checks são reais, mas geração/erro é mockada nos testes.
- **P2 · Falha S3 após escrita parcial:** validar compensação de objeto recém-criado quando o upsert do metadado falhar e política de lifecycle de objetos sem referência. Dono: Object Storage.

## Melhorias

- **P1 · Rate limit distribuído:** `RateLimit` em memória não coordena múltiplas réplicas. Migrar a contagem para store compartilhado ou proxy antes de escalar API pública.
- **P2 · Cobertura mensurável:** configurar relatório de cobertura unitária e estabelecer metas por serviço sensível (Auth, Sync, S3, retrieval e importação).
- **P2 · Testes com infraestrutura real:** pipeline temporário com PostgreSQL e S3 compatível/MinIO para validar migrations, transações, IAM/policy, criptografia, hash e lifecycle.
- **P2 · Medição de recursos de sistema:** coletar CPU/RSS do servidor em teste de carga controlado. A medição atual registra heap aproximado do Chromium e timers de cenário, não CPU/RAM totais.
- **P2 · Teste de carga e recuperação:** testar sync de 100+ materiais grandes, interrupções durante upload/restore e reprocessamento após falha.

## Refatorações

- **P2 · Reduzir concentração de lógica:** revisar módulos de maior tamanho (`CloudDatabase`, `AccountPage`, `CloudSyncManager`, import pipeline) e dividir funções sem mudar contratos.
- **P2 · Padronizar legibilidade:** há Route Handlers e funções antigas comprimidas em linhas longas; aplicar formatter gradualmente, acompanhando diff e testes.
- **P2 · Instrumentação por etapa:** persistir tempos individuais de OCR, Whisper, chunking, embeddings, retrieval, provider, Mentor, search e sync com labels sem conteúdo pessoal.

## Performance

- **P2 · Benchmark frio:** repetir Lighthouse/Playwright em hardware de referência com cache frio, throttling de rede e perfil RAM.
- **P2 · Busca e listas extensas:** estabelecer orçamento para conjuntos de 10 mil registros/chunks e verificar virtualização/índices IndexedDB sob carga.
- **P2 · OCR/Whisper:** comparar dispositivos e documentar duração, peak RSS e custo de memória por tamanho/idioma.

## UX e acessibilidade

- **P2 · Leitor de tela:** auditar manualmente diálogos complexos, painéis reordenáveis, árvore de materiais e streaming com leitor de tela.
- **P2 · Ultrawide:** validar hierarquia e largura máxima visual em 2560 px; o teste automatizado atualmente verifica overflow, não qualidade visual detalhada em cada rota.
- **P2 · Guias de ajuda em vídeo:** produzir vídeos reais quando houver gravações aprovadas; o produto atual usa tutoriais textuais e onboarding interativo.

## Futuras funcionalidades

- **P3 · Restauração cloud sem mídia de origem:** backup completo/versionamento de arquivos em bucket, com política de retenção, custo e restauração granular.
- **P3 · Métricas agregadas multi-instância:** painel operacional com SLO, percentis e alertas, respeitando consentimento e minimização de dados.
- **P3 · Compatibilidade iOS automatizada:** pipeline macOS/Xcode para build, assinatura e teste de compartilhamento.

## Itens resolvidos nesta Sprint

- Limpeza de OPFS ao receber exclusão remota.
- Reimportação de material com metadado existente e binário ausente, reutilizando o id.
- Helper de teste IndexedDB sensível ao escopo de usuário.
- Limite de corpo e rate limit menos controlável pelo cliente no endpoint de telemetria.
- Viewports 390, 1366 e 2560 adicionadas à suíte.
