import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import type {GameState, SoundId} from '@millu/shared';
import {socket, disconnect} from '../net/socket';
import {useGameState} from '../net/useGameState';
import {soundManager} from '../sound/SoundManager';
import {Shell} from '../components/Shell';
import {QuestionCard} from '../components/QuestionCard';
import {LifelineIcons} from '../components/LifelineIcons';

/**
 * Интерфейс ведущего.
 * Функции: отображение вопроса, выбор варианта, фиксация,
 * индикатор статусов подсказок. Стадии LOBBY, INTRO, QUESTION_ARMED
 * не показывают вопрос - только ждут команды от режиссёра.
 */
export function HostPage() {
  const navigate = useNavigate();
  const js = useGameState('host');
  const [showCorrectMarker, setShowCorrectMarker] = useState(true);

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

  if (js.status === 'connecting') {
    return <Shell title="Ведущий" onBack={exit}><Center>Подключение...</Center></Shell>;
  }
  if (js.status === 'disconnected') {
    return (
      <Shell title="Ведущий" onBack={exit}>
        <Center>Нет связи с сервером. Пытаемся переподключиться...</Center>
      </Shell>
    );
  }
  if (js.status === 'kicked') {
    return (
      <Shell title="Ведущий" onBack={exit}>
        <Center>Не удалось занять роль: {js.reason}</Center>
      </Shell>
    );
  }
  if (js.status === 'error') {
    return <Shell title="Ведущий" onBack={exit}><Center>Ошибка: {js.error}</Center></Shell>;
  }

  const state = js.state;

  const selectAnswer = (i: number) => socket.emit('host:select_answer', i);
  const lockAnswer = () => socket.emit('host:lock_answer', (res) => {
    if (!res.ok) console.warn('[lock rejected]', res.error);
  });

  // Ведущий видит вопрос только с QUESTION_SHOW и позже.
  // В LOBBY/INTRO/QUESTION_ARMED ведущий ждёт.
  const isWaiting = state.stage === 'LOBBY' ||
    state.stage === 'INTRO' ||
    state.stage === 'QUESTION_ARMED';

  if (isWaiting) {
    return (
      <Shell title="Ведущий" onBack={exit}>
        <Center>
          <div style={{textAlign: 'center'}}>
            <div style={{fontSize: 28, color: '#f5c542', marginBottom: 10}}>Ожидание</div>
            <div style={{color: '#cbd5e1'}}>
              {state.stage === 'LOBBY' && 'Режиссёр ещё не запустил игру'}
              {state.stage === 'INTRO' && 'Заставка...'}
              {state.stage === 'QUESTION_ARMED' && 'Режиссёр готовит вопрос'}
            </div>
          </div>
        </Center>
      </Shell>
    );
  }

  if (state.stage === 'END') {
    return <Shell title="Ведущий" onBack={exit}><FinalScreen state={state} /></Shell>;
  }

  if (!state.currentQuestion) {
    return <Shell title="Ведущий" onBack={exit}><Center>Нет вопроса</Center></Shell>;
  }

  return (
    <Shell title={`Ведущий, вопрос ${state.currentQuestionIndex + 1}/15`} onBack={exit}>
      <div style={{
        flex: 1, padding: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
      }}>
        <div className="host-meta">
          <span>Стадия: <b style={{color: '#f5c542'}}>{state.stage}</b></span>
          <span>Взято: <b style={{color: '#86efac'}}>
            {state.currentMoney.toLocaleString('ru-RU')} руб.
          </b></span>
          <span>Несгораемая: <b>
            {state.guaranteedMoney.toLocaleString('ru-RU')} руб.
          </b></span>
          <label style={{cursor: 'pointer'}}>
            <input
              type="checkbox"
              checked={showCorrectMarker}
              onChange={(e) => setShowCorrectMarker(e.target.checked)}
              style={{marginRight: 4}}
            />
            показывать правильный
          </label>
        </div>

        <LifelineIcons lifelines={state.lifelines} />

        <QuestionCard
          question={state.currentQuestion}
          stage={state.stage}
          selectedIndex={state.selectedAnswerIndex}
          isRevealed={state.isCorrectAnswerRevealed}
          hiddenAnswers={state.hiddenAnswers}
          onSelect={selectAnswer}
          showCorrectMarker={showCorrectMarker}
        />

        {state.stage === 'QUESTION_SHOW' && (
          <button
            onClick={lockAnswer}
            disabled={state.selectedAnswerIndex === null}
            style={{
              padding: '14px 40px', fontSize: 18, fontWeight: 'bold',
              background: state.selectedAnswerIndex === null
                ? '#1e293b'
                : 'linear-gradient(180deg, #f5c542 0%, #a77c18 100%)',
              color: state.selectedAnswerIndex === null ? '#475569' : '#000',
              border: `2px solid ${
                state.selectedAnswerIndex === null ? '#334155' : '#ffe58a'
              }`,
              borderRadius: 10,
              cursor: state.selectedAnswerIndex === null ? 'not-allowed' : 'pointer',
              letterSpacing: 2,
              boxShadow: state.selectedAnswerIndex !== null
                ? '0 0 20px rgba(245,197,66,0.6)' : 'none',
            }}
          >
            ЗАФИКСИРОВАТЬ ОТВЕТ
          </button>
        )}

        {state.stage === 'ANSWER_LOCK' && (
          <div style={{color: '#f5c542', fontSize: 18}}>
            Ответ зафиксирован. Ожидание режиссёра...
          </div>
        )}

        {state.stage === 'REVEAL' && (
          <div style={{
            fontSize: 22,
            color: state.currentQuestion.answers[state.selectedAnswerIndex ?? -1]?.isCorrect
              ? '#86efac' : '#fca5a5',
          }}>
            {state.currentQuestion.answers[state.selectedAnswerIndex ?? -1]?.isCorrect
              ? 'Правильно!' : 'Неправильно'}
          </div>
        )}

        {state.currentQuestion.comment && showCorrectMarker && (
          <div style={{
            padding: 10, borderRadius: 8, maxWidth: 700,
            background: 'rgba(59,130,246,0.1)', borderLeft: '3px solid #3b82f6',
            color: '#dbeafe', fontSize: 13,
          }}>
            {state.currentQuestion.comment}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Center({children}: {children: React.ReactNode}) {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#cbd5e1', fontSize: 18,
    }}>
      {children}
    </div>
  );
}

function FinalScreen({state}: {state: GameState}) {
  const isWin = state.endReason === 'WIN_MILLION';
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{textAlign: 'center', padding: 40}}>
        <div style={{
          fontSize: 32, color: isWin ? '#f5c542' : '#fca5a5', marginBottom: 20,
        }}>
          {isWin ? 'ПОБЕДА' : 'Игра окончена'}
        </div>
        <div style={{fontSize: 48, color: '#f5c542', fontWeight: 'bold'}}>
          {state.currentMoney.toLocaleString('ru-RU')} руб.
        </div>
      </div>
    </div>
  );
}
