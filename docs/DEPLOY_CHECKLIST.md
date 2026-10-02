# Checklist de deploy online

Use este roteiro depois de cada implantação de produção. Registre data, versão, ambiente e responsável sem copiar credenciais.

## Infraestrutura

- [ ] A URL pública abre por HTTPS sem aviso de certificado.
- [ ] `APP_URL`, `NEXT_PUBLIC_APP_URL` e domínio correspondem à URL pública.
- [ ] `/api/health` responde `200` e `status: ok`.
- [ ] PostgreSQL aparece conectado e `schemaReady` é verdadeiro.
- [ ] Object Storage aparece disponível em modo `s3`.
- [ ] `npm run db:migrate` foi executado com sucesso.
- [ ] SMTP enviou uma mensagem de teste.
- [ ] Pelo menos um provider remoto de IA está online.
- [ ] Logs não contêm tokens, cookies, chaves ou conteúdo privado.
- [ ] Backup do PostgreSQL e do bucket está configurado.

## Jornada principal

1. [ ] Abrir a URL pública.
2. [ ] Criar uma conta.
3. [ ] Verificar o email e fazer login.
4. [ ] Concluir o onboarding.
5. [ ] Importar um PDF permitido.
6. [ ] Aguardar extração/indexação e usar o Tutor.
7. [ ] Usar o modo Professor.
8. [ ] Criar conteúdo livre na Academy.
9. [ ] Gerar e baixar um PDF da Academy.
10. [ ] Confirmar o conteúdo na Biblioteca.
11. [ ] Abrir e restaurar o Workspace.
12. [ ] Abrir um exercício no Laboratório.
13. [ ] Fazer logout.
14. [ ] Fazer login novamente e confirmar persistência.
15. [ ] Abrir pelo celular.
16. [ ] Adicionar como PWA na tela inicial.
17. [ ] Abrir por outro computador.
18. [ ] Testar em uma rede fora de casa.
19. [ ] Desligar o PC local e repetir acesso, login e abertura da Biblioteca.
20. [ ] Confirmar que dados continuam salvos e sincronizados.

## Arquivos e sincronização

- [ ] O arquivo importado aparece em outro dispositivo.
- [ ] Download sob demanda recupera o binário do S3.
- [ ] Substituir e excluir removem/atualizam o objeto correto.
- [ ] Academy, PDFs gerados e apresentações persistem.
- [ ] Notas, resumos, flashcards e quizzes sincronizam.
- [ ] Uma alteração offline entra na fila e sincroniza ao reconectar.
- [ ] Conflitos não sobrescrevem dados silenciosamente.
- [ ] Backup estruturado exporta e restaura registros.

## IA

- [ ] Tutor usa o provider selecionado.
- [ ] Professor usa contexto recuperado sem receber arquivo físico.
- [ ] Mentor mantém a sessão.
- [ ] Academy conclui geração e persiste o material.
- [ ] Flashcards, quiz e resumo são gerados pelas rotas internas.
- [ ] Provider indisponível mostra erro amigável e fallback quando configurado.
- [ ] Nenhuma chave aparece nas requisições do navegador.

## Segurança

- [ ] `.env.local` e demais arquivos de segredo não estão no Git.
- [ ] `AUTH_SECRET` e `HEALTH_SECRET` são fortes e diferentes.
- [ ] Cookies são `Secure`, `HttpOnly` quando aplicável e `SameSite=Strict`.
- [ ] Rotas mutáveis rejeitam CSRF ausente.
- [ ] Upload maior que o limite é rejeitado.
- [ ] Bucket não permite listagem ou leitura pública.
- [ ] Health público não expõe mensagens internas.
- [ ] CSP, HSTS, `nosniff` e bloqueio de frames estão presentes.
- [ ] Rate limit foi testado nas rotas de autenticação e upload.

## PWA e responsividade

- [ ] Manifest e todos os ícones retornam `200`.
- [ ] Service worker controla a página em produção.
- [ ] Instalação funciona em Android/Chrome.
- [ ] Instalação ou atalho funciona em iPhone/Safari.
- [ ] Shell abre offline após a primeira visita.
- [ ] Login, Biblioteca, Academy, Tutor e Professor funcionam no celular.
- [ ] Workspace se adapta ao mobile.
- [ ] Lab apresenta fallback utilizável em tela pequena.

## Railway

- [ ] Repositório conectado ao GitHub.
- [ ] Serviço Next.js usa o Dockerfile.
- [ ] PostgreSQL foi adicionado e ligado por `DATABASE_URL`.
- [ ] Bucket S3 foi criado/conectado.
- [ ] Variáveis foram configuradas no ambiente Production.
- [ ] Health check usa `/api/health`.
- [ ] Deploy automático foi testado uma vez.
- [ ] URL pública foi testada no celular.
- [ ] Domínio customizado e DNS foram configurados, se utilizados.

## Vercel + Supabase

- [ ] Projeto Next.js implantado na Vercel.
- [ ] Supabase Postgres usa pooler apropriado ao serverless.
- [ ] Schema foi migrado.
- [ ] Storage S3 está privado e acessível pelo backend.
- [ ] Variáveis foram configuradas em Production.
- [ ] Auth, cookies e emails usam o domínio final.
- [ ] Upload respeita os limites da Vercel.
- [ ] IA funciona sem expor credenciais.

## VPS + Docker Compose

- [ ] Docker e Compose estão atualizados.
- [ ] `.env.production` está fora do Git e com permissões restritas.
- [ ] DNS aponta para a VPS.
- [ ] Portas 80/443 estão liberadas.
- [ ] `docker compose --env-file .env.production up -d --build` concluiu.
- [ ] App, PostgreSQL, MinIO e Caddy estão saudáveis.
- [ ] Caddy emitiu o certificado HTTPS.
- [ ] Volumes persistentes possuem backup.
- [ ] Logs e alertas estão configurados.

## Aprovação

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:e2e`
- [ ] `npm run build`
- [ ] Nenhum bug crítico aberto.
- [ ] PC local desligado durante o teste final.
- [ ] Data e versão da validação registradas.
