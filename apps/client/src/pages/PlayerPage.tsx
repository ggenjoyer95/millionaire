import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SoundId } from '@millu/shared';
import { socket, disconnect } from '../net/socket';
import { useGameState } from '../net/useGameState';
import { soundManager } from '../sound/SoundManager';
import { QuestionCard } from '../components/QuestionCard';
import { MoneyTree } from '../components/MoneyTree';
import { LifelineIcons } from '../components/LifelineIcons';
import { AudiencePollView } from '../components/AudiencePoll';

/**
 * Игровой экран (ТЗ 4.1.5 п. 4).
 *
 * Полная ширина экрана без header'а — рассчитано на проектор/телевизор.
 * Никаких управляющих элементов — игрок только смотрит.
 * Слева: вопрос, подсказки, «помощь зала» (если активирована).
 * Справа: денежное дерево.
 *
 * Маленькая кнопка «в меню» в углу — чтобы можно было вернуться.
 */
export function PlayerPage() {
    const navigate = useNavigate();
    const js = useGameState('player');
    const [muted, setMuted] = useState(false);

    useEffect(() => {
        const onPlay = (id: SoundId) => soundManager.play(id);
        const onStop = (id: SoundId) => soundManager.stop(id);
        const onStopAll = () => soundManager.stopAll();
        socket.on('game:play_sound', onPlay);
        socket.on('game:stop_sound', onStop);
        socket.on('game:stop_all_sounds', onStopAll);
        return () => {
            socket.off('game:play_sound', onPlay);
            socket.off('game:stop_sound', onStop);
            socket.off('game:stop_all_sounds', onStopAll);
        };
    }, []);

    const exit = () => { disconnect(); navigate('/'); };

    // Единый контейнер «на весь экран»
    const FullBg = ({ children }: { children: React.ReactNode }) => (
        <div style={{
            minHeight: '100vh', width: '100vw',
            // Фон студии
            background: 'url(/images/bg.jpg) center/cover no-repeat, radial-gradient(ellipse at center, #1a2a6c 0%, #0a0f2e 60%, #000008 100%)',
            color: '#fff', position: 'relative', overflow: 'hidden',
            fontFamily: 'Georgia, serif',
        }}>
            {/* Затемняющий слой для читаемости */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,10,0.45)',
                pointerEvents: 'none',
            }} />
            <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', width: '100%' }}>
                {/* Мини-элементы управления в углу — не влияют на игровой вид */}
                <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 8, zIndex: 50 }}>
                    <button onClick={exit} style={{ padding: '4px 10px', fontSize: 12, background: 'rgba(0,0,0,0.5)', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer' }}>меню</button>
                    <button onClick={() => setMuted(soundManager.toggleMute())} style={{ padding: '4px 10px', fontSize: 12, background: 'rgba(0,0,0,0.5)', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer' }}>
                        {muted ? 'mute' : 'sound'}
                    </button>
                </div>
                {children}
            </div>
        </div>
    );

    if (js.status === 'connecting') return <FullBg><Center>Подключение к серверу…</Center></FullBg>;
    if (js.status === 'disconnected') return <FullBg><Center>Нет связи с сервером</Center></FullBg>;
    if (js.status === 'kicked') return <FullBg><Center>Сессия завершена: {js.reason}</Center></FullBg>;
    if (js.status === 'error') return <FullBg><Center>{js.error}</Center></FullBg>;

    const state = js.state;

    if (state.stage === 'LOBBY') {
        return <FullBg>
            <Center>
                <div style={{ textAlign: 'center' }}>
                    <img src="/images/logo.png" alt="Кто хочет стать миллионером" style={{
                        width: 'clamp(220px, 28vw, 360px)',
                        marginBottom: 30,
                        filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.9))',
                    }} />
                    <div style={{ fontSize: 'clamp(1.5rem,4vw,2.8rem)', color: '#f5c542', textShadow: '0 4px 16px rgba(0,0,0,0.8)' }}>
                        Кто хочет стать миллионером?
                    </div>
                    <div style={{ marginTop: 40, color: '#cbd5e1', fontSize: 18 }}>
                        Ожидание старта игры…
                    </div>
                </div>
            </Center>
        </FullBg>;
    }

    if (state.stage === 'INTRO' || state.stage === 'QUESTION_ARMED') {
        // Если вопрос ещё не показывали ни разу, на экране игрока стоит надпись
        // ОЖИДАНИЕ. Когда уже был хотя бы один пройденный вопрос, перед каждым
        // следующим показываем СЛЕДУЮЩИЙ ВОПРОС.
        const isFirstQuestion = state.moneyTreeLevel === 0;
        let label: string;
        if (state.stage === 'INTRO') {
            label = 'ИГРА НАЧИНАЕТСЯ';
        } else if (isFirstQuestion) {
            label = 'ОЖИДАНИЕ';
        } else {
            label = 'СЛЕДУЮЩИЙ ВОПРОС';
        }
        return <FullBg>
            <Center>
                <div style={{ fontSize: 'clamp(2.5rem,8vw,6rem)', color: '#f5c542', fontWeight: 'bold', textShadow: '0 0 40px rgba(245,197,66,0.6)', animation: 'pulse 2s ease-in-out infinite' }}>
                    {label}
                </div>
            </Center>
        </FullBg>;
    }

    if (state.stage === 'END') {
        const isWin = state.endReason === 'WIN_MILLION';
        return <FullBg>
            <Center>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 'clamp(3rem,10vw,7rem)', color: isWin ? '#f5c542' : '#fca5a5', fontWeight: 'bold', textShadow: '0 0 40px currentColor', marginBottom: 30 }}>
                        {isWin ? 'МИЛЛИОНЕР!' : 'ИГРА ОКОНЧЕНА'}
                    </div>
                    <div style={{ fontSize: 'clamp(2rem,6vw,4rem)', color: '#fff' }}>
                        Выигрыш
                    </div>
                    <div style={{ fontSize: 'clamp(3rem,8vw,6rem)', color: '#f5c542', fontWeight: 'bold', marginTop: 10 }}>
                        {state.currentMoney.toLocaleString('ru-RU')} руб.
                    </div>
                </div>
            </Center>
        </FullBg>;
    }

    // QUESTION_SHOW / ANSWER_LOCK / REVEAL / RESULT — основной игровой вид
    if (!state.currentQuestion) {
        return <FullBg><Center>Загрузка вопроса…</Center></FullBg>;
    }

    return <FullBg>
        <div className="player-grid">
            {/* Левая часть — вопрос и подсказки */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 20px', gap: 24 }}>
                <LifelineIcons lifelines={state.lifelines} />
                <QuestionCard
                    question={state.currentQuestion}
                    stage={state.stage}
                    selectedIndex={state.selectedAnswerIndex}
                    isRevealed={state.isCorrectAnswerRevealed}
                    hiddenAnswers={state.hiddenAnswers}
                />
                {/* Результат «Помощь зала» — только если активирована */}
                {state.lifelines.ASK_AUDIENCE.active && state.audiencePoll && (
                    <AudiencePollView poll={state.audiencePoll} />
                )}
                {/* Индикация «Звонок другу» */}
                {state.lifelines.PHONE_A_FRIEND.active && (
                    <div style={{
                        padding: '14px 24px', borderRadius: 40,
                        background: 'rgba(59,130,246,0.15)', border: '2px solid #3b82f6',
                        color: '#dbeafe', fontSize: 20,
                    }}>
                        📞 Звонок другу…
                    </div>
                )}
            </div>

            {/* Правая часть — денежное дерево */}
            <div style={{ background: 'rgba(0,0,0,0.35)', borderLeft: '1px solid rgba(51,102,204,0.35)', padding: 0, overflow: 'auto' }}>
                <MoneyTree moneyTreeLevel={state.moneyTreeLevel}
                    highlightLevel={state.currentQuestionIndex + 1} />
            </div>
        </div>
    </FullBg>;
}

function Center({ children }: { children: React.ReactNode }) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
}
