import {ConnectedClient, UserRole} from '@millu/shared';

export type JoinResult =
  | {ok: true; client: ConnectedClient}
  | {ok: false; error: 'ROLE_TAKEN' | 'NO_DIRECTOR'};

/**
 * Управление подключёнными клиентами и распределение ролей.
 *
 * Правила:
 *   Режиссёр один на сессию.
 *   Ведущий один на сессию.
 *   Игроков сколько угодно.
 *   Без режиссёра другие роли занять нельзя.
 *
 *   Случайный disconnect режиссёра или ведущего резервирует роль
 *   на GRACE_MS миллисекунд, чтобы они могли переподключиться.
 *   Добровольный выход (session:leave или возврат в меню) снимает
 *   роль немедленно без резервации.
 */
export class SessionManager {
  private static readonly GRACE_MS = 60_000;

  private clients = new Map<string, ConnectedClient>();
  private roleReservations = new Map<UserRole, number>();

  tryJoin(
    socketId: string,
    role: UserRole,
    name: string,
    hasDirectorOnline: boolean,
  ): JoinResult {
    if (role !== 'director' && !hasDirectorOnline) {
      return {ok: false, error: 'NO_DIRECTOR'};
    }

    if (role === 'director' || role === 'host') {
      const currentOwner = this.getByRole(role);
      if (currentOwner) {
        return {ok: false, error: 'ROLE_TAKEN'};
      }
      const reservedUntil = this.roleReservations.get(role);
      if (reservedUntil && reservedUntil > Date.now()) {
        return {ok: false, error: 'ROLE_TAKEN'};
      }
    }

    const client: ConnectedClient = {
      socketId,
      role,
      name: name.trim() || this.defaultName(role),
      connectedAt: Date.now(),
    };
    this.clients.set(socketId, client);
    this.roleReservations.delete(role);
    return {ok: true, client};
  }

  /**
   * Случайное отключение клиента.
   * Для режиссёра и ведущего ставится grace period для переподключения.
   */
  onDisconnect(socketId: string): ConnectedClient | null {
    const client = this.clients.get(socketId);
    if (!client) return null;
    this.clients.delete(socketId);
    if (client.role === 'director' || client.role === 'host') {
      this.roleReservations.set(client.role, Date.now() + SessionManager.GRACE_MS);
    }
    return client;
  }

  /**
   * Добровольный выход (нажал в меню).
   * Роль освобождается немедленно без резервации.
   */
  onVoluntaryLeave(socketId: string): ConnectedClient | null {
    const client = this.clients.get(socketId);
    if (!client) return null;
    this.clients.delete(socketId);
    // Снимаем резервацию если она была от предыдущего disconnect
    this.roleReservations.delete(client.role);
    return client;
  }

  getClient(socketId: string): ConnectedClient | undefined {
    return this.clients.get(socketId);
  }

  getByRole(role: UserRole): ConnectedClient | undefined {
    for (const c of this.clients.values()) {
      if (c.role === role) return c;
    }
    return undefined;
  }

  getDirector(): ConnectedClient | undefined {
    return this.getByRole('director');
  }

  allClients(): ConnectedClient[] {
    return Array.from(this.clients.values()).sort((a, b) => a.connectedAt - b.connectedAt);
  }

  hasDirector(): boolean {
    return !!this.getDirector();
  }

  clearReservations(): void {
    this.roleReservations.clear();
  }

  private defaultName(role: UserRole): string {
    if (role === 'director') return 'Режиссёр';
    if (role === 'host') return 'Ведущий';
    return 'Игрок';
  }
}
