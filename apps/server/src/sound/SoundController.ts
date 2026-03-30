import {SoundId} from '@millu/shared';

/**
 * Трекает какие звуки сейчас активны по команде режиссёра.
 * Это нужно для подсветки активных звуков в UI саундборда,
 * а также чтобы новый подключившийся клиент знал что играет.
 *
 * Серверу не важно играют ли звуки физически на клиенте. Он просто
 * помнит какие PLAY отправил без STOP. Для залупленных звуков
 * это важно, для коротких не так важно, но общая модель одна.
 */
export class SoundController {
  private active = new Set<SoundId>();

  onPlay(id: SoundId): void {
    this.active.add(id);
  }

  onStop(id: SoundId): void {
    this.active.delete(id);
  }

  onStopAll(): void {
    this.active.clear();
  }

  /** Снимок активных звуков для GameState. */
  snapshot(): SoundId[] {
    return Array.from(this.active);
  }
}
