import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import type {DirectorCommand, GameStage, GameState, LifelineId, SoundId} from '@millu/shared';
import {socket, disconnect} from '../net/socket';
import {useGameState} from '../net/useGameState';
import {soundManager} from '../sound/SoundManager';
import {Shell} from '../components/Shell';
import {EventLogPanel} from '../components/EventLogPanel';
import {MoneyTree} from '../components/MoneyTree';

/**
 * Пульт управления режиссёра.
 * Содержит блоки: стадии, текущий вопрос, подсказки, саундборд,
 * дерево, список клиентов, журнал событий, выбор пакета.
 * Все действия отправляются на сервер как director:command.
 */

const STAGE_LABELS: Record<GameStage, string> = {
  LOBBY: 'Лобби',
  INTRO: 'Заставка',
  QUESTION_ARMED: 'Вопрос готов (только у режиссёра)',
  QUESTION_SHOW: 'Показ вопроса',
  ANSWER_LOCK: 'Ответ зафиксирован',
  REVEAL: 'Раскрытие',
  RESULT: 'Результат',
  END: 'Конец игры',
};

/** Звук в саундборде с кастомной меткой. */
interface SoundboardItem {
  id: SoundId;
  label: string;
}

/** Список звуков в саундборде сгруппированный для удобства. */
const SOUNDBOARD_GROUPS: Array<{title: string; items: SoundboardItem[]}> = [
  {
    title: 'Заставки',
    items: [
      {id: 'INTRO',       label: 'intro'},
      {id: 'LETS_PLAY',   label: 'lets play'},
      {id: 'MAIN_SHORT',  label: 'main short'},
      {id: 'FANFARE',     label: 'fanfare'},
      {id: 'CLOSING',     label: 'closing'},
      {id: 'GOODBYE',     label: 'goodbye'},
    ],
  },
  {
    title: 'Фоновая музыка',
    items: [
      {id: 'BGM_Q1_5', label: 'bgm q1 5'},
      {id: 'BGM_Q6',   label: 'bgm q6'},
      {id: 'BGM_Q7',   label: 'bgm q7'},
      {id: 'BGM_Q8',   label: 'bgm q8'},
      {id: 'BGM_Q9',   label: 'bgm q9'},
      {id: 'BGM_Q10',  label: 'bgm q10'},
      {id: 'BGM_Q11',  label: 'bgm q11'},
      {id: 'BGM_Q12',  label: 'bgm q12'},
      {id: 'BGM_Q13',  label: 'bgm q13'},
      {id: 'BGM_Q14',  label: 'bgm q14'},
      {id: 'BGM_Q15',  label: 'bgm q15'},
    ],
  },
  {
    // Сквозная нумерация звуков ответов: 5 правильных и 4 неправильных.
    // CORRECT_Q5 в отдельном виде в саундборде не показывается, остальные пронумерованы по порядку.
    title: 'Ответы',
    items: [
      {id: 'CORRECT_Q1_5', label: 'correct 1'},
      {id: 'CORRECT_Q6',   label: 'correct 2'},
      {id: 'CORRECT_Q10',  label: 'correct 3'},
      {id: 'CORRECT_Q11',  label: 'correct 4'},
      {id: 'CORRECT_Q15',  label: 'correct 5'},
      {id: 'WRONG_Q1_5',   label: 'wrong 1'},
      {id: 'WRONG_Q6',     label: 'wrong 2'},
      {id: 'WRONG_Q11',    label: 'wrong 3'},
      {id: 'WRONG_Q15',    label: 'wrong 4'},
    ],
  },
  {
    title: 'Подсказки',
    items: [
      {id: 'LIFELINE_FIFTY_FIFTY', label: 'lifeline 50 50'},
      {id: 'LIFELINE_PHONE',       label: 'lifeline'},
      {id: 'PHONE_DIALING',        label: 'phone dialing'},
      {id: 'PHONE_COUNTDOWN',      label: 'phone countdown'},
      {id: 'PHONE_END',            label: 'phone end'},
      {id: 'AUDIENCE_BEGIN',       label: 'audience begin'},
      {id: 'AUDIENCE_VOTING',      label: 'audience voting'},
      {id: 'AUDIENCE_FULL',        label: 'audience full'},
    ],
  },
  {
    title: 'Прочее',
    items: [
      {id: 'LADDER',       label: 'ladder 1'},
      {id: 'LADDER_5_10',  label: 'ladder 2'},
      {id: 'LADDER_START', label: 'ladder start'},
      {id: 'MONEY_1',      label: 'money 1'},
      {id: 'MONEY_2',      label: 'money 2'},
    ],
  },
];

export function DirectorPage() {
  const navigate = useNavigate();
  const js = useGameState('director');
  const [muted, setMuted] = useState(false);

  // Подписка на звуковые события сервера
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

  const exit = () => {
    disconnect();
    navigate('/');
  };

  if (js.status === 'connecting') {
    return <Shell title="Режиссёр" onBack={exit}><Center>Подключение...</Center></Shell>;
  }
  if (js.status === 'disconnected') {
    return (
      <Shell title="Режиссёр" onBack={exit}>
        <Center>Нет связи с сервером. Пытаемся подключиться...</Center>
      </Shell>
    );
  }
  if (js.status === 'kicked') {
    return (
      <Shell title="Режиссёр" onBack={exit}>
        <Center>Не удалось занять роль режиссёра: {js.reason}</Center>
      </Shell>
    );
  }
  if (js.status === 'error') {
    return <Shell title="Режиссёр" onBack={exit}><Center>Ошибка: {js.error}</Center></Shell>;
  }

  const state = js.state;

  const send = (cmd: DirectorCommand) => {
    socket.emit('director:command', cmd, (res) => {
      if (!res.ok) console.warn('[director:command rejected]', cmd.type, res.error);
    });
  };

  // Какая кнопка главная (жёлтая primary) в текущей стадии
  const primary = primaryAction(state);

  return (
    <Shell title="Пульт режиссёра" onBack={exit}>
      <div className="dir-grid">
        {/* Левая колонка */}
        <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
          <StageIndicator state={state} />

          <Card title="Управление стадиями">
            <div className="stage-controls">
              <ControlBtn
                label="СТАРТ"
                onClick={() => send({type: 'START_GAME'})}
                disabled={state.stage !== 'LOBBY'}
                primary={primary === 'START_GAME'}
              />
              <ControlBtn
                label="ПОДГОТОВИТЬ ВОПРОС"
                onClick={() => send({type: 'ARM_QUESTION'})}
                disabled={state.stage !== 'INTRO' && state.stage !== 'RESULT'}
                primary={primary === 'ARM_QUESTION'}
              />
              <ControlBtn
                label="ПОКАЗАТЬ ИГРОКАМ"
                onClick={() => send({type: 'SHOW_QUESTION'})}
                disabled={state.stage !== 'QUESTION_ARMED'}
                primary={primary === 'SHOW_QUESTION'}
              />
              <ControlBtn
                label="ПРОПУСТИТЬ"
                onClick={() => send({type: 'SKIP_QUESTION'})}
                disabled={state.stage !== 'QUESTION_ARMED'}
              />
              <ControlBtn
                label="РАСКРЫТЬ"
                onClick={() => send({type: 'REVEAL_ANSWER'})}
                disabled={state.stage !== 'ANSWER_LOCK'}
                primary={primary === 'REVEAL_ANSWER'}
              />
              <ControlBtn
                label={nextButtonLabel(state)}
                onClick={() => send({type: 'NEXT_QUESTION'})}
                disabled={state.stage !== 'REVEAL' && state.stage !== 'RESULT'}
                primary={primary === 'NEXT_QUESTION'}
              />
              <ControlBtn
                label="ЗАВЕРШИТЬ"
                onClick={() => send({type: 'END_GAME'})}
                disabled={state.stage === 'LOBBY' || state.stage === 'END'}
              />
              <ControlBtn
                label="СБРОС"
                onClick={() => send({type: 'RESET_GAME'})}
                danger
              />
            </div>

            {/*
              Переключатель автоматических звуков. Когда выключен,
              сервер не проигрывает никаких звуков на события игры.
              Когда включён, звуки подбираются автоматически на каждое
              действие: старт, показ вопроса, фиксация, раскрытие,
              подсказка, конец игры.
            */}
            <div style={{marginTop: 10, display: 'flex', alignItems: 'center', gap: 10}}>
              <button
                onClick={() => send({type: 'TOGGLE_AUTO_SOUNDS'})}
                style={{
                  padding: '8px 14px',
                  fontSize: 12,
                  fontWeight: 'bold',
                  background: state.autoSoundsEnabled
                    ? 'linear-gradient(180deg, #f5c542 0%, #a77c18 100%)'
                    : '#16244d',
                  color: state.autoSoundsEnabled ? '#000' : '#f5c542',
                  border: `2px solid ${state.autoSoundsEnabled ? '#ffe58a' : '#3366cc'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: state.autoSoundsEnabled
                    ? '0 0 14px rgba(245,197,66,0.5)' : 'none',
                }}
              >
                АВТОМАТИЧЕСКИЕ ЗВУКИ {state.autoSoundsEnabled ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
              <span style={{fontSize: 11, color: '#94a3b8'}}>
                {state.autoSoundsEnabled
                  ? 'звуки подбираются автоматически на события игры'
                  : 'все звуки только вручную из саундборда'}
              </span>
            </div>

            {state.stage === 'QUESTION_ARMED' && (
              <div style={{marginTop: 10, fontSize: 12, color: '#fcd34d'}}>
                Сейчас вопрос виден только вам. Игрок и ведущий ждут.
                Нажмите ПОКАЗАТЬ ИГРОКАМ, чтобы открыть вопрос, или ПРОПУСТИТЬ,
                если хотите заменить его другим.
              </div>
            )}
          </Card>

          {state.currentQuestion && (state.stage === 'QUESTION_ARMED' ||
              state.stage === 'QUESTION_SHOW' ||
              state.stage === 'ANSWER_LOCK' ||
              state.stage === 'REVEAL' ||
              state.stage === 'RESULT') && (
            <CurrentQuestionCard state={state} />
          )}

          <Card title="Подсказки">
            <div className="lifeline-row">
              <LifelineBtn id="FIFTY_FIFTY" label="50 / 50" state={state.lifelines}
                onSend={send} stage={state.stage} />
              <LifelineBtn id="PHONE_A_FRIEND" label="Звонок другу"
                state={state.lifelines} onSend={send} stage={state.stage} />
              <LifelineBtn id="ASK_AUDIENCE" label="Помощь зала"
                state={state.lifelines} onSend={send} stage={state.stage} />
            </div>
            {state.audiencePoll && (
              <div style={{marginTop: 10, fontSize: 13, color: '#dbeafe'}}>
                Зал: {state.audiencePoll.map((p, i) => `${'ABCD'[i]}=${p}%`).join(' ')}
              </div>
            )}
          </Card>

          <Soundboard
            activeSounds={state.activeSounds}
            onSend={send}
            muted={muted}
            onToggleMute={() => setMuted(soundManager.toggleMute())}
          />
        </div>

        {/* Правая колонка */}
        <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
          <Card title="Дерево выигрышей">
            <MoneyTree
              moneyTreeLevel={state.moneyTreeLevel}
              highlightLevel={state.currentQuestion ? state.currentQuestionIndex + 1 : undefined}
              compact
            />
          </Card>

          <Card title={`Подключено (${state.connectedClients.length})`}>
            {state.connectedClients.length === 0 ? (
              <div style={{color: '#64748b', fontSize: 13}}>никого кроме вас</div>
            ) : (
              state.connectedClients.map((c) => (
                <div
                  key={c.socketId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    fontSize: 13,
                    color:
                      c.role === 'director' ? '#f5c542' :
                      c.role === 'host' ? '#86efac' : '#dbeafe',
                  }}
                >
                  <span>{c.name}</span>
                  <span style={{color: '#64748b'}}>{c.role}</span>
                </div>
              ))
            )}
          </Card>

          <Card title="Журнал событий">
            <EventLogPanel entries={state.recentEvents} />
          </Card>

          <PackLoader
            activePackName={state.activePackName}
            stage={state.stage}
            onLoadPack={(packId) => send({type: 'LOAD_PACK', packId})}
          />
        </div>
      </div>
    </Shell>
  );
}

/** Какую кнопку подсветить жёлтым в текущей стадии. */
function primaryAction(state: GameState): DirectorCommand['type'] | null {
  switch (state.stage) {
    case 'LOBBY': return 'START_GAME';
    case 'INTRO': return 'ARM_QUESTION';
    case 'QUESTION_ARMED': return 'SHOW_QUESTION';
    case 'QUESTION_SHOW': return null; // ждём действий ведущего
    case 'ANSWER_LOCK': return 'REVEAL_ANSWER';
    case 'REVEAL': return 'NEXT_QUESTION';
    case 'RESULT': return 'NEXT_QUESTION';
    case 'END': return null;
    default: return null;
  }
}

/** Подпись кнопки NEXT_QUESTION в зависимости от стадии. */
function nextButtonLabel(state: GameState): string {
  if (state.stage === 'REVEAL') return 'ДАЛЕЕ';
  if (state.stage !== 'RESULT') return 'ДАЛЕЕ';
  const q = state.currentQuestion;
  const i = state.selectedAnswerIndex;
  const isCorrect = q && i !== null && q.answers[i]?.isCorrect === true;
  if (!isCorrect) return 'ЗАВЕРШИТЬ ИГРУ';
  return 'СЛЕДУЮЩИЙ ВОПРОС';
}

// ---------- Вспомогательные компоненты ----------

function StageIndicator({state}: {state: GameState}) {
  return (
    <Card>
      <div className="stage-indicator">
        <div>
          <div style={{color: '#94a3b8', fontSize: 12}}>Стадия</div>
          <div style={{
            fontSize: 'clamp(15px, 2vw, 22px)',
            color: '#f5c542',
            fontWeight: 'bold',
            wordBreak: 'break-word',
          }}>
            {STAGE_LABELS[state.stage]}
          </div>
        </div>
        <div>
          <div style={{color: '#94a3b8', fontSize: 12}}>Вопрос</div>
          <div style={{fontSize: 'clamp(14px, 1.8vw, 20px)', color: '#fff'}}>
            {state.currentQuestion ? state.currentQuestionIndex + 1 : '-'} / 15
          </div>
        </div>
        <div>
          <div style={{color: '#94a3b8', fontSize: 12}}>Взято</div>
          <div style={{
            fontSize: 'clamp(14px, 1.8vw, 20px)',
            color: '#86efac',
            wordBreak: 'break-word',
          }}>
            {state.currentMoney.toLocaleString('ru-RU')} руб.
          </div>
        </div>
        <div>
          <div style={{color: '#94a3b8', fontSize: 12}}>Несгораемая</div>
          <div style={{
            fontSize: 'clamp(14px, 1.8vw, 20px)',
            color: '#cbd5e1',
            wordBreak: 'break-word',
          }}>
            {state.guaranteedMoney.toLocaleString('ru-RU')} руб.
          </div>
        </div>
      </div>
    </Card>
  );
}

function CurrentQuestionCard({state}: {state: GameState}) {
  const q = state.currentQuestion!;
  return (
    <Card title="Текущий вопрос">
      <div style={{fontSize: 16, color: '#e2e8f0', marginBottom: 10}}>{q.text}</div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13}}>
        {q.answers.map((a, i) => {
          const letter = 'ABCD'[i];
          const isCorrect = a.isCorrect;
          const isSelected = state.selectedAnswerIndex === i;
          const isHidden = state.hiddenAnswers.includes(i);
          return (
            <div
              key={i}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
                border: isSelected ? '1px solid #f5c542' : '1px solid transparent',
                color: isHidden ? '#64748b' : '#fff',
                textDecoration: isHidden ? 'line-through' : 'none',
              }}
            >
              <b style={{color: isCorrect ? '#86efac' : '#f5c542'}}>{letter}:</b> {a.text}
              {isCorrect && <span style={{float: 'right', color: '#86efac'}}>правильный</span>}
            </div>
          );
        })}
      </div>
      {q.comment && (
        <div style={{
          marginTop: 10, padding: 8, borderRadius: 6,
          background: 'rgba(59,130,246,0.1)',
          borderLeft: '3px solid #3b82f6',
          color: '#dbeafe', fontSize: 13,
        }}>
          {q.comment}
        </div>
      )}
    </Card>
  );
}

/** Саундборд с подсветкой активных звуков. */
function Soundboard({activeSounds, onSend, muted, onToggleMute}: {
  activeSounds: SoundId[];
  onSend: (cmd: DirectorCommand) => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const active = new Set(activeSounds);
  return (
    <Card title="Саундборд">
      <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
        {SOUNDBOARD_GROUPS.map((group) => (
          <div key={group.title}>
            <div style={{
              fontSize: 11, color: '#64748b',
              textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1,
            }}>
              {group.title}
            </div>
            <div className="soundboard-group">
              {group.items.map(({id, label}) => {
                const isActive = active.has(id);
                return (
                  <button
                    key={id}
                    onClick={() =>
                      onSend(isActive
                        ? {type: 'STOP_SOUND', soundId: id}
                        : {type: 'PLAY_SOUND', soundId: id})
                    }
                    title={id}
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      borderRadius: 5,
                      background: isActive
                        ? 'linear-gradient(180deg, #f5c542 0%, #a77c18 100%)'
                        : '#16244d',
                      color: isActive ? '#000' : '#f5c542',
                      border: `1px solid ${isActive ? '#ffe58a' : '#3366cc'}`,
                      cursor: 'pointer',
                      fontWeight: isActive ? 'bold' : 'normal',
                      boxShadow: isActive ? '0 0 10px rgba(245,197,66,0.5)' : 'none',
                    }}
                  >
                    {isActive ? 'STOP' : 'PLAY'} {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{display: 'flex', gap: 6, marginTop: 4}}>
          <button
            onClick={() => onSend({type: 'STOP_ALL_SOUNDS'})}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 6,
              background: '#4c0519', color: '#fecaca',
              border: '1px solid #be123c', cursor: 'pointer',
            }}
          >
            остановить все
          </button>
          <button
            onClick={onToggleMute}
            style={{
              padding: '6px 12px', fontSize: 12, borderRadius: 6,
              background: '#1e293b', color: '#cbd5e1',
              border: '1px solid #334155', cursor: 'pointer',
            }}
          >
            {muted ? 'мой звук выключен' : 'мой звук'}
          </button>
        </div>
      </div>
    </Card>
  );
}

function Card({title, children}: {title?: string; children: React.ReactNode}) {
  return (
    <div className="card">
      {title && (
        <div style={{
          color: '#94a3b8', fontSize: 12,
          textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
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

function ControlBtn({label, onClick, disabled, primary, danger}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const bg = danger ? '#4c0519' : primary ? '#a77c18' : '#16244d';
  const border = danger ? '#be123c' : primary ? '#f5c542' : '#3366cc';
  const color = primary ? '#000' : '#f5c542';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 18px', fontSize: 13, fontWeight: 'bold',
        background: disabled
          ? '#1e293b'
          : primary
            ? 'linear-gradient(180deg,#f5c542 0%, #a77c18 100%)'
            : bg,
        color: disabled ? '#475569' : color,
        border: `2px solid ${disabled ? '#334155' : border}`,
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: 1,
        boxShadow: primary && !disabled ? '0 0 14px rgba(245,197,66,0.6)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

function LifelineBtn({id, label, state, onSend, stage}: {
  id: LifelineId;
  label: string;
  state: {
    FIFTY_FIFTY: {used: boolean; active: boolean};
    PHONE_A_FRIEND: {used: boolean; active: boolean};
    ASK_AUDIENCE: {used: boolean; active: boolean};
  };
  onSend: (cmd: DirectorCommand) => void;
  stage: GameStage;
}) {
  const l = state[id];
  const disabled = l.used || stage !== 'QUESTION_SHOW';
  return (
    <button
      onClick={() => onSend({type: 'ACTIVATE_LIFELINE', lifeline: id})}
      disabled={disabled}
      style={{
        padding: '10px 14px', fontSize: 13,
        background: l.used
          ? '#1e293b'
          : l.active ? 'linear-gradient(180deg,#f5c542,#a77c18)' : '#294b8a',
        color: l.used ? '#475569' : l.active ? '#000' : '#fff',
        border: `1px solid ${l.active ? '#ffe58a' : '#3366cc'}`,
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textDecoration: l.used ? 'line-through' : 'none',
        fontWeight: 'bold',
      }}
    >
      {label}
    </button>
  );
}

/** Выбор и загрузка пакетов вопросов. */
function PackLoader({activePackName, stage, onLoadPack}: {
  activePackName: string | null;
  stage: GameStage;
  onLoadPack: (packId: string) => void;
}) {
  const [packs, setPacks] = useState<Array<{id: string; name: string; questionCount: number}>>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = useMemo(() => async () => {
    try {
      const {SERVER_URL} = await import('../net/socket');
      const r = await fetch(`${SERVER_URL}/api/questions/packs`);
      const data = await r.json();
      if (data.ok) setPacks(data.packs);
    } catch {
      // игнорируем сетевые ошибки
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const {SERVER_URL} = await import('../net/socket');
      const body = await file.arrayBuffer();
      await fetch(
        `${SERVER_URL}/api/questions/packs?name=${encodeURIComponent(file.name)}`,
        {method: 'POST', headers: {'Content-Type': 'text/plain'}, body},
      );
      await refresh();
    } finally {
      setUploading(false);
    }
  };

  const canPick = stage === 'LOBBY';

  return (
    <div style={{
      background: 'rgba(10,18,40,0.75)',
      border: '1px solid rgba(51,102,204,0.4)',
      borderRadius: 10,
      padding: 14,
    }}>
      <div style={{
        color: '#94a3b8', fontSize: 12,
        textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1,
      }}>
        Пакеты вопросов
      </div>
      {!canPick && (
        <div style={{color: '#fcd34d', fontSize: 12, marginBottom: 8}}>
          Сменить пакет можно только в лобби. Нажмите СБРОС.
        </div>
      )}
      <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
        {packs.map((p) => {
          const isActive = activePackName === p.name;
          const disabled = !canPick || isActive;
          return (
            <div
              key={p.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', borderRadius: 6,
                background: isActive ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.03)',
                border: isActive ? '1px solid #22c55e' : '1px solid transparent',
              }}
            >
              <div style={{fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2}}>
                <span style={{
                  color: isActive ? '#86efac' : '#e2e8f0',
                  fontWeight: isActive ? 'bold' : 'normal',
                }}>
                  {p.name}{isActive && ' (активный)'}
                </span>
                <span style={{color: '#64748b', fontSize: 11}}>
                  {p.questionCount} вопросов
                </span>
              </div>
              <button
                disabled={disabled}
                onClick={() => onLoadPack(p.id)}
                style={{
                  padding: '4px 10px', fontSize: 11,
                  background: isActive ? '#14532d' : disabled ? '#1e293b' : '#16244d',
                  color: isActive ? '#86efac' : disabled ? '#475569' : '#f5c542',
                  border: `1px solid ${isActive ? '#22c55e' : disabled ? '#334155' : '#3366cc'}`,
                  borderRadius: 4,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {isActive ? 'активный' : 'использовать'}
              </button>
            </div>
          );
        })}
      </div>
      <label style={{display: 'block', marginTop: 10, cursor: 'pointer'}}>
        <span style={{
          display: 'inline-block', padding: '6px 12px', fontSize: 12,
          background: '#16244d', color: '#f5c542',
          border: '1px solid #3366cc', borderRadius: 6,
        }}>
          {uploading ? 'загрузка...' : 'загрузить TXT/JSON'}
        </span>
        <input
          type="file"
          accept=".txt,.json"
          style={{display: 'none'}}
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
          }}
        />
      </label>
    </div>
  );
}
