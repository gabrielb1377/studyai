# Distribuição multiplataforma

## Web e PWA

O build padrão (`npm run build`) publica a aplicação web. O service worker é registrado apenas em produção e mantém o shell visitado, assets estáticos e materiais em caches separados. A instalação usa `public/manifest.webmanifest`.

## Desktop Windows

O Electron executa o build standalone do Next.js em um servidor restrito a `127.0.0.1`. Assim, Route Handlers, IndexedDB, OCR e os fluxos offline continuam disponíveis sem depender de hospedagem externa.

```bash
npm run desktop:dev
npm run desktop:pack
npm run desktop:build
```

O último comando gera o instalador NSIS em `dist-desktop/`. Atualizações automáticas ficam inativas até que um destino de publicação assinado seja configurado no `electron-builder.yml`.

## Android e iOS

O Capacitor encapsula a versão web hospedada, mantendo IndexedDB, cache e service worker. Defina a URL HTTPS antes de sincronizar:

```bash
$env:CAPACITOR_SERVER_URL="https://app.exemplo.com"
npm run mobile:sync
npm run android:open
npm run ios:open
```

Sem `CAPACITOR_SERVER_URL`, o pacote abre um shell de recuperação offline. O projeto iOS deve ser compilado e assinado no macOS com Xcode; o Android exige Android Studio/SDK. Chaves, certificados, URL de produção e contas das lojas não são versionados.

## Limites operacionais

- Push remoto exige credenciais VAPID/APNs/FCM e uma implantação do backend; a Sprint 31 implementa notificações locais em Desktop, PWA e Mobile.
- Atualização Desktop exige um feed de releases assinado.
- Associação de arquivos está configurada no instalador Windows; recebimento via compartilhamento web usa o Share Target da PWA.
