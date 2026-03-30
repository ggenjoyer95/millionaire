import {SoundId} from '@millu/shared';

/** Фоновый луп для уровня 1..15. */
export function bgmForLevel(level: number): SoundId {
  if (level <= 5) return 'BGM_Q1_5';
  const map: Record<number, SoundId> = {
    6: 'BGM_Q6',
    7: 'BGM_Q7',
    8: 'BGM_Q8',
    9: 'BGM_Q9',
    10: 'BGM_Q10',
    11: 'BGM_Q11',
    12: 'BGM_Q12',
    13: 'BGM_Q13',
    14: 'BGM_Q14',
    15: 'BGM_Q15',
  };
  return map[level] ?? 'BGM_Q1_5';
}

/** Звук фиксации ответа в зависимости от уровня. */
export function lockForLevel(level: number): SoundId {
  if (level <= 5) return 'CORRECT_Q1_5';
  if (level <= 10) return 'LOCK_Q6';
  if (level <= 14) return 'LOCK_Q11';
  return 'LOCK_Q15';
}

/** Звук правильного ответа. */
export function correctForLevel(level: number): SoundId {
  if (level < 5) return 'CORRECT_Q1_5';
  if (level === 5) return 'CORRECT_Q5';
  if (level <= 9) return 'CORRECT_Q6';
  if (level === 10) return 'CORRECT_Q10';
  if (level <= 14) return 'CORRECT_Q11';
  return 'CORRECT_Q15';
}

/** Звук неправильного ответа. */
export function wrongForLevel(level: number): SoundId {
  if (level <= 5) return 'WRONG_Q1_5';
  if (level <= 10) return 'WRONG_Q6';
  if (level <= 14) return 'WRONG_Q11';
  return 'WRONG_Q15';
}
