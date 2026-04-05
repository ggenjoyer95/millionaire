import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite-конфигурация.
 *
 * Ключевые моменты для LAN-режима (ТЗ 4.9):
 *   - server.host = true — слушаем на всех сетевых интерфейсах,
 *     чтобы клиент открывался с других устройств (смартфон, планшет, ТВ);
 *   - alias @millu/shared — резолв общих типов из моно-репозитория;
 *   - strictPort = true — не переключать порт, если 3000 занят
 *     (иначе клиенты не найдут сервер по ожидаемому адресу).
 */
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@millu/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        },
    },
    server: {
        port: 3000,
        strictPort: true,
        host: true, // LAN: доступ с других устройств
    },
    preview: {
        port: 3000,
        strictPort: true,
        host: true,
    },
});
