/**
 * Точка входа серверной части.
 *
 * Компоненты:
 *   Express         REST-эндпоинты (health, packs, upload)
 *   Socket.IO       WebSocket-транспорт
 *   GameStateMachine  игровая логика
 *   SessionManager  роли и reconnect
 *   QuestionLoader  парсинг пакетов
 *   EventLog        журнал событий
 *   GameStorage     персистентность на диск
 *   SoundController учёт активных звуков
 */

import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import express from 'express';
import cors from 'cors';
import {Server, Socket} from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  DirectorCommand,
  Ack,
  GameState,
  JoinPayload,
  LifelineId,
  Question,
  SoundId,
} from '@millu/shared';

import {GameStateMachine} from './game/GameStateMachine.js';
import {SessionManager} from './session/SessionManager.js';
import {QuestionLoader} from './questions/QuestionLoader.js';
import {EventLog} from './logging/EventLog.js';
import {GameStorage} from './persistence/GameStorage.js';
import {SoundController} from './sound/SoundController.js';
import {buildRestRouter} from './http/rest.js';
import {bgmForLevel, correctForLevel, wrongForLevel, lockForLevel} from './sound/soundPicker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Конфигурация ----------
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';
const PACKS_DIR = process.env.PACKS_DIR || path.join(__dirname, 'data', 'packs');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, 'data', 'storage');
const DEFAULT_PACK = process.env.DEFAULT_PACK || 'base_1.txt';
const DISABLE_PERSISTENCE = process.env.DISABLE_PERSISTENCE === '1';

// ---------- Инициализация ----------
const startTime = Date.now();
const log = new EventLog();
const loader = new QuestionLoader(PACKS_DIR);
const session = new SessionManager();
const storage = new GameStorage(STORAGE_DIR);
const sounds = new SoundController();

// Пробуем восстановить сохранённую игру
let game: GameStateMachine | null = null;
if (!DISABLE_PERSISTENCE) {
  const saved = storage.load();
  if (saved) {
    try {
      game = GameStateMachine.deserialize(saved);
      log.info(
        'server.restore',
        `восстановлено состояние из файла, стадия ${game.getStage()}, пакет "${saved.packName ?? 'неизвестно'}"`,
      );
    } catch (err) {
      log.warn('server.restore', `не удалось восстановить сохранение: ${String(err)}`);
    }
  }
}

// Если восстановить не удалось, загружаем пакет по умолчанию
if (!game) {
  let initialQuestions: Question[] = [];
  let initialPackName: string | null = null;
  try {
    const {pack, questions, warnings} = loader.loadByFilename(DEFAULT_PACK);
    initialQuestions = questions;
    initialPackName = pack.name;
    log.info('server.init', `загружен пакет "${pack.name}", вопросов: ${pack.questionCount}`);
    for (const w of warnings) log.warn('pack.parse', w);
  } catch (err) {
    log.warn('server.init', `стартовый пакет не загружен: ${String(err)}`);
  }
  game = new GameStateMachine(initialQuestions, initialPackName);
}

/** Сохранение состояния на диск. */
function persist(): void {
  if (DISABLE_PERSISTENCE) return;
  if (!game) return;
  storage.save(game.serialize());
}

// ---------- Express + HTTP ----------
const app = express();
app.use(cors({origin: '*'}));
app.use(buildRestRouter(loader, log, startTime));

/*
 * Отдача собранного клиента в проде.
 * Если есть apps/client/dist рядом с сервером (после pnpm build или в Electron),
 * сервер сам раздаёт статику и SPA-роуты. В dev этого нет, клиент крутится
 * на отдельном Vite dev-сервере.
 */
import fsSync from 'node:fs';
const CLIENT_DIST_CANDIDATES = [
  path.join(__dirname, '..', '..', 'client', 'dist'),
  path.join(__dirname, '..', '..', '..', 'client', 'dist'),
];
const clientDist = CLIENT_DIST_CANDIDATES.find((p) => fsSync.existsSync(p));
if (clientDist) {
  log.info('server.static', `отдача клиента из ${clientDist}`);
  app.use(express.static(clientDist));
  // SPA fallback: все непомеченные роуты возвращают index.html
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.send('Millionaire Game Server is running. См. /api/health'));
}

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {origin: '*', methods: ['GET', 'POST']},
});

// ---------- Помощники рассылки ----------

/** Собирает полное состояние и шлёт его всем клиентам. */
function broadcastState(): void {
  if (!game) return;
  const snapshot = game.snapshot(
    session.allClients(),
    session.hasDirector(),
    log.recent(30),
    sounds.snapshot(),
  );
  io.emit('game:state_update', snapshot);
  persist();
}

/** Отказ в команде: лог, ack, сообщение клиенту. */
function denyCommand(
  ack: Ack<null> | undefined,
  tag: string,
  message: string,
  socket?: Socket,
): void {
  log.warn(tag, message);
  ack?.({ok: false, error: message});
  socket?.emit('game:error', message);
}

/**
 * Запускает звук у всех клиентов.
 * Перед запуском всегда останавливает все остальные звуки,
 * чтобы не было наложений.
 */
function emitPlay(id: SoundId): void {
  // Снимаем предыдущие звуки и на сервере, и на клиентах
  if (sounds.snapshot().length > 0) {
    sounds.onStopAll();
    io.emit('game:stop_all_sounds');
  }
  sounds.onPlay(id);
  io.emit('game:play_sound', id);
}

/**
 * Автоматический звук. Играет только если режиссёр включил
 * "автоматические звуки". Используется для всех серверных
 * подборов звука по событиям игры.
 */
function emitAutoPlay(id: SoundId): void {
  if (!game || !game.isAutoSoundsEnabled()) return;
  emitPlay(id);
}

function emitStop(id: SoundId): void {
  sounds.onStop(id);
  io.emit('game:stop_sound', id);
}

function emitStopAll(): void {
  sounds.onStopAll();
  io.emit('game:stop_all_sounds');
}

// Пересылка записей журнала только режиссёру
log.subscribe((entry) => {
  const director = session.getDirector();
  if (director) io.to(director.socketId).emit('log:append', entry);
});

// ---------- WebSocket ----------
io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
  log.info('conn.open', `новое соединение ${socket.id}`);

  socket.on('session:join', (payload: JoinPayload, ack: Ack<GameState>) => {
    if (!game) {
      ack({ok: false, error: 'Сервер не готов'});
      return;
    }
    const role = payload?.role;
    if (role !== 'director' && role !== 'host' && role !== 'player') {
      ack({ok: false, error: 'Некорректная роль'});
      return;
    }
    const result = session.tryJoin(socket.id, role, payload?.name ?? '', session.hasDirector());
    if (!result.ok) {
      log.warn('session.join', `отказ ${socket.id} в роли ${role}: ${result.error}`);
      socket.emit('session:kicked', result.error);
      ack({ok: false, error: result.error});
      return;
    }
    socket.join(`role:${role}`);
    log.info('session.join', `${result.client.name} вошёл как ${role}`);
    broadcastState();
    ack({
      ok: true,
      data: game.snapshot(
        session.allClients(),
        session.hasDirector(),
        log.recent(30),
        sounds.snapshot(),
      ),
    });
  });

  socket.on('session:leave', () => {
    const client = session.onVoluntaryLeave(socket.id);
    if (client) {
      log.info('session.leave', `${client.name} вышел добровольно, роль освобождена`);
      broadcastState();
    }
  });

  socket.on('session:ping', (ack) => {
    ack({ok: true, data: {serverTime: Date.now()}});
  });

  socket.on('sound:ended', (soundId: SoundId) => {
    // Клиент сообщает что короткий звук доиграл сам.
    // Снимаем подсветку у всех клиентов
    if (sounds.snapshot().includes(soundId)) {
      sounds.onStop(soundId);
      io.emit('game:stop_sound', soundId);
      broadcastState();
    }
  });

  socket.on('host:select_answer', (answerIndex) => {
    if (!game) return;
    const client = session.getClient(socket.id);
    if (!client || client.role !== 'host') {
      denyCommand(undefined, 'host.select', 'Только ведущий может выбирать ответ', socket);
      return;
    }
    const r = game.selectAnswer(answerIndex);
    if (!r.ok) {
      denyCommand(undefined, 'host.select', r.reason, socket);
      return;
    }
    log.info('host.select', `ведущий выбрал ${['A', 'B', 'C', 'D'][answerIndex]}`);
    broadcastState();
  });

  socket.on('host:lock_answer', (ack) => {
    if (!game) return;
    const client = session.getClient(socket.id);
    if (!client || client.role !== 'host') {
      denyCommand(ack, 'host.lock', 'Только ведущий может фиксировать ответ', socket);
      return;
    }
    const r = game.lockAnswer();
    if (!r.ok) {
      denyCommand(ack, 'host.lock', r.reason, socket);
      return;
    }
    log.info('host.lock', 'ведущий зафиксировал ответ');
    const level = game.getCurrentQuestionIndex() + 1;
    emitAutoPlay(lockForLevel(level));
    broadcastState();
    ack({ok: true, data: null});
  });

  socket.on('director:command', (cmd: DirectorCommand, ack: Ack<null>) => {
    if (!game) return;
    const client = session.getClient(socket.id);
    if (!client || client.role !== 'director') {
      denyCommand(ack, 'director.cmd', 'Нет прав режиссёра', socket);
      return;
    }
    applyDirectorCommand(cmd, ack);
  });

  socket.on('disconnect', (reason) => {
    const client = session.onDisconnect(socket.id);
    log.info(
      'conn.close',
      `${socket.id} отключён (${reason})${client ? ` был ${client.role}` : ''}`,
    );
    broadcastState();
  });
});

// ---------- Команды режиссёра ----------
function applyDirectorCommand(cmd: DirectorCommand, ack: Ack<null>): void {
  if (!game) return;
  const tag = 'director.cmd';

  if (cmd.type === 'START_GAME') {
    const r = game.startGame();
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    log.info(tag, 'игра запущена');
    emitStopAll();
    emitAutoPlay('INTRO');
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'SHOW_INTRO') {
    emitAutoPlay('LETS_PLAY');
    log.info(tag, 'заставка LETS_PLAY');
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'ARM_QUESTION') {
    const r = game.armQuestion();
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    const level = game.getCurrentQuestionIndex() + 1;
    log.info(tag, `вопрос уровня ${level} подготовлен, виден режиссёру`);
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'SHOW_QUESTION') {
    const r = game.showQuestion();
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    const level = game.getCurrentQuestionIndex() + 1;
    log.info(tag, `вопрос уровня ${level} показан игроку и ведущему`);
    emitAutoPlay(bgmForLevel(level));
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'SKIP_QUESTION') {
    const r = game.skipQuestion();
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    const level = game.getCurrentQuestionIndex() + 1;
    log.info(tag, `пропущен вопрос уровня ${level}, подготовлен следующий`);
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'REVEAL_ANSWER') {
    const r = game.revealAnswer();
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    const q = game.getCurrentQuestion();
    const selected = game.getSelectedAnswerIndex();
    const isCorrect = q && selected !== null && q.answers[selected]?.isCorrect === true;
    const level = game.getCurrentQuestionIndex() + 1;
    log.info(tag, `раскрыт ответ: ${isCorrect ? 'верно' : 'неверно'}`);
    emitStop(bgmForLevel(level));
    emitAutoPlay(isCorrect ? correctForLevel(level) : wrongForLevel(level));
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'NEXT_QUESTION') {
    const r = game.nextQuestion();
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    log.info(tag, `переход дальше, стадия ${game.getStage()}`);
    if (game.getStage() === 'END') {
      emitStopAll();
      if (!game) return;
      const state = game.snapshot(
        session.allClients(),
        session.hasDirector(),
        log.recent(30),
        sounds.snapshot(),
      );
      emitAutoPlay(state.endReason === 'WIN_MILLION' ? 'FANFARE' : 'GOODBYE');
    }
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'END_GAME') {
    const r = game.endGame('MANUAL_END');
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    log.info(tag, 'игра завершена режиссёром');
    emitStopAll();
    emitAutoPlay('GOODBYE');
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'RESET_GAME') {
    game.resetGame();
    session.clearReservations();
    log.info(tag, 'игра сброшена');
    emitStopAll();
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'TOGGLE_AUTO_SOUNDS') {
    if (!game) {
      ack({ok: false, error: 'Игра не инициализирована'});
      return;
    }
    const enabled = game.toggleAutoSounds();
    log.info(tag, `автоматические звуки: ${enabled ? 'включены' : 'выключены'}`);
    if (!enabled) {
      // При выключении заглушаем то что играло
      emitStopAll();
    }
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'PLAY_SOUND') {
    emitPlay(cmd.soundId);
    log.info(tag, `звук PLAY: ${cmd.soundId}`);
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'STOP_SOUND') {
    emitStop(cmd.soundId);
    log.info(tag, `звук STOP: ${cmd.soundId}`);
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'STOP_ALL_SOUNDS') {
    emitStopAll();
    log.info(tag, 'все звуки остановлены');
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'ACTIVATE_LIFELINE') {
    const r = game.activateLifeline(cmd.lifeline);
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    log.info(tag, `активирована подсказка ${cmd.lifeline}`);
    const soundMap: Record<LifelineId, SoundId> = {
      FIFTY_FIFTY: 'LIFELINE_FIFTY_FIFTY',
      PHONE_A_FRIEND: 'LIFELINE_PHONE',
      ASK_AUDIENCE: 'LIFELINE_AUDIENCE',
    };
    emitAutoPlay(soundMap[cmd.lifeline]);
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'SET_AUDIENCE_POLL') {
    const r = game.setAudiencePoll(cmd.poll);
    if (!r.ok) return denyCommand(ack, tag, r.reason);
    log.info(tag, `ручной ввод процентов зала: ${cmd.poll.join('/')}`);
    broadcastState();
    ack({ok: true, data: null});
    return;
  }

  if (cmd.type === 'LOAD_PACK') {
    try {
      const {pack, questions, warnings} = loader.loadByFilename(cmd.packId);
      const r = game.loadPack(questions, pack.name);
      if (!r.ok) return denyCommand(ack, tag, r.reason);
      log.info(tag, `загружен пакет "${pack.name}" (${questions.length} вопросов)`);
      for (const w of warnings) log.warn('pack.parse', w);
      broadcastState();
      ack({ok: true, data: null});
      return;
    } catch (err) {
      denyCommand(ack, tag, String(err));
      return;
    }
  }
}

// ---------- Старт сервера ----------
server.listen(PORT, HOST, () => {
  log.info('server.listen', `сервер запущен на ${HOST}:${PORT}`);
  printLocalAddresses(PORT);
});

function printLocalAddresses(port: number): void {
  try {
    const nets = os.networkInterfaces();
    const ips: string[] = [];
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
      }
    }
    console.log('');
    console.log('==== Подключение к серверу ====');
    console.log(`   Локально:  http://localhost:${port}`);
    for (const ip of ips) console.log(`   LAN:       http://${ip}:${port}`);
    console.log('===============================');
    console.log('');
  } catch {
    // в некоторых средах os может быть недоступен
  }
}

// Грациозная остановка
function shutdown(): void {
  log.info('server.shutdown', 'получен сигнал остановки');
  persist();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
