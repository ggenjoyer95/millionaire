import type { LifelinesState, LifelineId } from '@millu/shared';

/**
 * Иконки трёх подсказок (ТЗ 4.1.1 § 3).
 *
 * Отображение статуса:
 *   - доступна (used=false)      — полноцветная;
 *   - активна (active=true)      — с glow-эффектом;
 *   - использована (used=true)   — с красной перечёркнутой линией.
 *
 * Если onActivate передан — иконки кликабельны (режим режиссёра/ведущего).
 * Для игрока просто отображение без возможности нажать.
 */
interface Props {
    lifelines: LifelinesState;
    onActivate?: (id: LifelineId) => void;
    disabled?: boolean;
}

const META: Array<{ id: LifelineId; label: string; symbol: string }> = [
    { id: 'FIFTY_FIFTY',    label: '50 : 50',     symbol: '50\u200A:\u200A50' },
    { id: 'PHONE_A_FRIEND', label: 'Звонок другу', symbol: '☎' },
    { id: 'ASK_AUDIENCE',   label: 'Помощь зала',  symbol: '👥' },
];

export function LifelineIcons({ lifelines, onActivate, disabled = false }: Props) {
    return (
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', alignItems: 'center' }}>
            {META.map((m) => {
                const l = lifelines[m.id];
                const isUsed = l.used;
                const isActive = l.active;

                const canActivate = !!onActivate && !isUsed && !disabled;

                return (
                    <button
                        key={m.id}
                        disabled={!canActivate}
                        onClick={() => canActivate && onActivate!(m.id)}
                        title={m.label + (isUsed ? ' (использовано)' : '')}
                        style={{
                            position: 'relative',
                            width: 72, height: 72, borderRadius: '50%',
                            background: isActive
                                ? 'radial-gradient(circle, #f5c542 0%, #a77c18 100%)'
                                : (isUsed ? '#3a3f54' : 'radial-gradient(circle, #294b8a 0%, #0f1d3d 100%)'),
                            color: isUsed ? '#7a7f94' : '#fff',
                            fontSize: m.id === 'FIFTY_FIFTY' ? 14 : 24,
                            fontWeight: 'bold',
                            border: isActive ? '3px solid #fff' : '2px solid rgba(255,255,255,0.3)',
                            boxShadow: isActive ? '0 0 18px 4px rgba(245,197,66,0.7)' : 'none',
                            cursor: canActivate ? 'pointer' : 'default',
                            transition: 'all 0.3s',
                            fontFamily: 'Georgia, serif',
                        }}
                    >
                        {m.symbol}
                        {isUsed && (
                            <span style={{
                                position: 'absolute', inset: 0, display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                pointerEvents: 'none',
                            }}>
                                <span style={{
                                    width: '100%', height: 3, background: '#e11d48',
                                    transform: 'rotate(-30deg)', borderRadius: 2,
                                }} />
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
