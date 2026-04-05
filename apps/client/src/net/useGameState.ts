import { useEffect, useState } from 'react';
import type { AccessError, GameState, UserRole } from '@millu/shared';
import { socket, ensureConnected } from './socket';

export type JoinState =
    | { status: 'connecting' }
    | { status: 'joined'; state: GameState }
    | { status: 'kicked'; reason: AccessError }
    | { status: 'error'; error: string }
    | { status: 'disconnected' };

/**
 * Подключается к серверу в выбранной роли и поддерживает актуальное состояние.
 *
 * Протокол:
 *   1) открываем сокет;
 *   2) шлём session:join (role, name?) с ack;
 *   3) при успехе получаем начальный GameState;
 *   4) подписываемся на game:state_update — обновляем локально;
 *   5) при session:kicked выходим с причиной.
 *
 * Reconnect работает автоматически (socket.io), после повторного connect
 * повторяем session:join.
 */
export function useGameState(role: UserRole, name?: string): JoinState {
    const [joinState, setJoinState] = useState<JoinState>({ status: 'connecting' });

    useEffect(() => {
        ensureConnected();

        // Отправка join; вызывается и при первом коннекте, и при reconnect
        const doJoin = () => {
            socket.emit('session:join', { role, name }, (res) => {
                if (res.ok) {
                    setJoinState({ status: 'joined', state: res.data });
                } else {
                    setJoinState({ status: 'error', error: res.error });
                }
            });
        };

        const onConnect = () => doJoin();

        const onStateUpdate = (state: GameState) => {
            setJoinState((prev) => {
                // Сохраняем статус joined, просто обновляем state
                if (prev.status === 'joined') return { status: 'joined', state };
                return { status: 'joined', state };
            });
        };

        const onKicked = (reason: AccessError) => {
            setJoinState({ status: 'kicked', reason });
        };

        const onError = (message: string) => {
            // Показываем как ошибку, но не выходим из сессии — это soft-error
            console.warn('[game:error]', message);
        };

        const onDisconnect = () => {
            setJoinState({ status: 'disconnected' });
        };

        socket.on('connect', onConnect);
        socket.on('game:state_update', onStateUpdate);
        socket.on('session:kicked', onKicked);
        socket.on('game:error', onError);
        socket.on('disconnect', onDisconnect);

        if (socket.connected) doJoin();

        return () => {
            socket.off('connect', onConnect);
            socket.off('game:state_update', onStateUpdate);
            socket.off('session:kicked', onKicked);
            socket.off('game:error', onError);
            socket.off('disconnect', onDisconnect);
            // Не отключаем socket — он может быть нужен для soundboard и т.п.
            // Отключение происходит при возврате на RoleSelection.
            socket.emit('session:leave');
        };
    }, [role, name]);

    return joinState;
}
