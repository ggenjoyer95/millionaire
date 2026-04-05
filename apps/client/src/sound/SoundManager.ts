import {Howl, Howler} from 'howler';
import type {SoundId} from '@millu/shared';

/**
 * Менеджер звуков клиента.
 * Файлы лежат в public/sounds/khsm. Используется набор треков из
 * fan-приложения О, счастливчик.
 *
 * Правила:
 *   - в любой момент играет максимум один звук. Новый play(id) тут же
 *     останавливает предыдущий, чтобы не было наложений;
 *   - короткие звуки автоматически снимаются по событию end. Менеджер
 *     зовёт onEnded callback и сообщает наружу какой звук завершился;
 *   - залупленные звуки сами не заканчиваются и снимаются только по
 *     stop(id) или play(другогоId).
 */

const BASE = '/sounds/khsm';

interface SoundConfig {
  file: string;
  loop?: boolean;
  volume?: number;
}

const SOUND_MAP: Record<SoundId, SoundConfig> = {
  INTRO:        {file: `${BASE}/khsm_intro.mp3`, volume: 0.9},
  LETS_PLAY:    {file: `${BASE}/khsm_lets_play.mp3`, volume: 0.9},
  MAIN_SHORT:   {file: `${BASE}/khsm_main_short.mp3`, volume: 0.9},
  CLOSING:      {file: `${BASE}/khsm_closing.mp3`, volume: 0.9},
  GOODBYE:      {file: `${BASE}/khsm_goodbye.mp3`, volume: 0.9},
  FANFARE:      {file: `${BASE}/khsm_fanfare.mp3`, volume: 0.9},
  COMMERCIAL:   {file: `${BASE}/khsm_commercial.mp3`, volume: 0.8},
  PLAYERS:      {file: `${BASE}/khsm_players.mp3`, volume: 0.9},
  HS_INTRO:     {file: `${BASE}/khsm_hs_intro.mp3`, volume: 0.9},
  BGM_Q1_5:     {file: `${BASE}/khsm_q1-5.mp3`, volume: 0.5, loop: true},
  BGM_Q6:       {file: `${BASE}/khsm_q6.mp3`, volume: 0.5, loop: true},
  BGM_Q7:       {file: `${BASE}/khsm_q7.mp3`, volume: 0.5, loop: true},
  BGM_Q8:       {file: `${BASE}/khsm_q8.mp3`, volume: 0.5, loop: true},
  BGM_Q9:       {file: `${BASE}/khsm_q9.mp3`, volume: 0.5, loop: true},
  BGM_Q10:      {file: `${BASE}/khsm_q10.mp3`, volume: 0.5, loop: true},
  BGM_Q11:      {file: `${BASE}/khsm_q11.mp3`, volume: 0.5, loop: true},
  BGM_Q12:      {file: `${BASE}/khsm_q12.mp3`, volume: 0.5, loop: true},
  BGM_Q13:      {file: `${BASE}/khsm_q13.mp3`, volume: 0.5, loop: true},
  BGM_Q14:      {file: `${BASE}/khsm_q14.mp3`, volume: 0.5, loop: true},
  BGM_Q15:      {file: `${BASE}/khsm_q15.mp3`, volume: 0.5, loop: true},
  LOCK_Q6:      {file: `${BASE}/khsm_q6-final.mp3`, volume: 0.9},
  LOCK_Q11:     {file: `${BASE}/khsm_q11-final.mp3`, volume: 0.9},
  LOCK_Q15:     {file: `${BASE}/khsm_q15-final.mp3`, volume: 0.9},
  CORRECT_Q1_5: {file: `${BASE}/khsm_q1-5-correct.wav`, volume: 0.9},
  CORRECT_Q5:   {file: `${BASE}/khsm_q5-correct.mp3`, volume: 0.9},
  CORRECT_Q6:   {file: `${BASE}/khsm_q6-correct.mp3`, volume: 0.9},
  CORRECT_Q10:  {file: `${BASE}/khsm_q10-correct.mp3`, volume: 0.9},
  CORRECT_Q11:  {file: `${BASE}/khsm_q11-correct.mp3`, volume: 0.9},
  CORRECT_Q15:  {file: `${BASE}/khsm_q15-correct.mp3`, volume: 1.0},
  WRONG_Q1_5:   {file: `${BASE}/khsm_q1-5-wrong.mp3`, volume: 0.9},
  WRONG_Q6:     {file: `${BASE}/khsm_q6-wrong.mp3`, volume: 0.9},
  WRONG_Q11:    {file: `${BASE}/khsm_q11-wrong.mp3`, volume: 0.9},
  WRONG_Q15:    {file: `${BASE}/khsm_q15-wrong.mp3`, volume: 0.9},
  LIFELINE_FIFTY_FIFTY: {file: `${BASE}/khsm_50-50.wav`, volume: 0.8},
  LIFELINE_PHONE:       {file: `${BASE}/khsm_lifeline_1.wav`, volume: 0.8},
  LIFELINE_AUDIENCE:    {file: `${BASE}/khsm_lifeline_2.wav`, volume: 0.8},
  LIFELINE_SWITCH:      {file: `${BASE}/khsm_lifeline_3.wav`, volume: 0.8},
  PHONE_DIALING:        {file: `${BASE}/khsm_phone_dialing.mp3`, volume: 0.8},
  PHONE_COUNTDOWN:      {file: `${BASE}/khsm_phone_countdown.mp3`, volume: 0.8, loop: true},
  PHONE_END:            {file: `${BASE}/khsm_phone_end.mp3`, volume: 0.8},
  AUDIENCE_BEGIN:       {file: `${BASE}/khsm_aud_begin.mp3`, volume: 0.8},
  AUDIENCE_VOTING:      {file: `${BASE}/khsm_aud_voting.mp3`, volume: 0.8, loop: true},
  AUDIENCE_FULL:        {file: `${BASE}/khsm_aud_full.mp3`, volume: 0.8},
  LADDER:       {file: `${BASE}/khsm_ld.mp3`, volume: 0.8},
  LADDER_5_10:  {file: `${BASE}/khsm_ld_5_10.mp3`, volume: 0.8},
  LADDER_START: {file: `${BASE}/khsm_ld_start.mp3`, volume: 0.8},
  MONEY_1:      {file: `${BASE}/khsm_money_1.mp3`, volume: 0.8},
  MONEY_2:      {file: `${BASE}/khsm_money_2.mp3`, volume: 0.8},
};

class SoundManager {
  private readonly sounds = new Map<SoundId, Howl>();
  private muted = false;
  private current: SoundId | null = null;
  private onEndedCallback: ((id: SoundId) => void) | null = null;
  private unlocked = false;

  constructor() {
    for (const id of Object.keys(SOUND_MAP) as SoundId[]) {
      const cfg = SOUND_MAP[id];
      const sound = new Howl({
        src: [cfg.file],
        loop: cfg.loop ?? false,
        volume: cfg.volume ?? 1.0,
        // html5: true для длинных лупов, чтобы не загружать целиком в память
        html5: cfg.loop === true,
        onloaderror: (_soundId, error) => {
          console.warn(`[SoundManager] не удалось загрузить ${id}: ${cfg.file}`, error);
        },
        onplayerror: (_soundId, error) => {
          console.warn(`[SoundManager] ошибка воспроизведения ${id}`, error);
          // Часто это связано с политикой autoplay браузера.
          // Пытаемся разблокировать аудиоконтекст ещё раз.
          this.tryUnlock();
        },
        onend: () => {
          if (this.current === id) this.current = null;
          if (this.onEndedCallback) this.onEndedCallback(id);
        },
      });
      this.sounds.set(id, sound);
    }
    this.installUnlockHandlers();
  }

  /**
   * На мобильных браузерах WebAudio контекст создаётся в suspended
   * состоянии и разблокируется только после user-gesture.
   * Подписываемся на первый клик/касание/нажатие клавиши и
   * принудительно разблокируем контекст.
   */
  private installUnlockHandlers(): void {
    if (typeof window === 'undefined') return;
    const handler = () => {
      this.tryUnlock();
      if (this.unlocked) {
        window.removeEventListener('click', handler);
        window.removeEventListener('touchstart', handler);
        window.removeEventListener('keydown', handler);
      }
    };
    window.addEventListener('click', handler);
    window.addEventListener('touchstart', handler);
    window.addEventListener('keydown', handler);
  }

  private tryUnlock(): void {
    try {
      const ctx = Howler.ctx;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          this.unlocked = true;
        }).catch(() => {});
      } else if (ctx && ctx.state === 'running') {
        this.unlocked = true;
      }
    } catch {
      // не критично, попробуем при следующем play
    }
  }

  /** Подписка на завершение звука. Вызывается когда короткий звук доиграл. */
  setOnEndedCallback(cb: ((id: SoundId) => void) | null): void {
    this.onEndedCallback = cb;
  }

  /**
   * Запускает звук, гарантированно остановив все остальные.
   * Это правило "один звук одновременно" решает проблему наложения.
   */
  play(id: SoundId): void {
    if (this.muted) return;
    this.stopAllInternal();
    const sound = this.sounds.get(id);
    if (!sound) {
      console.warn(`[SoundManager] неизвестный звук ${id}`);
      return;
    }
    this.current = id;
    try {
      sound.play();
    } catch (err) {
      console.warn(`[SoundManager] play бросил исключение для ${id}`, err);
      this.current = null;
    }
  }

  /**
   * Принудительно проигрывает звук в цикле, даже если в SOUND_MAP он
   * помечен как короткий. Используется для главного меню чтобы INTRO
   * звучал постоянно.
   */
  playLoop(id: SoundId): void {
    if (this.muted) return;
    this.stopAllInternal();
    const sound = this.sounds.get(id);
    if (!sound) return;
    sound.loop(true);
    this.current = id;
    try {
      sound.play();
    } catch {
      this.current = null;
    }
  }

  stop(id: SoundId): void {
    const sound = this.sounds.get(id);
    if (sound) {
      sound.stop();
      // Если этот звук изначально не залупленный, снимаем флаг loop
      // (он мог быть выставлен через playLoop)
      if (!SOUND_MAP[id].loop) sound.loop(false);
    }
    if (this.current === id) this.current = null;
  }

  stopAll(): void {
    this.stopAllInternal();
  }

  private stopAllInternal(): void {
    for (const sound of this.sounds.values()) sound.stop();
    this.current = null;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    Howler.mute(this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setGlobalVolume(volume: number): void {
    Howler.volume(Math.min(1, Math.max(0, volume)));
  }
}

export const soundManager = new SoundManager();
