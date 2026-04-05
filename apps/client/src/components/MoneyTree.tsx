import { MONEY_LADDER, SAFE_HAVEN_LEVELS } from '@millu/shared';

/**
 * Денежное дерево (ТЗ 4.1.1 § 2.1, 2.2).
 *
 * Отрисовка сверху вниз: 15 → 1, чтобы визуально соответствовать
 * оригинальному шоу.
 *
 * Props:
 *   - moneyTreeLevel: сколько уровней пройдено (0..15). Уровень "currentQuestionIndex+1"
 *     в стадии QUESTION_SHOW подсвечивается как "на котором игрок сейчас",
 *     это передаётся через highlightLevel (1..15).
 */
interface Props {
    /** Уже взятые уровни (0..15). */
    moneyTreeLevel: number;
    /** Какой уровень сейчас «обсуждается» (1..15), для подсветки. */
    highlightLevel?: number;
    /** Компактная версия (для ведущего/режиссёра). */
    compact?: boolean;
}

const formatMoney = (n: number) => {
    // Разбиение на разряды пробелом в русской локали
    return new Intl.NumberFormat('ru-RU').format(n) + ' руб.';
};

export function MoneyTree({ moneyTreeLevel, highlightLevel, compact = false }: Props) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', gap: compact ? 2 : 4,
            padding: compact ? 10 : 16, width: '100%',
            fontFamily: 'Georgia, serif',
        }}>
            {/* 15 → 1 */}
            {Array.from({ length: 15 }, (_, i) => 15 - i).map((level) => {
                const money = MONEY_LADDER[level - 1];
                const isPassed = level <= moneyTreeLevel;
                const isCurrent = level === highlightLevel;
                const isSafeHaven = SAFE_HAVEN_LEVELS.includes(level - 1);

                let bg = 'transparent';
                let color = '#f5c542';
                let weight: 'bold' | 'normal' = 'normal';

                if (isCurrent) { bg = '#f5c542'; color = '#000'; weight = 'bold'; }
                else if (isPassed) { color = '#9aa0b3'; }
                else if (isSafeHaven) { color = '#ffffff'; weight = 'bold'; }

                return (
                    <div key={level} style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: compact ? '2px 8px' : '6px 14px',
                        borderRadius: 20,
                        background: bg,
                        color,
                        fontWeight: weight,
                        fontSize: compact ? 13 : 16,
                        border: isSafeHaven && !isCurrent ? '1px solid rgba(255,255,255,0.25)' : '1px solid transparent',
                        transition: 'all 0.25s ease',
                    }}>
                        <span style={{ minWidth: 20, textAlign: 'right', marginRight: 8 }}>{level}</span>
                        <span>{formatMoney(money)}</span>
                    </div>
                );
            })}
        </div>
    );
}
