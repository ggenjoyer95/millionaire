import type { AudiencePoll as AudiencePollT } from '@millu/shared';
import { ANSWER_LABELS } from '@millu/shared';

interface Props {
    poll: AudiencePollT;
}

/**
 * Визуализация результата «Помощь зала» (ТЗ 4.1.1 § 3.3).
 * Горизонтальные столбцы с процентами — классика жанра.
 */
export function AudiencePollView({ poll }: Props) {
    const max = Math.max(...poll, 1);
    return (
        <div style={{
            width: '100%', maxWidth: 500,
            padding: 20, borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(15,25,65,0.95) 0%, rgba(5,10,30,0.95) 100%)',
            border: '1px solid #3366cc',
        }}>
            <div style={{ color: '#f5c542', fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>
                Помощь зала
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 180, justifyContent: 'space-around' }}>
                {poll.map((pct, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <div style={{ color: '#fff', fontSize: 14, marginBottom: 4 }}>{pct}%</div>
                        <div style={{
                            width: '100%', maxWidth: 60,
                            height: `${(pct / max) * 140}px`,
                            background: 'linear-gradient(180deg, #f5c542 0%, #a77c18 100%)',
                            borderRadius: '4px 4px 0 0',
                            border: '1px solid #ffe58a',
                            transition: 'height 0.5s ease',
                        }} />
                        <div style={{ color: '#f5c542', fontWeight: 'bold', marginTop: 6 }}>{ANSWER_LABELS[i]}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
