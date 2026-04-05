import type { Question, GameStage } from '@millu/shared';
import { ANSWER_LABELS } from '@millu/shared';

/**
 * Отрисовка вопроса и 4 вариантов в стиле шоу «Миллионер».
 * Используется на всех экранах — у режиссёра, ведущего и игрока,
 * но с разными props:
 *   - ведущий может кликать варианты → onSelect;
 *   - игрок и режиссёр просто смотрят;
 *   - у ведущего (и опционально у режиссёра) можно включить
 *     showCorrectToHost — галочка правильного ответа.
 */

interface Props {
    question: Question;
    stage: GameStage;
    selectedIndex: number | null;
    isRevealed: boolean;
    hiddenAnswers: number[];
    onSelect?: (index: number) => void;
    /** Показывать ли служебную метку правильного ответа рядом с буквой (только для host при соответствующей настройке). */
    showCorrectMarker?: boolean;
}

export function QuestionCard({
    question, stage, selectedIndex, isRevealed, hiddenAnswers,
    onSelect, showCorrectMarker = false,
}: Props) {
    const canPickAnswer = !!onSelect && stage === 'QUESTION_SHOW';

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
            {/* Текст вопроса */}
            <div style={{
                width: '100%', maxWidth: 900,
                padding: '28px 40px', minHeight: 120,
                background: 'linear-gradient(180deg, rgba(25,35,85,0.95) 0%, rgba(10,15,45,0.95) 100%)',
                border: '2px solid #3366cc',
                borderRadius: 40,
                color: '#fff',
                fontSize: 'clamp(18px, 2.4vw, 28px)',
                textAlign: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Georgia, serif',
                lineHeight: 1.4,
                textShadow: '0 2px 6px rgba(0,0,0,0.8)',
            }}>
                {question.text}
            </div>

            {/* 4 варианта */}
            <div className="answers-grid">
                {question.answers.map((ans, idx) => {
                    const isHidden = hiddenAnswers.includes(idx);
                    const isSelected = selectedIndex === idx;
                    const isLocked = stage === 'ANSWER_LOCK' && isSelected;
                    const isCorrectHighlight = isRevealed && ans.isCorrect;
                    const isWrongReveal = isRevealed && isSelected && !ans.isCorrect;

                    // Цветовая схема как в шоу
                    let bg = 'linear-gradient(180deg, #16244d 0%, #0a102b 100%)';
                    let border = '#3366cc';
                    let color = '#fff';

                    if (isHidden) {
                        bg = 'rgba(20,20,30,0.4)';
                        color = 'transparent';
                        border = 'rgba(80,90,120,0.4)';
                    } else if (isCorrectHighlight) {
                        bg = 'linear-gradient(180deg, #22c55e 0%, #14532d 100%)';
                        border = '#4ade80';
                    } else if (isWrongReveal) {
                        bg = 'linear-gradient(180deg, #dc2626 0%, #4c0510 100%)';
                        border = '#f87171';
                    } else if (isLocked) {
                        bg = 'linear-gradient(180deg, #f5c542 0%, #a77c18 100%)';
                        border = '#ffe58a';
                        color = '#000';
                    } else if (isSelected) {
                        bg = 'linear-gradient(180deg, #fb923c 0%, #7c2d12 100%)';
                        border = '#ffedd5';
                    }

                    return (
                        <button
                            key={idx}
                            disabled={!canPickAnswer || isHidden}
                            onClick={() => canPickAnswer && !isHidden && onSelect?.(idx)}
                            style={{
                                padding: '14px 20px',
                                minHeight: 64,
                                fontSize: 'clamp(14px, 1.6vw, 20px)',
                                fontFamily: 'Georgia, serif',
                                textAlign: 'left',
                                background: bg,
                                color, border: `2px solid ${border}`,
                                borderRadius: 40,
                                cursor: canPickAnswer && !isHidden ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', gap: 14,
                                transition: 'all 0.3s',
                                boxShadow: isLocked || isCorrectHighlight ? '0 0 16px rgba(245,197,66,0.6)' : 'none',
                            }}
                        >
                            <span style={{
                                color: isLocked || isCorrectHighlight ? '#000' : '#f5c542',
                                fontWeight: 'bold',
                                minWidth: 24,
                            }}>
                                {ANSWER_LABELS[idx]}:
                            </span>
                            <span style={{ flex: 1 }}>{ans.text}</span>
                            {showCorrectMarker && ans.isCorrect && !isRevealed && (
                                <span style={{ color: '#86efac', fontSize: 14 }}>✓</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
