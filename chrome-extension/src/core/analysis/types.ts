/**
 * Модуль текстового анализа: типы для разбора стихотворений.
 *
 * Используется «Метристом» в пайплайне для программной проверки
 * размера, слогов и рифм. Также заменяет инлайн-код в ExerciseScreen.tsx.
 */

// ==================== Слог и слово ====================

/** Один слог */
export interface Syllable {
  /** Текст слога */
  text: string;
  /** Гласная буква */
  vowel: string;
  /** Ударный ли */
  isStressed: boolean;
  /** Номер слога в слове (0-based) */
  index: number;
}

/** Результат анализа одного слова */
export interface WordAnalysis {
  /** Исходное слово (без пунктуации) */
  word: string;
  /** Пунктуация до слова */
  prefix: string;
  /** Пунктуация после слова */
  suffix: string;
  /** Количество слогов */
  syllableCount: number;
  /** Индексы всех гласных в word (0-based) */
  vowelPositions: number[];
  /** Индекс ударной гласной в word (-1 если неизвестно) */
  stressedVowelPos: number;
  /** Разбивка на слоги */
  syllables: Syllable[];
}

// ==================== Строка и размер ====================

/** Результат анализа одной строки стихотворения */
export interface LineAnalysis {
  /** Исходный текст строки */
  text: string;
  /** Анализ каждого слова */
  words: WordAnalysis[];
  /** Общее количество слогов */
  totalSyllables: number;
  /** Массив: true=ударный, false=безударный для каждого слога */
  stressPattern: boolean[];
  /** Результат проверки размера */
  meter?: MeterMatch;
}

/** Результат проверки стихотворного размера */
export interface MeterMatch {
  /** Название размера ('Ямб', 'Хорей', ...) */
  meter: string;
  /** Аббревиатура ('Я', 'Х', ...) */
  meterShort: string;
  /** 0-1, степень совпадения с шаблоном */
  confidence: number;
  /** Шаблон ('та-ТА-та-ТА') */
  description: string;
}

// ==================== Рифмы ====================

/** Результат анализа одной рифмопары */
export interface RhymeResult {
  word1: string;
  word2: string;
  type: 'exact' | 'rich' | 'assonance' | 'none';
  /** 0-1 */
  score: number;
  /** Рифменный хвост первого слова */
  tail1: string;
  /** Рифменный хвост второго слова */
  tail2: string;
}

/** Результат анализа рифмовки строфы */
export interface StanzaRhymeAnalysis {
  /** Обнаруженная схема 'АБАБ', 'ААББ' и т.д. */
  scheme: string;
  /** Пары рифм */
  pairs: RhymeResult[];
  /** Проблемы (непарные строки и т.д.) */
  issues: string[];
}

// ==================== Полный анализ ====================

/** Полный анализ стихотворения */
export interface PoemAnalysis {
  /** Построчный анализ */
  lines: LineAnalysis[];
  /** Анализ рифмовки по строфам */
  stanzas: StanzaRhymeAnalysis[];
  /** Общий размер (по большинству строк) */
  overallMeter?: MeterMatch;
  /** 0-1, процент строк с правильным размером */
  meterScore: number;
  /** 0-1, процент точных рифм */
  rhymeScore: number;
  /** Слогов в каждой строке */
  totalSyllablesPerLine: number[];
}
