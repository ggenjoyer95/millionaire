import {randomUUID} from 'node:crypto';
import {EventLogEntry, EventLogLevel} from '@millu/shared';

/**
 * Журнал событий для панели режиссёра.
 * Кольцевой буфер на MAX_ENTRIES записей, подписка на новые записи.
 */
export class EventLog {
  private static readonly MAX_ENTRIES = 200;

  private entries: EventLogEntry[] = [];
  private subscribers = new Set<(entry: EventLogEntry) => void>();

  append(level: EventLogLevel, tag: string, message: string): EventLogEntry {
    const entry: EventLogEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      level,
      tag,
      message,
    };
    this.entries.push(entry);
    if (this.entries.length > EventLog.MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - EventLog.MAX_ENTRIES);
    }
    console.log(`[${level}] ${tag}: ${message}`);
    for (const sub of this.subscribers) sub(entry);
    return entry;
  }

  info(tag: string, message: string): EventLogEntry {
    return this.append('INFO', tag, message);
  }

  warn(tag: string, message: string): EventLogEntry {
    return this.append('WARN', tag, message);
  }

  error(tag: string, message: string): EventLogEntry {
    return this.append('ERROR', tag, message);
  }

  /** Последние N записей. */
  recent(limit = 30): EventLogEntry[] {
    return this.entries.slice(-limit);
  }

  /** Подписка на новые записи. Возвращает функцию отписки. */
  subscribe(fn: (entry: EventLogEntry) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }
}
