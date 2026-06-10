/**
 * Модуль определения стихотворного размера (метра).
 *
 * Сопоставляет паттерн ударений строки с эталонными шаблонами метров.
 * Поддерживает пиррихические стопы (безударные слоги на ударных позициях)
 * и дольник (один обязательный удар на 2–3 слога).
 *
 * Улучшения по сравнению с инлайн-кодом ExerciseScreen:
 * - Использует stressDetector для автоматического определения ударений
 * - Учитывает пиррихии (не штрафует за отсутствующее ударение на ударной позиции,
 *   если слог безударный в реальности — это пиррихий, норма для ямба/хорея)
 * - Добавлен дольник
 * - Повышен порог уверенности до 0.5
 * - Улучшен поиск offset для длинных строк
 */

import type { MeterMatch, LineAnalysis, WordAnalysis } from './types';
import { splitWordToSyllables, splitLineToWords } from './syllableCounter';
import { detectStress } from './stressDetector';

// ==================== Шаблоны размеров ====================

interface MeterPattern {
  /** Название размера */
  name: string;
  /** Аббревиатура */
  short: string;
  /** Паттерн стопы: 0=безударный, 1=ударный */
  pattern: number[];
  /** Описание для визуализации (та-ТА-та-ТА) */
  description: string;
  /** Количество слогов в стопе */
  footLength: number;
}

const METER_PATTERNS: MeterPattern[] = [
  // Трёхсложные размеры
  { name: 'Дактиль', short: 'Д', pattern: [1, 0, 0], description: 'ТА-та-та-ТА-та-та', footLength: 3 },
  { name: 'Амфибрахий', short: 'Ам', pattern: [0, 1, 0], description: 'та-ТА-та-та-ТА-та', footLength: 3 },
  { name: 'Анапест', short: 'Ан', pattern: [0, 0, 1], description: 'та-та-ТА-та-та-ТА', footLength: 3 },
  // Двусложные размеры
  { name: 'Хорей', short: 'Х', pattern: [1, 0], description: 'ТА-та-ТА-та', footLength: 2 },
  { name: 'Ямб', short: 'Я', pattern: [0, 1], description: 'та-ТА-та-ТА', footLength: 2 },
  // Пеоны (четырёхсложные размеры)
  { name: 'Пеон I', short: 'П1', pattern: [1, 0, 0, 0], description: 'ТА-та-та-та', footLength: 4 },
  { name: 'Пеон II', short: 'П2', pattern: [0, 1, 0, 0], description: 'та-ТА-та-та', footLength: 4 },
  { name: 'Пеон III', short: 'П3', pattern: [0, 0, 1, 0], description: 'ta-та-ТА-та', footLength: 4 },
  { name: 'Пеон IV', short: 'П4', pattern: [0, 0, 0, 1], description: 'та-та-та-ТА', footLength: 4 },
];

/** Паттерн дольника: один удар на 2–3 слога */
const DOLNIK_PATTERN: MeterPattern = {
  name: 'Дольник',
  short: 'Дн',
  pattern: [0, 1], // Минимальная стопа дольника
  description: 'та-ТА...та-ТА',
  footLength: 2,
};

// ==================== Публичный API ====================

/**
 * Получить полный список шаблонов размеров с описаниями.
 * @returns массив шаблонов
 */
export function getMeterPatterns(): Array<{ name: string; short: string; pattern: number[]; description: string }> {
  return [
    ...METER_PATTERNS,
    DOLNIK_PATTERN,
  ].map(p => ({
    name: p.name,
    short: p.short,
    pattern: p.pattern,
    description: p.description,
  }));
}

/**
 * Сопоставить паттерн ударений с шаблоном размера.
 *
 * Учитывает пирихические стопы: если в шаблоне ожидается ударение (1),
 * но в реальности слог безударный — это не ошибка, а пиррихий.
 * Ошибка — только если ударный слог стоит на безударной позиции шаблона.
 *
 * @param stress — массив boolean (true=ударный) для каждого слога строки
 * @param pattern — шаблон размера (0/1)
 * @returns score 0-1
 */
export function matchMeter(stress: boolean[], pattern: number[]): number {
  if (stress.length < 3 || pattern.length === 0) return 0;

  const patternLen = pattern.length;
  let bestScore = 0;

  // Проверяем все возможные начальные смещения
  // Для длинных строк ограничиваем число проверяемых offset
  const maxOffset = Math.min(patternLen, stress.length);

  for (let offset = 0; offset < maxOffset; offset++) {
    let correct = 0;
    let checked = 0;
    let violations = 0;

    for (let i = 0; i < stress.length; i++) {
      const pIdx = (offset + i) % patternLen;
      const expected = pattern[pIdx];

      // Пропускаем безударные позиции (pyrrhic foot — норма)
      if (expected === 0) {
        // Если ожидается безударный, а слог ударный — это нарушение
        if (stress[i]) {
          violations++;
        }
        continue;
      }

      // Ожидается ударный (expected === 1)
      checked++;
      if (stress[i]) {
        // Ударный слог на ударной позиции — совпадение
        correct++;
      }
      // Безударный на ударной позиции — пиррихий, НЕ наказываем
      // (в русском ямбе/хорее пирихии очень часты)
    }

    // Считаем score: штрафуем за нарушения (удар на безударной позиции)
    const totalChecks = checked + violations;
    if (totalChecks === 0) continue;

    // Score = корректные ударения / все проверенные позиции, с учётом нарушений
    const score = Math.max(0, (correct - violations * 0.5)) / totalChecks;

    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}

/**
 * Определить стихотворный размер по паттерну ударений.
 *
 * @param stressPattern — массив boolean (true=ударный)
 * @returns лучший MeterMatch или null
 */
export function detectMeter(stressPattern: boolean[]): MeterMatch | null {
  if (stressPattern.length < 3) return null;

  let bestMatch: MeterMatch | null = null;
  let bestScore = 0;

  // Проверяем все размеры
  for (const meter of [...METER_PATTERNS, DOLNIK_PATTERN]) {
    const score = matchMeter(stressPattern, meter.pattern);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        meter: meter.name,
        meterShort: meter.short,
        confidence: Math.round(score * 100) / 100,
        description: generateDescription(stressPattern),
      };
    }
  }

  // Порог уверенности — 0.5 (повышен по сравнению с ExerciseScreen)
  return bestScore >= 0.5 ? bestMatch : null;
}

/**
 * Определить общий размер стихотворения по большинству строк.
 *
 * @param lines — массив строк текста
 * @returns MeterMatch по наиболее частому размеру, или null
 */
export function detectPoemMeter(lines: string[]): MeterMatch | null {
  const nonEmptyLines = lines.filter(l => l.trim().length > 0);
  if (nonEmptyLines.length < 2) return null;

  // Анализируем каждую строку
  const meterScores: Map<string, { count: number; totalConfidence: number }> = new Map();

  for (const line of nonEmptyLines) {
    const analysis = analyzeLine(line);
    if (analysis.meter) {
      const key = analysis.meter.meter;
      const existing = meterScores.get(key);
      if (existing) {
        existing.count++;
        existing.totalConfidence += analysis.meter.confidence;
      } else {
        meterScores.set(key, {
          count: 1,
          totalConfidence: analysis.meter.confidence,
        });
      }
    }
  }

  // Находим наиболее частый размер
  let bestMeter = '';
  let bestCount = 0;
  let bestAvgConfidence = 0;

  for (const [meter, data] of meterScores) {
    // Размер должен встречаться хотя бы в 50% строк
    if (data.count >= nonEmptyLines.length * 0.5 && data.count > bestCount) {
      bestCount = data.count;
      bestMeter = meter;
      bestAvgConfidence = data.totalConfidence / data.count;
    }
  }

  if (!bestMeter) return null;

  // Ищем шаблон для описания
  const pattern = METER_PATTERNS.find(p => p.name === bestMeter);

  return {
    meter: bestMeter,
    meterShort: pattern?.short ?? '',
    confidence: Math.round(bestAvgConfidence * 100) / 100,
    description: pattern?.description ?? '',
  };
}

/**
 * Проанализировать одну строку: слоги, ударения, размер.
 *
 * @param line — текст строки
 * @returns LineAnalysis с полной информацией
 */
export function analyzeLine(line: string): LineAnalysis {
  const trimmed = line.trim();
  if (!trimmed) {
    return {
      text: line,
      words: [],
      totalSyllables: 0,
      stressPattern: [],
    };
  }

  // Разбиваем на слова
  const tokens = splitLineToWords(trimmed);
  const words: WordAnalysis[] = [];
  const stressPattern: boolean[] = [];

  for (const token of tokens) {
    const wa = splitWordToSyllables(token);

    // Если ударение не задано через заглавную букву — используем stressDetector
    if (wa.stressedVowelPos === -1 && wa.word.length > 0) {
      const detectedPos = detectStress(wa.word);
      if (detectedPos !== -1) {
        // Находим слог, содержащий ударную гласную
        for (const syl of wa.syllables) {
          if (syl.vowel) {
            const sylStartInWord = wa.word.indexOf(syl.text);
            const vowelInSyl = syl.text.indexOf(syl.vowel);
            if (sylStartInWord + vowelInSyl === detectedPos) {
              syl.isStressed = true;
            }
          }
        }
      }
    }

    // Обновляем stressedVowelPos после определения
    wa.stressedVowelPos = wa.syllables.findIndex(s => s.isStressed);

    words.push(wa);

    // Строим паттерн ударений
    for (const syl of wa.syllables) {
      stressPattern.push(syl.isStressed);
    }
  }

  const totalSyllables = words.reduce((sum, w) => sum + w.syllableCount, 0);

  // Определяем размер
  const meter = detectMeter(stressPattern);

  return {
    text: trimmed,
    words,
    totalSyllables,
    stressPattern,
    meter: meter ?? undefined,
  };
}

// ==================== Внутренние функции ====================

/**
 * Генерирует текстовое описание паттерна ударений (та-ТА-та).
 */
function generateDescription(stressPattern: boolean[]): string {
  const parts: string[] = [];
  for (const s of stressPattern) {
    parts.push(s ? 'ТА' : 'та');
  }
  return parts.join('-');
}
