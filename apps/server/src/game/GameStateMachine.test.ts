import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameStateMachine} from './GameStateMachine.js';
import {Question, Answer, MONEY_LADDER, SAFE_HAVEN_LEVELS, getGuaranteedMoney} from '@millu/shared';

/**
 * Тесты машины состояний.
 * Покрывают переходы стадий, расчёт денег, подсказки, пропуск, сериализацию.
 */

function makeQuestion(correct: 0 | 1 | 2 | 3 = 0, id = 'q1'): Question {
  const answers = [0, 1, 2, 3].map((i) => ({
    text: `вариант ${i}`,
    isCorrect: i === correct,
  })) as [Answer, Answer, Answer, Answer];
  return {id, text: `вопрос ${id}`, answers};
}

function makeDeck(n: number): Question[] {
  return Array.from({length: n}, (_, i) => makeQuestion(0, `q${i + 1}`));
}

function snap(g: GameStateMachine) {
  return g.snapshot([], false, [], []);
}

/**
 * Помощник для прохождения одного полного раунда с заданным ответом.
 * Выполняет arm -> show -> select -> lock -> reveal -> next -> next.
 */
function playOneRound(g: GameStateMachine, answerIdx: number): void {
  g.armQuestion();
  g.showQuestion();
  g.selectAnswer(answerIdx);
  g.lockAnswer();
  g.revealAnswer();
  g.nextQuestion(); // REVEAL -> RESULT
  g.nextQuestion(); // RESULT -> QUESTION_ARMED или END
}

// ---------- Начальное состояние ----------

test('начальная стадия LOBBY', () => {
  const g = new GameStateMachine(makeDeck(3));
  assert.equal(g.getStage(), 'LOBBY');
});

// ---------- Переходы ----------

test('LOBBY переходит в INTRO после startGame', () => {
  const g = new GameStateMachine(makeDeck(3));
  assert.equal(g.startGame().ok, true);
  assert.equal(g.getStage(), 'INTRO');
});

test('INTRO переходит в QUESTION_ARMED после armQuestion, а не в QUESTION_SHOW', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  assert.equal(g.armQuestion().ok, true);
  assert.equal(g.getStage(), 'QUESTION_ARMED');
  assert.equal(g.getCurrentQuestion()?.id, 'q1');
});

test('QUESTION_ARMED переходит в QUESTION_SHOW после showQuestion', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  assert.equal(g.showQuestion().ok, true);
  assert.equal(g.getStage(), 'QUESTION_SHOW');
});

test('showQuestion из INTRO напрямую запрещён', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  assert.equal(g.showQuestion().ok, false);
});

test('startGame дважды запрещено', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  assert.equal(g.startGame().ok, false);
});

// ---------- Выбор и фиксация ----------

test('selectAnswer меняет selectedAnswerIndex но не стадию', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  assert.equal(g.selectAnswer(2).ok, true);
  assert.equal(g.getStage(), 'QUESTION_SHOW');
  assert.equal(g.getSelectedAnswerIndex(), 2);
});

test('selectAnswer с индексом вне 0..3 отказ', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  assert.equal(g.selectAnswer(4).ok, false);
  assert.equal(g.selectAnswer(-1).ok, false);
});

test('lockAnswer требует предварительного выбора', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  assert.equal(g.lockAnswer().ok, false);
  g.selectAnswer(0);
  assert.equal(g.lockAnswer().ok, true);
  assert.equal(g.getStage(), 'ANSWER_LOCK');
});

// ---------- Денежное дерево ----------

test('правильный ответ увеличивает moneyTreeLevel и currentMoney', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  g.selectAnswer(0);
  g.lockAnswer();
  g.revealAnswer();
  g.nextQuestion();
  const s = snap(g);
  assert.equal(s.moneyTreeLevel, 1);
  assert.equal(s.currentMoney, MONEY_LADDER[0]);
});

test('неправильный ответ не меняет moneyTreeLevel, откат до несгораемой', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  g.selectAnswer(1);
  g.lockAnswer();
  g.revealAnswer();
  g.nextQuestion();
  const s = snap(g);
  assert.equal(s.moneyTreeLevel, 0);
  assert.equal(s.currentMoney, 0);
});

// ---------- Несгораемые суммы ----------

test('getGuaranteedMoney 0 ответов равно 0', () => {
  assert.equal(getGuaranteedMoney(0), 0);
});

test('getGuaranteedMoney 5 правильных возвращает сумму 5 уровня', () => {
  assert.equal(getGuaranteedMoney(5), MONEY_LADDER[SAFE_HAVEN_LEVELS[0]]);
});

test('getGuaranteedMoney 10 правильных возвращает сумму 10 уровня', () => {
  assert.equal(getGuaranteedMoney(10), MONEY_LADDER[SAFE_HAVEN_LEVELS[1]]);
});

test('проигрыш после 6 правильных возвращает сумму 5 уровня', () => {
  const g = new GameStateMachine(makeDeck(10));
  g.startGame();
  for (let i = 0; i < 6; i++) playOneRound(g, 0);
  // 7-й раунд неправильно
  g.armQuestion();
  g.showQuestion();
  g.selectAnswer(1);
  g.lockAnswer();
  g.revealAnswer();
  g.nextQuestion();
  const s = snap(g);
  assert.equal(s.moneyTreeLevel, 6);
  assert.equal(s.currentMoney, MONEY_LADDER[4]);
  g.nextQuestion();
  assert.equal(g.getStage(), 'END');
});

test('15 правильных подряд это WIN_MILLION', () => {
  const g = new GameStateMachine(makeDeck(15));
  g.startGame();
  for (let i = 0; i < 15; i++) playOneRound(g, 0);
  const s = snap(g);
  assert.equal(s.stage, 'END');
  assert.equal(s.endReason, 'WIN_MILLION');
  assert.equal(s.currentMoney, MONEY_LADDER[14]);
});

// ---------- Подсказки ----------

test('50/50 скрывает ровно два неправильных варианта', () => {
  const g = new GameStateMachine([makeQuestion(2)]);
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  const r = g.activateLifeline('FIFTY_FIFTY');
  assert.equal(r.ok, true);
  const s = snap(g);
  assert.equal(s.hiddenAnswers.length, 2);
  assert.ok(!s.hiddenAnswers.includes(2));
  assert.equal(s.lifelines.FIFTY_FIFTY.used, true);
});

test('подсказку нельзя использовать дважды', () => {
  const g = new GameStateMachine([makeQuestion()]);
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  g.activateLifeline('FIFTY_FIFTY');
  assert.equal(g.activateLifeline('FIFTY_FIFTY').ok, false);
});

test('помощь зала даёт распределение с суммой около 100', () => {
  const g = new GameStateMachine([makeQuestion(1)]);
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  g.activateLifeline('ASK_AUDIENCE');
  const s = snap(g);
  assert.ok(s.audiencePoll !== null);
  const sum = s.audiencePoll!.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 100) <= 1, `sum=${sum} должно быть около 100`);
});

// ---------- Защита от неправильных команд ----------

test('нельзя выбрать ответ в LOBBY', () => {
  const g = new GameStateMachine(makeDeck(3));
  assert.equal(g.selectAnswer(0).ok, false);
});

test('нельзя раскрыть ответ без предварительной фиксации', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  assert.equal(g.revealAnswer().ok, false);
});

test('нельзя активировать подсказку в ANSWER_LOCK', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  g.selectAnswer(0);
  g.lockAnswer();
  assert.equal(g.activateLifeline('FIFTY_FIFTY').ok, false);
});

// ---------- Сброс ----------

test('resetGame возвращает в LOBBY с обнулением полей', () => {
  const g = new GameStateMachine(makeDeck(3));
  playOneRound(new GameStateMachine(makeDeck(3)), 0);
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  g.selectAnswer(0);
  g.lockAnswer();
  g.revealAnswer();
  g.nextQuestion();
  g.nextQuestion();
  g.resetGame();
  const s = snap(g);
  assert.equal(s.stage, 'LOBBY');
  assert.equal(s.moneyTreeLevel, 0);
  assert.equal(s.currentMoney, 0);
  assert.equal(s.currentQuestion, null);
  assert.equal(s.lifelines.FIFTY_FIFTY.used, false);
});

// ---------- Пропуск вопроса ----------

test('skipQuestion перемещает armed-вопрос в конец, стадия остаётся QUESTION_ARMED', () => {
  const deck = [makeQuestion(0, 'q1'), makeQuestion(0, 'q2'), makeQuestion(0, 'q3')];
  const g = new GameStateMachine(deck);
  g.startGame();
  g.armQuestion();
  assert.equal(g.getCurrentQuestion()?.id, 'q1');

  assert.equal(g.skipQuestion().ok, true);

  // На текущем индексе теперь q2, стадия остаётся QUESTION_ARMED
  assert.equal(g.getCurrentQuestion()?.id, 'q2');
  assert.equal(g.getStage(), 'QUESTION_ARMED');
  assert.equal(snap(g).moneyTreeLevel, 0);
});

test('skipQuestion из QUESTION_SHOW запрещён (смысл только до показа)', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  assert.equal(g.skipQuestion().ok, false);
});

test('skipQuestion из LOBBY запрещён', () => {
  const g = new GameStateMachine(makeDeck(3));
  assert.equal(g.skipQuestion().ok, false);
});

test('skipQuestion на единственном вопросе запрещён', () => {
  const g = new GameStateMachine([makeQuestion(0, 'only')]);
  g.startGame();
  g.armQuestion();
  assert.equal(g.skipQuestion().ok, false);
});

// ---------- Пакет ----------

test('loadPack в LOBBY работает', () => {
  const g = new GameStateMachine(makeDeck(3));
  assert.equal(g.loadPack(makeDeck(15)).ok, true);
});

test('loadPack не в LOBBY отказ', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  assert.equal(g.loadPack(makeDeck(15)).ok, false);
});

test('loadPack с пустым пакетом отказ', () => {
  const g = new GameStateMachine(makeDeck(3));
  assert.equal(g.loadPack([]).ok, false);
});

test('loadPack обновляет activePackName', () => {
  const g = new GameStateMachine(makeDeck(3), 'first');
  assert.equal(g.loadPack(makeDeck(5), 'second').ok, true);
  assert.equal(snap(g).activePackName, 'second');
});

// ---------- Сериализация ----------

test('serialize и deserialize сохраняют стадию и уровень', () => {
  const g = new GameStateMachine(makeDeck(10), 'test');
  g.startGame();
  playOneRound(g, 0);
  playOneRound(g, 0);
  const data = g.serialize();
  const json = JSON.stringify(data);
  const restored = GameStateMachine.deserialize(JSON.parse(json));
  const s = snap(restored);
  assert.equal(s.moneyTreeLevel, 2);
  assert.equal(s.activePackName, 'test');
});

test('serialize сохраняет использованные подсказки', () => {
  const g = new GameStateMachine(makeDeck(3));
  g.startGame();
  g.armQuestion();
  g.showQuestion();
  g.activateLifeline('FIFTY_FIFTY');
  const restored = GameStateMachine.deserialize(JSON.parse(JSON.stringify(g.serialize())));
  const s = snap(restored);
  assert.equal(s.lifelines.FIFTY_FIFTY.used, true);
});

// ---------- Имя активного пакета ----------

test('конструктор без имени делает activePackName null', () => {
  const g = new GameStateMachine(makeDeck(3));
  assert.equal(snap(g).activePackName, null);
});

test('конструктор с именем выставляет activePackName', () => {
  const g = new GameStateMachine(makeDeck(3), 'test-pack');
  assert.equal(snap(g).activePackName, 'test-pack');
});
