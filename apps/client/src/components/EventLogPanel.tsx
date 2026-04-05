import type {EventLogEntry} from '@millu/shared';

interface Props {
  entries: EventLogEntry[];
}

const levelColor = (level: EventLogEntry['level']): string => {
  switch (level) {
    case 'INFO': return '#86efac';
    case 'WARN': return '#fcd34d';
    case 'ERROR': return '#fca5a5';
  }
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

/**
 * Журнал событий с компактным стилем.
 * Каждая запись на одной строке без переноса. Если строка не помещается,
 * включается горизонтальный скролл всей панели чтобы пользователь мог
 * прокрутить и увидеть полный текст.
 */
export function EventLogPanel({entries}: Props) {
  return (
    <div
      style={{
        background: '#0a1228',
        border: '1px solid #3366cc',
        borderRadius: 6,
        padding: '6px 8px',
        maxHeight: 280,
        overflowX: 'auto',
        overflowY: 'auto',
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 10,
        lineHeight: 1.3,
      }}
    >
      {entries.length === 0 && (
        <div style={{color: '#64748b', textAlign: 'center', padding: 20}}>
          пока нет событий
        </div>
      )}
      {entries.map((e) => (
        <div
          key={e.id}
          style={{
            display: 'flex',
            gap: 5,
            alignItems: 'baseline',
            padding: '1px 0',
            whiteSpace: 'nowrap',
            // Не сжимаем строку чтобы скролл показывал полный текст
            width: 'max-content',
            minWidth: '100%',
          }}
        >
          <span style={{color: '#64748b', flexShrink: 0}}>{formatTime(e.timestamp)}</span>
          <span style={{color: levelColor(e.level), width: 32, flexShrink: 0}}>
            {e.level}
          </span>
          <span style={{color: '#94a3b8', flexShrink: 0, minWidth: 90}}>{e.tag}</span>
          <span style={{color: '#e2e8f0'}}>{e.message}</span>
        </div>
      ))}
    </div>
  );
}
