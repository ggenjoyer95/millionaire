import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import crypto from 'crypto';

interface Question {
    id: string;
    text: string;
    answers: {
        text: string;
        isCorrect: boolean;
    }[];
    comment?: string;
}

const parseFile = (filename: string): Question[] => {
    const filePath = path.join(__dirname, filename);

    const buffer = fs.readFileSync(filePath);
    const content = iconv.decode(buffer, 'win1251');

    const blocks = content.split(/\r?\n\r?\n/);

    const questions: Question[] = [];

    blocks.forEach((block, index) => {
        const lines = block.trim().split(/\r?\n/);

        if (lines.length < 7) return;

        const questionText = lines[1].trim();
        const answersRaw = [lines[2], lines[3], lines[4], lines[5]].map(s => s.trim());
        const correctIndex = parseInt(lines[6].trim()) - 1; // Превращаем "1" в индекс 0

        let comment = lines[7]?.trim();
        if (comment === '---') comment = undefined;

        // Валидация
        if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) {
            console.warn(`Skipping question ${lines[0]}: Invalid correct answer index`);
            return;
        }

        const questionObj: Question = {
            id: crypto.randomUUID(),
                   text: questionText,
                   answers: answersRaw.map((ans, idx) => ({
                       text: ans,
                       isCorrect: idx === correctIndex
                   })),
                   comment: comment
        };

        questions.push(questionObj);
    });

    return questions;
};

try {
    const questions1 = parseFile('base_1.txt');
    console.log(`Parsed ${questions1.length} questions from base_1.txt`);

    const outputPath = path.join(__dirname, 'questions.json');
    fs.writeFileSync(outputPath, JSON.stringify(questions1, null, 2));
    console.log(`Saved to ${outputPath}`);

} catch (e) {
    console.error('Error parsing:', e);
}
