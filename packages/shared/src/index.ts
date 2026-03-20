/**
 * Общие типы и константы для клиента и сервера.
 * Единственный источник истины для протокола WebSocket,
 * структуры GameState и форматов REST.
 */

export const SHARED_VERSION = '2.1.0';

// ---------- Вопросы ----------

/** Один вариант ответа. */
export interface Answer {
  text: string;
  isCorrect: boolean;
}

/** Один вопрос игры. */
export interface Question {
  id: string;
  text: string;
  answers: [Answer, Answer, Answer, Answer];
  /** Комментарий ведущему. Игроку не показывается. */
  comment?: string;
}

/** Пакет вопросов в виде, в котором его отдаёт REST. */
export interface QuestionPack {
  id: string;
  name: string;
  questionCount: number;
}

// ---------- Денежное дерево ----------

/**
 * Денежное дерево на 15 уровней.
 * Значения соответствуют классической российской версии шоу.
 */
export const MONEY_LADDER: readonly number[] = [
  100,         // 1
  200,         // 2
  300,         // 3
  500,         // 4
  1_000,       // 5  несгораемая
  2_000,       // 6
  4_000,       // 7
  8_000,       // 8
  16_000,      // 9
  32_000,      // 10 несгораемая
  64_000,      // 11
  125_000,     // 12
  250_000,     // 13
  500_000,     // 14
  1_000_000,   // 15
] as const;

/** Индексы уровней с несгораемыми суммами (0-based). */
export const SAFE_HAVEN_LEVELS: readonly number[] = [4, 9] as const;

/** Сумма, с которой игрок уйдёт при неправильном ответе. */
export function getGuaranteedMoney(answeredCorrectlyCount: number): number {
  let guaranteed = 0;
  for (const idx of SAFE_HAVEN_LEVELS) {
    if (answeredCorrectlyCount >= idx + 1) {
      guaranteed = MONEY_LADDER[idx];
    }
  }
  return guaranteed;
}

// ---------- Роли и стадии ----------

export type UserRole = 'director' | 'host' | 'player';

/**
 * Стадии игровой сессии.
 *
 * Порядок переходов:
 *   LOBBY, INTRO, QUESTION_ARMED, QUESTION_SHOW,
 *   ANSWER_LOCK, REVEAL, RESULT, (QUESTION_ARMED или END)
 *
 * QUESTION_ARMED значит что сервер уже выбрал следующий вопрос,
 * но показывает его только режиссёру. Игрок и ведущий видят заставку.
 * Режиссёр решает показать вопрос или пропустить его.
 */
export type GameStage =
  | 'LOBBY'
  | 'INTRO'
  | 'QUESTION_ARMED'
  | 'QUESTION_SHOW'
  | 'ANSWER_LOCK'
  | 'REVEAL'
  | 'RESULT'
  | 'END';

export type EndReason =
  | 'WIN_MILLION'
  | 'WRONG_ANSWER'
  | 'DIRECTOR_QUIT'
  | 'MANUAL_END';

// ---------- Подсказки ----------

export type LifelineId = 'FIFTY_FIFTY' | 'PHONE_A_FRIEND' | 'ASK_AUDIENCE';

export interface LifelineState {
  used: boolean;
  active: boolean;
}

export interface LifelinesState {
  FIFTY_FIFTY: LifelineState;
  PHONE_A_FRIEND: LifelineState;
  ASK_AUDIENCE: LifelineState;
}

/** Проценты голосов зала по вариантам A/B/C/D. */
export type AudiencePoll = [number, number, number, number];

// ---------- Клиенты ----------

export interface ConnectedClient {
  socketId: string;
  role: UserRole;
  name: string;
  connectedAt: number;
}

// ---------- Журнал событий ----------

export type EventLogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface EventLogEntry {
  id: string;
  timestamp: number;
  level: EventLogLevel;
  tag: string;
  message: string;
}

// ---------- Снимок состояния игры ----------

export interface GameState {
  stage: GameStage;
  endReason: EndReason | null;
  currentQuestionIndex: number;
  /**
   * Текущий вопрос. В стадии QUESTION_ARMED сервер показывает вопрос
   * только режиссёру (это определяется на стороне клиента). Игрок
   * и ведущий показывают заставку ожидания.
   */
  currentQuestion: Question | null;
  moneyTreeLevel: number;
  currentMoney: number;
  guaranteedMoney: number;
  lifelines: LifelinesState;
  hiddenAnswers: number[];
  audiencePoll: AudiencePoll | null;
  selectedAnswerIndex: number | null;
  isCorrectAnswerRevealed: boolean;
  connectedClients: ConnectedClient[];
  directorOnline: boolean;
  activePackName: string | null;
  recentEvents: EventLogEntry[];
  /** Какие звуки по мнению сервера сейчас играют. */
  activeSounds: SoundId[];
  /**
   * Автоматический звуковой режим. Если включён, сервер сам подбирает
   * звуки на каждое игровое событие (старт, показ вопроса, фиксация,
   * раскрытие, конец игры). Если выключен, звуки играют только когда
   * режиссёр явно нажимает кнопку в саундборде.
   */
  autoSoundsEnabled: boolean;
}

// ---------- Звуки ----------

/**
 * Идентификаторы звуков. Соответствуют файлам в public/sounds/khsm.
 * Именование взято из оригинального fan-приложения KHSM.exe.
 */
export type SoundId =
  // Интро и финал
  | 'INTRO'
  | 'LETS_PLAY'
  | 'MAIN_SHORT'
  | 'CLOSING'
  | 'GOODBYE'
  | 'FANFARE'
  | 'COMMERCIAL'
  // Представление участников
  | 'PLAYERS'
  | 'HS_INTRO'
  // Фоновые лупы вопросов
  | 'BGM_Q1_5'
  | 'BGM_Q6'
  | 'BGM_Q7'
  | 'BGM_Q8'
  | 'BGM_Q9'
  | 'BGM_Q10'
  | 'BGM_Q11'
  | 'BGM_Q12'
  | 'BGM_Q13'
  | 'BGM_Q14'
  | 'BGM_Q15'
  // Фиксация ответа
  | 'LOCK_Q6'
  | 'LOCK_Q11'
  | 'LOCK_Q15'
  // Правильный ответ
  | 'CORRECT_Q1_5'
  | 'CORRECT_Q5'
  | 'CORRECT_Q6'
  | 'CORRECT_Q10'
  | 'CORRECT_Q11'
  | 'CORRECT_Q15'
  // Неправильный ответ
  | 'WRONG_Q1_5'
  | 'WRONG_Q6'
  | 'WRONG_Q11'
  | 'WRONG_Q15'
  // Подсказки
  | 'LIFELINE_FIFTY_FIFTY'
  | 'LIFELINE_PHONE'
  | 'LIFELINE_AUDIENCE'
  | 'LIFELINE_SWITCH'
  | 'PHONE_DIALING'
  | 'PHONE_COUNTDOWN'
  | 'PHONE_END'
  | 'AUDIENCE_BEGIN'
  | 'AUDIENCE_VOTING'
  | 'AUDIENCE_FULL'
  // Дерево выигрышей
  | 'LADDER'
  | 'LADDER_5_10'
  | 'LADDER_START'
  // Денежные фанфары
  | 'MONEY_1'
  | 'MONEY_2';

/**
 * Множество звуков которые играют по кругу.
 * Все остальные считаются короткими и завершаются сами.
 * Сервер использует это чтобы знать какие звуки сами уйдут из active,
 * а какие надо явно остановить.
 */
export const LOOPED_SOUNDS: readonly SoundId[] = [
  'BGM_Q1_5',
  'BGM_Q6',
  'BGM_Q7',
  'BGM_Q8',
  'BGM_Q9',
  'BGM_Q10',
  'BGM_Q11',
  'BGM_Q12',
  'BGM_Q13',
  'BGM_Q14',
  'BGM_Q15',
  'PHONE_COUNTDOWN',
  'AUDIENCE_VOTING',
] as const;

export function isLoopedSound(id: SoundId): boolean {
  return (LOOPED_SOUNDS as readonly SoundId[]).includes(id);
}

// ---------- Ошибки ----------

export type AccessError =
  | 'NO_DIRECTOR'
  | 'ROLE_TAKEN'
  | 'GAME_ENDED'
  | 'INVALID_STAGE'
  | 'PERMISSION_DENIED';

// ---------- Протокол WebSocket ----------

/** Callback для событий с подтверждением от сервера. */
export type Ack<T> = (response: {ok: true; data: T} | {ok: false; error: string}) => void;

export interface JoinPayload {
  role: UserRole;
  name?: string;
}

/**
 * Команды режиссёра. Валидируются на сервере по роли и стадии.
 * ARM_QUESTION готовит вопрос и показывает его только режиссёру.
 * SHOW_QUESTION раскрывает armed-вопрос игроку и ведущему.
 * SKIP_QUESTION пропускает armed-вопрос в конец пакета без показа.
 */
export type DirectorCommand =
  | {type: 'START_GAME'}
  | {type: 'SHOW_INTRO'}
  | {type: 'ARM_QUESTION'}
  | {type: 'SHOW_QUESTION'}
  | {type: 'SKIP_QUESTION'}
  | {type: 'REVEAL_ANSWER'}
  | {type: 'NEXT_QUESTION'}
  | {type: 'END_GAME'}
  | {type: 'RESET_GAME'}
  | {type: 'TOGGLE_AUTO_SOUNDS'}
  | {type: 'PLAY_SOUND'; soundId: SoundId}
  | {type: 'STOP_SOUND'; soundId: SoundId}
  | {type: 'STOP_ALL_SOUNDS'}
  | {type: 'ACTIVATE_LIFELINE'; lifeline: LifelineId}
  | {type: 'SET_AUDIENCE_POLL'; poll: AudiencePoll}
  | {type: 'LOAD_PACK'; packId: string};

export interface ClientToServerEvents {
  'session:join': (payload: JoinPayload, ack: Ack<GameState>) => void;
  'session:leave': () => void;
  'director:command': (cmd: DirectorCommand, ack: Ack<null>) => void;
  'host:select_answer': (answerIndex: number) => void;
  'host:lock_answer': (ack: Ack<null>) => void;
  'session:ping': (ack: Ack<{serverTime: number}>) => void;
  /**
   * Клиент сообщает серверу что нелупленный звук закончился сам.
   * Это снимает подсветку с кнопки в саундборде и обновляет activeSounds.
   * Достаточно одного клиента (любого) - сервер обновит у всех.
   */
  'sound:ended': (soundId: SoundId) => void;
}

export interface ServerToClientEvents {
  'game:state_update': (state: GameState) => void;
  'game:play_sound': (soundId: SoundId) => void;
  'game:stop_sound': (soundId: SoundId) => void;
  'game:stop_all_sounds': () => void;
  'game:error': (message: string) => void;
  'session:kicked': (reason: AccessError) => void;
  'log:append': (entry: EventLogEntry) => void;
}

// ---------- Метки ответов ----------

export const ANSWER_LABELS: readonly ['A', 'B', 'C', 'D'] = ['A', 'B', 'C', 'D'] as const;

// ---------- REST ----------

export const REST_ROUTES = {
  health: '/api/health',
  packs: '/api/questions/packs',
  packById: (id: string) => `/api/questions/packs/${encodeURIComponent(id)}`,
  uploadPack: '/api/questions/packs',
} as const;

export interface HealthResponse {
  ok: true;
  serverTime: number;
  version: string;
  uptime: number;
}
