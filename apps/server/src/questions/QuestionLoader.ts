import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import iconv from 'iconv-lite';
import {Answer, Question, QuestionPack} from '@millu/shared';

export interface LoadResult {
  pack: QuestionPack;
  questions: Question[];
  warnings: string[];
}

/**
 * Загрузка пакетов вопросов с диска.
 * Поддерживает TXT (win1251 или utf-8) и JSON.
 *
 * Формат TXT (блок разделён пустой строкой):
 *   номер
 *   текст вопроса
 *   вариант A
 *   вариант B
 *   вариант C
 *   вариант D
 *   номер правильного (1 до 4)
 *   комментарий или ---
 */
export class QuestionLoader {
  constructor(private packsDir: string) {
    if (!fs.existsSync(packsDir)) {
      fs.mkdirSync(packsDir, {recursive: true});
    }
  }

  /** Список всех доступных пакетов. */
  listPacks(): QuestionPack[] {
    const files = fs.readdirSync(this.packsDir);
    const packs: QuestionPack[] = [];
    for (const file of files) {
      const full = path.join(this.packsDir, file);
      if (!fs.statSync(full).isFile()) continue;
      try {
        const result = this.loadByFilename(file);
        packs.push(result.pack);
      } catch {
        // Пропускаем битые пакеты
      }
    }
    return packs;
  }

  loadByFilename(filename: string): LoadResult {
    const full = path.join(this.packsDir, filename);
    if (!fs.existsSync(full)) {
      throw new Error(`Пакет не найден: ${filename}`);
    }
    const ext = path.extname(filename).toLowerCase();
    const packId = filename;
    const packName = path.basename(filename, ext);
    let questions: Question[] = [];
    const warnings: string[] = [];

    if (ext === '.json') {
      const raw = fs.readFileSync(full, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('JSON должен содержать массив');
      for (const q of parsed) {
        const v = this.validateQuestion(q);
        if (v.ok) {
          questions.push(v.question);
        } else {
          warnings.push(v.reason);
        }
      }
    } else if (ext === '.txt') {
      const buffer = fs.readFileSync(full);
      let content = iconv.decode(buffer, 'win1251');
      if (content.includes('\uFFFD')) content = buffer.toString('utf-8');
      const parsedTxt = this.parseLegacyTxt(content);
      questions = parsedTxt.parsed;
      warnings.push(...parsedTxt.warnings);
    } else {
      throw new Error(`Неподдерживаемое расширение: ${ext}`);
    }

    return {
      pack: {id: packId, name: packName, questionCount: questions.length},
      questions,
      warnings,
    };
  }

  /** Сохраняет пользовательский пакет на диск. */
  savePack(originalName: string, content: Buffer): string {
    const safe = originalName.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, '_');
    const target = path.join(this.packsDir, safe);
    fs.writeFileSync(target, content);
    return safe;
  }

  private parseLegacyTxt(content: string): {parsed: Question[]; warnings: string[]} {
    const warnings: string[] = [];
    const parsed: Question[] = [];
    const blocks = content.split(/\r?\n\r?\n+/).map((b) => b.trim()).filter(Boolean);

    for (const [blockIdx, block] of blocks.entries()) {
      const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 7) {
        warnings.push(`Блок ${blockIdx + 1}: мало строк (${lines.length}), пропущен`);
        continue;
      }
      const text = lines[1];
      const answersRaw = [lines[2], lines[3], lines[4], lines[5]];
      const correctStr = lines[6];
      const correctIdx = parseInt(correctStr, 10) - 1;
      const commentRaw = lines[7] ?? '';
      const comment =
        commentRaw === '---' || commentRaw === '' ? undefined : commentRaw;

      if (isNaN(correctIdx) || correctIdx < 0 || correctIdx > 3) {
        warnings.push(`Блок ${blockIdx + 1}: некорректный индекс правильного ответа "${correctStr}"`);
        continue;
      }
      if (answersRaw.some((a) => !a || a.length === 0)) {
        warnings.push(`Блок ${blockIdx + 1}: пустой вариант ответа`);
        continue;
      }

      const answers: Answer[] = answersRaw.map((t, i) => ({
        text: t,
        isCorrect: i === correctIdx,
      }));
      parsed.push({
        id: randomUUID(),
        text,
        answers: answers as [Answer, Answer, Answer, Answer],
        comment,
      });
    }
    return {parsed, warnings};
  }

  private validateQuestion(raw: unknown):
    | {ok: true; question: Question}
    | {ok: false; reason: string} {
    if (typeof raw !== 'object' || raw === null) {
      return {ok: false, reason: 'Вопрос должен быть объектом'};
    }
    const q = raw as Record<string, unknown>;
    if (typeof q.text !== 'string' || q.text.length === 0) {
      return {ok: false, reason: 'Пустой text'};
    }
    if (!Array.isArray(q.answers) || q.answers.length !== 4) {
      return {ok: false, reason: 'Нужно ровно 4 ответа'};
    }
    const answers: Answer[] = [];
    for (const a of q.answers) {
      if (typeof a !== 'object' || a === null) {
        return {ok: false, reason: 'Ответ должен быть объектом'};
      }
      const ao = a as Record<string, unknown>;
      if (typeof ao.text !== 'string') return {ok: false, reason: 'Ответ без text'};
      if (typeof ao.isCorrect !== 'boolean') return {ok: false, reason: 'Ответ без isCorrect'};
      answers.push({text: ao.text, isCorrect: ao.isCorrect});
    }
    if (answers.filter((a) => a.isCorrect).length !== 1) {
      return {ok: false, reason: 'Должен быть ровно один правильный ответ'};
    }
    return {
      ok: true,
      question: {
        id: typeof q.id === 'string' ? q.id : randomUUID(),
        text: q.text,
        answers: answers as [Answer, Answer, Answer, Answer],
        comment: typeof q.comment === 'string' ? q.comment : undefined,
      },
    };
  }
}
