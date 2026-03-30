import fs from 'node:fs';
import path from 'node:path';
import {SerializedGame} from '../game/GameStateMachine.js';

/**
 * Сохранение и восстановление состояния игры на диск.
 * Простое файловое хранилище в формате JSON.
 *
 * Почему не Redis: у нас локальная игра в LAN без параллельных
 * процессов и кластеризации. Файл проще в установке и полностью
 * покрывает требование "выживания перезапуска сервера".
 */
export class GameStorage {
  private readonly filePath: string;

  constructor(dir: string, filename = 'game-state.json') {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {recursive: true});
    }
    this.filePath = path.join(dir, filename);
  }

  /** Попытка загрузить сохранённое состояние. */
  load(): SerializedGame | null {
    if (!fs.existsSync(this.filePath)) return null;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SerializedGame;
      if (!parsed.state || !Array.isArray(parsed.questions)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Сохраняет состояние атомарно через временный файл.
   * Это защищает от повреждения при падении процесса в момент записи.
   */
  save(data: SerializedGame): void {
    const tmp = this.filePath + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.filePath);
    } catch {
      // Не падаем при ошибке записи, логирование делается снаружи
    }
  }

  /** Полное удаление сохранения. */
  clear(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}
