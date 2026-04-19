# Кто хочет стать миллионером

Адаптация телеигры.

## Стек

- TypeScript
- React 18 + Vite на клиенте
- Node.js + Socket.IO + Express на сервере
- pnpm workspaces
- Howler для звука
- Electron для desktop-сборки
- Playwright для e2e-тестов

## Запуск

Нужны Node.js 20+ и pnpm 9+.

```
pnpm install
pnpm dev
```

После старта в консоли появится LAN-адрес. Открывайте его с устройств,
которые подключены к одной сети.

На Windows есть start.bat, на Linux/macOS - start.sh.


## Тесты

```
pnpm --filter server test
```

## Запуск Electron

```
pnpm --filter client build
pnpm --filter server build
pnpm --filter desktop build
pnpm --filter desktop start
```

