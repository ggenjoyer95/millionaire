import {io, Socket} from 'socket.io-client';
import type {ClientToServerEvents, ServerToClientEvents} from '@millu/shared';
import {soundManager} from '../sound/SoundManager';

/**
 * Клиентский WebSocket. Адрес backend определяется автоматически:
 *   1. VITE_SERVER_URL если задан;
 *   2. иначе hostname текущей страницы и порт VITE_SERVER_PORT (по умолчанию 4000).
 *
 * Это даёт работу в LAN: открыли клиент по http://192.168.0.11:3000,
 * сокет идёт на http://192.168.0.11:4000 без дополнительной настройки.
 */

const env = import.meta.env as Record<string, string | undefined>;

function getServerUrl(): string {
  const override = env.VITE_SERVER_URL;
  if (override && override.length > 0) return override;
  const port = env.VITE_SERVER_PORT || '4000';
  const hostname =
    (typeof window !== 'undefined' && window.location.hostname) || 'localhost';
  return `http://${hostname}:${port}`;
}

export const SERVER_URL = getServerUrl();

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  transports: ['websocket', 'polling'],
});

// Когда короткий звук доиграл сам, сообщаем серверу.
// Сервер уберёт его из activeSounds и пошлёт state_update.
// Кнопка в саундборде вернётся из STOP в PLAY автоматически.
soundManager.setOnEndedCallback((id) => {
  if (socket.connected) socket.emit('sound:ended', id);
});

// Закрытие вкладки или обновление страницы это тоже добровольный выход.
// Шлём session:leave чтобы роль не зависла на 60 секунд резервации.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (socket.connected) {
      socket.emit('session:leave');
    }
  });
}

export function ensureConnected(): void {
  if (!socket.connected) socket.connect();
}

export function disconnect(): void {
  if (socket.connected) {
    // Сначала сообщаем серверу что выходим добровольно,
    // чтобы он немедленно освободил роль без grace period.
    // socket.io буферизует исходящие пакеты, поэтому даже если
    // disconnect случится сразу после, leave успеет уйти.
    socket.emit('session:leave');
    // Маленькая задержка чтобы пакет успел уйти до закрытия
    setTimeout(() => socket.disconnect(), 50);
  }
}
