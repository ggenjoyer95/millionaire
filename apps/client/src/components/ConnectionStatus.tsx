import { useEffect, useState } from 'react';
import { socket, SERVER_URL } from '../net/socket';

/**
 * Маленький индикатор соединения: показывает адрес backend-сервера
 * и статус (онлайн/пытаемся переподключиться).
 * Нужно, чтобы в LAN режиме участники видели, к какому серверу привязаны.
 */
export function ConnectionStatus() {
    const [connected, setConnected] = useState(socket.connected);
    const [pingMs, setPingMs] = useState<number | null>(null);

    useEffect(() => {
        const onConn = () => setConnected(true);
        const onDisconn = () => { setConnected(false); setPingMs(null); };
        socket.on('connect', onConn);
        socket.on('disconnect', onDisconn);

        // Пинг раз в 5 секунд
        const tick = () => {
            if (!socket.connected) return;
            const t0 = Date.now();
            socket.emit('session:ping', (res) => {
                if (res.ok) setPingMs(Date.now() - t0);
            });
        };
        const iv = setInterval(tick, 5000);
        tick();

        return () => {
            socket.off('connect', onConn);
            socket.off('disconnect', onDisconn);
            clearInterval(iv);
        };
    }, []);

    return (
        <div style={{
            position: 'fixed', right: 12, bottom: 12, zIndex: 100,
            fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11,
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(0,0,0,0.55)',
            color: connected ? '#86efac' : '#fca5a5',
            border: '1px solid rgba(255,255,255,0.1)',
            pointerEvents: 'none',
        }}>
            {connected ? '●' : '○'} {SERVER_URL.replace('http://', '')}
            {pingMs !== null && <span style={{ color: '#94a3b8', marginLeft: 8 }}>{pingMs} мс</span>}
        </div>
    );
}
