/**
 * Главный процесс Electron.
 *
 * Архитектура:
 *   - при старте поднимаем Node.js сервер (импортируем из apps/server)
 *     прямо в этом же процессе, чтобы не было зависимости от pnpm/npm
 *     на машине пользователя;
 *   - создаём окно с загрузкой статической сборки клиента (apps/client/dist);
 *   - клиент видит сервер по адресу http://127.0.0.1:SERVER_PORT как
 *     обычно, сокеты и REST работают одинаково как в dev, так и здесь.
 *
 * В итоге пользователь получает один exe/dmg/AppImage который запускается
 * двойным кликом и открывает окно с игрой, без терминала и pnpm.
 */

import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {app, BrowserWindow, Menu} from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Порты можно переопределить через переменные окружения
const SERVER_PORT = Number(process.env.PORT) || 4000;

// В продакшн-сборке клиент лежит рядом. В dev можно указать DEV_CLIENT_URL.
const DEV_CLIENT_URL = process.env.DEV_CLIENT_URL;

let mainWindow: BrowserWindow | null = null;

async function startServer(): Promise<void> {
  // Подгружаем серверный процесс как модуль
  // Путь относительно скомпилированного desktop
  // (в dev: ../../server/src/index.ts, в прод: ../server/dist/index.js)
  const serverEntry = process.env.SERVER_ENTRY ||
    path.join(__dirname, '..', '..', 'server', 'dist', 'index.js');

  try {
    await import(pathToFileURL(serverEntry).href);
    console.log('[desktop] сервер поднят внутри Electron');
  } catch (err) {
    console.error('[desktop] не удалось поднять сервер:', err);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'Кто хочет стать миллионером?',
    backgroundColor: '#000008',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Скрываем меню для игрового режима
  Menu.setApplicationMenu(null);

  const url = DEV_CLIENT_URL || `http://127.0.0.1:${SERVER_PORT}`;
  mainWindow.loadURL(url);

  // В dev-режиме открываем DevTools
  if (process.env.DEV_TOOLS === '1') {
    mainWindow.webContents.openDevTools({mode: 'detach'});
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startServer();
  // Дадим серверу секунду стартовать
  setTimeout(createWindow, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
