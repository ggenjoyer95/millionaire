import {
  GameState,
  GameStage,
  Question,
  LifelineId,
  AudiencePoll,
  EndReason,
  LifelinesState,
  ConnectedClient,
  EventLogEntry,
  SoundId,
  MONEY_LADDER,
  getGuaranteedMoney,
} from '@millu/shared';

/** Результат попытки перехода между стадиями. */
export type TransitionResult = {ok: true} | {ok: false; reason: string};

/**
 * Машина состояний игры.
 *
 * Граф переходов:
 *   LOBBY          -> startGame         -> INTRO
 *   INTRO          -> armQuestion       -> QUESTION_ARMED
 *   QUESTION_ARMED -> showQuestion      -> QUESTION_SHOW
 *   QUESTION_ARMED -> skipQuestion      -> QUESTION_ARMED (тот же индекс, другой вопрос)
 *   QUESTION_SHOW  -> lockAnswer        -> ANSWER_LOCK
 *   ANSWER_LOCK    -> revealAnswer      -> REVEAL
 *   REVEAL         -> nextQuestion      -> RESULT
 *   RESULT         -> nextQuestion      -> QUESTION_ARMED (если ответ был верным)
 *                                       -> END             (если неверный или взят миллион)
 *   END            -> resetGame         -> LOBBY
 *
 * Все методы мутируют state и возвращают TransitionResult.
 * Снаружи state отдаётся через snapshot в виде чистой копии.
 */
export class GameStateMachine {
  private state: GameState;

  constructor(
    private questions: Question[],
    private packName: string | null = null,
  ) {
    this.state = this.freshState();
  }

  private freshState(): GameState {
    return {
      stage: 'LOBBY',
      endReason: null,
      currentQuestionIndex: 0,
      currentQuestion: null,
      moneyTreeLevel: 0,
      currentMoney: 0,
      guaranteedMoney: 0,
      lifelines: {
        FIFTY_FIFTY: {used: false, active: false},
        PHONE_A_FRIEND: {used: false, active: false},
        ASK_AUDIENCE: {used: false, active: false},
      },
      hiddenAnswers: [],
      audiencePoll: null,
      selectedAnswerIndex: null,
      isCorrectAnswerRevealed: false,
      connectedClients: [],
      directorOnline: false,
      activePackName: this.packName,
      recentEvents: [],
      activeSounds: [],
      autoSoundsEnabled: false,
    };
  }

  /** Переключает режим автоматических звуков. Возвращает новое значение. */
  toggleAutoSounds(): boolean {
    this.state.autoSoundsEnabled = !this.state.autoSoundsEnabled;
    return this.state.autoSoundsEnabled;
  }

  isAutoSoundsEnabled(): boolean {
    return this.state.autoSoundsEnabled;
  }

  // ---------- Доступ к состоянию ----------

  snapshot(
    clients: ConnectedClient[],
    directorOnline: boolean,
    events: EventLogEntry[],
    activeSounds: SoundId[],
  ): GameState {
    return {
      ...this.state,
      connectedClients: clients,
      directorOnline,
      recentEvents: events,
      activeSounds: [...activeSounds],
      lifelines: {
        FIFTY_FIFTY: {...this.state.lifelines.FIFTY_FIFTY},
        PHONE_A_FRIEND: {...this.state.lifelines.PHONE_A_FRIEND},
        ASK_AUDIENCE: {...this.state.lifelines.ASK_AUDIENCE},
      },
      hiddenAnswers: [...this.state.hiddenAnswers],
      audiencePoll: this.state.audiencePoll
        ? ([...this.state.audiencePoll] as AudiencePoll)
        : null,
    };
  }

  getStage(): GameStage {
    return this.state.stage;
  }

  getCurrentQuestion(): Question | null {
    return this.state.currentQuestion;
  }

  getSelectedAnswerIndex(): number | null {
    return this.state.selectedAnswerIndex;
  }

  getCurrentQuestionIndex(): number {
    return this.state.currentQuestionIndex;
  }

  /**
   * Сериализация для сохранения на диск.
   * Возвращает объект, пригодный для JSON.stringify.
   */
  serialize(): SerializedGame {
    return {
      state: this.state,
      questions: this.questions,
      packName: this.packName,
    };
  }

  /** Восстановление из сохранённого снимка. */
  static deserialize(data: SerializedGame): GameStateMachine {
    const g = new GameStateMachine(data.questions, data.packName);
    g.state = data.state;
    return g;
  }

  /** Заменить пакет вопросов. Разрешено только в LOBBY. */
  loadPack(questions: Question[], name: string | null = null): TransitionResult {
    if (this.state.stage !== 'LOBBY') {
      return {ok: false, reason: 'Сменить пакет можно только в лобби'};
    }
    if (questions.length === 0) {
      return {ok: false, reason: 'Пакет вопросов пуст'};
    }
    this.questions = questions;
    this.packName = name;
    this.state.activePackName = name;
    return {ok: true};
  }

  // ---------- Переходы стадий ----------

  startGame(): TransitionResult {
    if (this.state.stage !== 'LOBBY') {
      return {ok: false, reason: 'Игра уже запущена'};
    }
    if (this.questions.length === 0) {
      return {ok: false, reason: 'Нет загруженных вопросов'};
    }
    this.state = this.freshState();
    this.state.stage = 'INTRO';
    return {ok: true};
  }

  /**
   * Готовит следующий вопрос. Этот вопрос станет виден режиссёру
   * в его пульте, но не появится у игрока и ведущего пока не вызван
   * showQuestion. Так режиссёр может посмотреть вопрос заранее
   * и пропустить его если считает нужным.
   */
  armQuestion(): TransitionResult {
    const s = this.state;

    if (s.stage === 'INTRO') {
      const first = this.questions[0];
      if (!first) return {ok: false, reason: 'Пакет вопросов пуст'};
      s.currentQuestionIndex = 0;
      s.currentQuestion = first;
      this.resetRoundState();
      s.stage = 'QUESTION_ARMED';
      return {ok: true};
    }

    if (s.stage === 'RESULT') {
      if (!this.wasLastAnswerCorrect()) {
        return {ok: false, reason: 'Последний ответ был неверным, игра окончена'};
      }
      const nextIdx = s.currentQuestionIndex + 1;
      if (nextIdx >= this.questions.length) {
        return {ok: false, reason: 'Все вопросы отыграны, вызовите END_GAME'};
      }
      s.currentQuestionIndex = nextIdx;
      s.currentQuestion = this.questions[nextIdx];
      this.resetRoundState();
      s.stage = 'QUESTION_ARMED';
      return {ok: true};
    }

    return {ok: false, reason: `Команда ARM_QUESTION недопустима в стадии ${s.stage}`};
  }

  /** Показывает armed-вопрос всем клиентам. */
  showQuestion(): TransitionResult {
    const s = this.state;
    if (s.stage !== 'QUESTION_ARMED') {
      return {
        ok: false,
        reason: 'Показать вопрос можно только после его подготовки (ARM_QUESTION)',
      };
    }
    s.stage = 'QUESTION_SHOW';
    return {ok: true};
  }

  /**
   * Пропуск armed-вопроса. Доступен только в QUESTION_ARMED.
   * Вопрос перемещается в конец пакета, следующий за ним становится
   * текущим, стадия остаётся QUESTION_ARMED. Уровень не меняется,
   * использованные подсказки не восстанавливаются.
   */
  skipQuestion(): TransitionResult {
    const s = this.state;
    if (s.stage !== 'QUESTION_ARMED') {
      return {
        ok: false,
        reason: 'Пропустить можно только подготовленный вопрос (стадия QUESTION_ARMED)',
      };
    }
    if (s.currentQuestion === null) {
      return {ok: false, reason: 'Нет активного вопроса для пропуска'};
    }
    if (this.questions.length <= 1) {
      return {ok: false, reason: 'В пакете нет других вопросов, пропуск невозможен'};
    }
    const currentIdx = s.currentQuestionIndex;
    const [skipped] = this.questions.splice(currentIdx, 1);
    this.questions.push(skipped);
    const replacement = this.questions[currentIdx];
    if (!replacement) {
      return {ok: false, reason: 'Не удалось получить следующий вопрос'};
    }
    s.currentQuestion = replacement;
    // Стадия остаётся QUESTION_ARMED, вопрос на том же индексе
    // но теперь другой. Игрок и ведущий не увидят разницы.
    return {ok: true};
  }

  /** Ведущий предварительно выбирает вариант. */
  selectAnswer(index: number): TransitionResult {
    if (this.state.stage !== 'QUESTION_SHOW') {
      return {ok: false, reason: 'Выбор ответа допустим только в QUESTION_SHOW'};
    }
    if (index < 0 || index > 3) {
      return {ok: false, reason: 'Индекс ответа должен быть 0..3'};
    }
    if (this.state.hiddenAnswers.includes(index)) {
      return {ok: false, reason: 'Этот ответ скрыт подсказкой 50/50'};
    }
    this.state.selectedAnswerIndex = index;
    return {ok: true};
  }

  /** Ведущий фиксирует ответ. */
  lockAnswer(): TransitionResult {
    if (this.state.stage !== 'QUESTION_SHOW') {
      return {ok: false, reason: `Фиксация ответа недопустима в стадии ${this.state.stage}`};
    }
    if (this.state.selectedAnswerIndex === null) {
      return {ok: false, reason: 'Ответ не выбран'};
    }
    this.state.stage = 'ANSWER_LOCK';
    return {ok: true};
  }

  /** Раскрытие правильного ответа. */
  revealAnswer(): TransitionResult {
    if (this.state.stage !== 'ANSWER_LOCK') {
      return {ok: false, reason: 'Раскрытие ответа допустимо только после фиксации'};
    }
    this.state.stage = 'REVEAL';
    this.state.isCorrectAnswerRevealed = true;
    return {ok: true};
  }

  /**
   * Из REVEAL команда ведёт в RESULT с подсчётом денег.
   * Из RESULT команда ведёт либо в QUESTION_ARMED (правильный ответ),
   * либо в END (неверный ответ или взят миллион).
   */
  nextQuestion(): TransitionResult {
    const s = this.state;

    if (s.stage === 'REVEAL') {
      this.computeResult();
      s.stage = 'RESULT';
      return {ok: true};
    }

    if (s.stage === 'RESULT') {
      if (!this.wasLastAnswerCorrect()) {
        s.stage = 'END';
        s.endReason = 'WRONG_ANSWER';
        return {ok: true};
      }
      if (s.currentQuestionIndex + 1 >= this.questions.length) {
        s.stage = 'END';
        s.endReason = 'WIN_MILLION';
        return {ok: true};
      }
      return this.armQuestion();
    }

    return {ok: false, reason: `NEXT_QUESTION недопустим в ${s.stage}`};
  }

  endGame(reason: EndReason = 'MANUAL_END'): TransitionResult {
    if (this.state.stage === 'END') {
      return {ok: false, reason: 'Игра уже завершена'};
    }
    this.state.stage = 'END';
    this.state.endReason = reason;
    return {ok: true};
  }

  resetGame(): TransitionResult {
    const keepAutoSounds = this.state.autoSoundsEnabled;
    this.state = this.freshState();
    this.state.autoSoundsEnabled = keepAutoSounds;
    return {ok: true};
  }

  // ---------- Подсказки ----------

  activateLifeline(id: LifelineId): TransitionResult {
    const s = this.state;
    if (s.stage !== 'QUESTION_SHOW') {
      return {ok: false, reason: 'Подсказки доступны только при показе вопроса'};
    }
    if (s.lifelines[id].used) {
      return {ok: false, reason: 'Эта подсказка уже использована'};
    }
    if (s.currentQuestion === null) {
      return {ok: false, reason: 'Нет активного вопроса'};
    }

    s.lifelines[id] = {used: true, active: true};

    if (id === 'FIFTY_FIFTY') {
      const correctIdx = s.currentQuestion.answers.findIndex((a) => a.isCorrect);
      const wrongIdxs = [0, 1, 2, 3].filter((i) => i !== correctIdx);
      s.hiddenAnswers = [wrongIdxs[0], wrongIdxs[1]];
    } else if (id === 'ASK_AUDIENCE') {
      const correctIdx = s.currentQuestion.answers.findIndex((a) => a.isCorrect);
      s.audiencePoll = this.generateAudiencePoll(correctIdx);
    }
    // PHONE_A_FRIEND не влияет на state, только визуал на клиенте
    return {ok: true};
  }

  /** Ручной ввод процентов зала режиссёром. */
  setAudiencePoll(poll: AudiencePoll): TransitionResult {
    const s = this.state;
    if (s.stage !== 'QUESTION_SHOW') {
      return {ok: false, reason: 'Проценты зала доступны только в QUESTION_SHOW'};
    }
    const sum = poll.reduce((a, b) => a + b, 0);
    if (sum < 99 || sum > 101) {
      return {ok: false, reason: 'Сумма процентов должна быть 100 (допуск 1)'};
    }
    s.audiencePoll = poll;
    s.lifelines.ASK_AUDIENCE = {used: true, active: true};
    return {ok: true};
  }

  getLifelinesState(): LifelinesState {
    return this.state.lifelines;
  }

  // ---------- Внутренние помощники ----------

  private resetRoundState(): void {
    const s = this.state;
    s.selectedAnswerIndex = null;
    s.hiddenAnswers = [];
    s.audiencePoll = null;
    s.isCorrectAnswerRevealed = false;
    for (const key of Object.keys(s.lifelines) as LifelineId[]) {
      s.lifelines[key].active = false;
    }
  }

  private computeResult(): void {
    const s = this.state;
    if (s.currentQuestion === null || s.selectedAnswerIndex === null) return;
    const isCorrect = s.currentQuestion.answers[s.selectedAnswerIndex]?.isCorrect === true;
    if (isCorrect) {
      s.moneyTreeLevel = s.currentQuestionIndex + 1;
      s.currentMoney = MONEY_LADDER[s.currentQuestionIndex];
      s.guaranteedMoney = getGuaranteedMoney(s.moneyTreeLevel);
    } else {
      s.currentMoney = s.guaranteedMoney;
    }
  }

  private wasLastAnswerCorrect(): boolean {
    const s = this.state;
    if (s.currentQuestion === null || s.selectedAnswerIndex === null) return false;
    return s.currentQuestion.answers[s.selectedAnswerIndex]?.isCorrect === true;
  }

  /** Распределение голосов зала со смещением в пользу правильного. */
  private generateAudiencePoll(correctIdx: number): AudiencePoll {
    const poll = [0, 0, 0, 0] as number[];
    const correctBase = 45 + Math.floor(Math.random() * 20);
    poll[correctIdx] = correctBase;
    let left = 100 - correctBase;
    const others = [0, 1, 2, 3].filter((i) => i !== correctIdx);
    for (let i = 0; i < others.length - 1; i++) {
      const take = Math.floor(Math.random() * left);
      poll[others[i]] = take;
      left -= take;
    }
    poll[others[others.length - 1]] = left;
    return poll as AudiencePoll;
  }
}

/** Сериализованный снимок игры для персистентного хранения. */
export interface SerializedGame {
  state: GameState;
  questions: Question[];
  packName: string | null;
}
