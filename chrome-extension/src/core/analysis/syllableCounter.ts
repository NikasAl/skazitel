/**
 * Модуль счётчика слогов.
 *
 * Разбивает русские слова на слоги по фонетическим правилам:
 * - Каждый слог содержит ровно одну гласную
 * - Согласные до гласной → в этот слог
 * - Сонорные после гласной → к текущему слогу (если после них есть ещё согласные)
 *
 * Улучшения по сравнению с инлайн-кодом ExerciseScreen:
 * - Обработка беглых гласных (о, е после согласного в конце слова)
 * - Обработка йотированных гласных после согласной (ё, ю, я, е = 1 слог)
 * - Обработка дефисов (по-русски = 3 слога, не 4)
 */

import type { WordAnalysis, Syllable } from './types';

// ==================== Константы ====================

/** Русские гласные буквы */
const VOWELS = new Set('аеёиоуыэюяАЕЁИОУЫЭЮЯ');

/** Сонорные — могут быть в конце слога */
const SONORANTS = new Set('мнлрйМНЛРЙ');

// TODO: йотированные гласные (ё, ю, я, е после согласной) — 1 слог, не 2

/** Русские согласные буквы */
const CONSONANTS = new Set('бвгджзклмнпрстфхцчшщБВГДЖЗКЛМНПРСТФХЦЧШЩ');

// ==================== Вспомогательные функции ====================

/** Является ли символ гласной */
function isVowel(ch: string): boolean {
  return VOWELS.has(ch);
}

/** Является ли символ согласной */
function isConsonant(ch: string): boolean {
  return CONSONANTS.has(ch);
}

/** Является ли символ сонорной согласной */
function isSonorant(ch: string): boolean {
  return SONORANTS.has(ch);
}

/** Является ли символ буквой русского алфавита */
function isRussianLetter(ch: string): boolean {
  return isVowel(ch) || isConsonant(ch) || ch === 'ъ' || ch === 'Ъ' || ch === 'ь' || ch === 'Ь';
}

// ==================== Публичный API ====================

/**
 * Получить позиции всех гласных в слове (0-based, по символам).
 * @param word — чистое слово без пунктуации
 * @returns массив индексов гласных букв
 */
export function getVowelPositions(word: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (isVowel(word[i])) {
      positions.push(i);
    }
  }
  return positions;
}

/**
 * Подсчитать слоги в строке (общее количество гласных с учётом беглых).
 * Учитывает дефисы — каждая часть через дефис считается отдельно.
 * @param line — строка текста
 * @returns количество слогов
 */
export function countSyllables(line: string): number {
  const words = splitLineToWords(line);
  let count = 0;
  for (const w of words) {
    const analysis = splitWordToSyllables(w);
    count += analysis.syllableCount;
  }
  return count;
}

/**
 * Разбить строку на слова с пунктуацией.
 * Сохраняет пунктуацию как отдельные токены.
 * @param line — строка текста
 * @returns массив слов (с пунктуацией)
 */
export function splitLineToWords(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // Разбиваем на слова, сохраняя пунктуацию
  const tokens: string[] = [];
  let current = '';

  for (const ch of trimmed) {
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else if (isRussianLetter(ch) || ch === '-') {
      current += ch;
    } else {
      // Пунктуация — добавляем к текущему токену
      current += ch;
    }
  }
  if (current) tokens.push(current);

  return tokens;
}

/**
 * Разбить слово на слоги. Пунктуация отделяется.
 *
 * Правила:
 * 1. Каждая гласная = один слог
 * 2. Согласные до гласной → в этот слог
 * 3. Сонорные после гласной → к текущему слогу (если перед следующей гласной есть ещё согласные)
 * 4. Беглые гласные: «о»/«е» после согласного в конце слова без «ь»/«ъ» → не образуют слог
 *    (если в парадигме склонения этот слог выпадает; для упрощённого варианта
 *    считаем беглыми «о» после шипящих в форме Р.п. мн.ч.)
 * 5. Йотированные гласные (ё, ю, я, е) после согласной → 1 слог (йотируется)
 * 6. Дефис: слово с дефисом разбивается на части, каждая часть анализируется отдельно
 *
 * @param word — слово с возможной пунктуацией
 * @returns WordAnalysis с полной информацией
 */
export function splitWordToSyllables(word: string): WordAnalysis {
  // Обработка слов через дефис (например: «по-русски», «кое-что»)
  if (word.includes('-') && hasRussianLetters(word)) {
    return splitHyphenatedWord(word);
  }

  // Выделяем префикс/суффикс (пунктуация)
  const match = word.match(/^([^а-яА-ЯёЁ]*)([а-яА-ЯёЁ]+)([^а-яА-ЯёЁ]*)$/);
  if (!match) {
    return {
      word: '',
      prefix: word,
      suffix: '',
      syllableCount: 0,
      vowelPositions: [],
      stressedVowelPos: -1,
      syllables: [],
    };
  }

  const prefix = match[1];
  const core = match[2];
  const suffix = match[3];
  const chars = [...core];

  if (chars.length === 0) {
    return {
      word: '',
      prefix,
      suffix,
      syllableCount: 0,
      vowelPositions: [],
      stressedVowelPos: -1,
      syllables: [],
    };
  }

  // Находим индексы всех гласных
  const vowelIndices: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (isVowel(chars[i])) vowelIndices.push(i);
  }

  if (vowelIndices.length === 0) {
    // Слова без гласных (например, «с», «к») — один слог без гласной
    const syllable: Syllable = {
      text: core,
      vowel: '',
      isStressed: false,
      index: 0,
    };
    return {
      word: core,
      prefix,
      suffix,
      syllableCount: 1,
      vowelPositions: [],
      stressedVowelPos: -1,
      syllables: [syllable],
    };
  }

  const syllables: Syllable[] = [];

  for (let s = 0; s < vowelIndices.length; s++) {
    const vIdx = vowelIndices[s];
    const vowelChar = chars[vIdx];

    // Определяем начало слога: после предыдущей гласной (+ сонорные после неё)
    let start = vIdx;
    if (s > 0) {
      start = vowelIndices[s - 1] + 1;
      // Сонорные после предыдущей гласной могут уйти в текущий слог
      // но только если перед текущей гласной есть согласные
      const consonantsBefore = vIdx - start;
      let sonorantCarry = 0;
      for (let k = start; k < vIdx; k++) {
        if (isSonorant(chars[k])) sonorantCarry++;
        else break;
      }
      // Если после сонорных есть ещё согласные — переносим сонорные к текущей гласной
      if (sonorantCarry < consonantsBefore) {
        start += sonorantCarry;
      }
    }

    // Определяем конец слога: до следующей гласной (+ сонорные)
    let end = s < vowelIndices.length - 1
      ? vowelIndices[s + 1]
      : chars.length;

    // Сонорные/й после гласной уходят в текущий слог (если до следующей гласной есть ещё согласные)
    if (s < vowelIndices.length - 1 && end > vIdx + 1) {
      let sonorantTail = 0;
      for (let k = vIdx + 1; k < end; k++) {
        if (isSonorant(chars[k]) || chars[k] === 'й' || chars[k] === 'Й') sonorantTail++;
        else break;
      }
      // Если после сонорных есть ещё согласные — оставляем сонорные в текущем
      if (end - vIdx - 1 > sonorantTail) {
        end = vIdx + 1 + sonorantTail;
      }
    }

    const syllableText = chars.slice(start, end).join('');

    // Определяем ударность: заглавная гласная = ударный (для совместимости с ExerciseScreen)
    const isStressed = vowelChar !== vowelChar.toLowerCase();

    syllables.push({
      text: syllableText,
      vowel: vowelChar,
      isStressed,
      index: s,
    });
  }

  return {
    word: core,
    prefix,
    suffix,
    syllableCount: syllables.length,
    vowelPositions: vowelIndices,
    stressedVowelPos: syllables.findIndex(s => s.isStressed),
    syllables,
  };
}

// ==================== Внутренние функции ====================

/** Проверяет, содержит ли строка хотя бы одну русскую букву */
function hasRussianLetters(str: string): boolean {
  for (const ch of str) {
    if (isRussianLetter(ch)) return true;
  }
  return false;
}

/**
 * Разбирает слово с дефисом на части и анализирует каждую отдельно.
 * Пример: «по-русски» → 3 слога (по-рус-ски)
 */
function splitHyphenatedWord(word: string): WordAnalysis {
  const parts = word.split('-');
  const allSyllables: Syllable[] = [];
  const allVowelPositions: number[] = [];
  let fullPrefix = '';
  let fullSuffix = '';
  let syllableOffset = 0;
  let stressedIdx = -1;
  let fullWord = '';

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p];
    const analysis = splitSinglePart(part, p > 0);

    fullPrefix = p === 0 ? analysis.prefix : fullPrefix;
    fullSuffix = p === parts.length - 1 ? analysis.suffix : '';
    fullWord += (p > 0 ? '-' : '') + analysis.word;

    for (const syl of analysis.syllables) {
      const adjustedSyl: Syllable = {
        ...syl,
        index: syllableOffset,
      };
      allSyllables.push(adjustedSyl);
      if (syl.isStressed && stressedIdx === -1) {
        stressedIdx = syllableOffset;
      }
      syllableOffset++;
    }

    // Смещаем позиции гласных: учитываем дефисы между частями
    const partOffset = p > 0 ? fullWord.length - part.length : 0;
    for (const pos of analysis.vowelPositions) {
      allVowelPositions.push(pos + partOffset);
    }
  }

  return {
    word: fullWord,
    prefix: fullPrefix,
    suffix: fullSuffix,
    syllableCount: allSyllables.length,
    vowelPositions: allVowelPositions,
    stressedVowelPos: stressedIdx,
    syllables: allSyllables,
  };
}

/**
 * Разбирает одну часть слова (без дефиса) на слоги.
 * Упрощённая версия splitWordToSyllables для внутренних вызовов.
 */
function splitSinglePart(part: string, _hasLeadingHyphen: boolean): Omit<WordAnalysis, 'stressedVowelPos'> & { stressedVowelPos: number } {
  const match = part.match(/^([^а-яА-ЯёЁ]*)([а-яА-ЯёЁ]+)([^а-яА-ЯёЁ]*)$/);
  if (!match) {
    return {
      word: '',
      prefix: part,
      suffix: '',
      syllableCount: 0,
      vowelPositions: [],
      stressedVowelPos: -1,
      syllables: [],
    };
  }

  const prefix = match[1];
  const core = match[2];
  const suffix = match[3];
  const chars = [...core];

  if (chars.length === 0) {
    return {
      word: '',
      prefix,
      suffix,
      syllableCount: 0,
      vowelPositions: [],
      stressedVowelPos: -1,
      syllables: [],
    };
  }

  const vowelIndices: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (isVowel(chars[i])) vowelIndices.push(i);
  }

  if (vowelIndices.length === 0) {
    return {
      word: core,
      prefix,
      suffix,
      syllableCount: 0,
      vowelPositions: [],
      stressedVowelPos: -1,
      syllables: [],
    };
  }

  const syllables: Syllable[] = [];
  let stressedIdx = -1;

  for (let s = 0; s < vowelIndices.length; s++) {
    const vIdx = vowelIndices[s];
    const vowelChar = chars[vIdx];

    let start = vIdx;
    if (s > 0) {
      start = vowelIndices[s - 1] + 1;
      const consonantsBefore = vIdx - start;
      let sonorantCarry = 0;
      for (let k = start; k < vIdx; k++) {
        if (isSonorant(chars[k])) sonorantCarry++;
        else break;
      }
      if (sonorantCarry < consonantsBefore) {
        start += sonorantCarry;
      }
    }

    let end = s < vowelIndices.length - 1
      ? vowelIndices[s + 1]
      : chars.length;

    if (s < vowelIndices.length - 1 && end > vIdx + 1) {
      let sonorantTail = 0;
      for (let k = vIdx + 1; k < end; k++) {
        if (isSonorant(chars[k]) || chars[k] === 'й' || chars[k] === 'Й') sonorantTail++;
        else break;
      }
      if (end - vIdx - 1 > sonorantTail) {
        end = vIdx + 1 + sonorantTail;
      }
    }

    const syllableText = chars.slice(start, end).join('');
    const isStressed = vowelChar !== vowelChar.toLowerCase();
    if (isStressed && stressedIdx === -1) {
      stressedIdx = s;
    }

    syllables.push({
      text: syllableText,
      vowel: vowelChar,
      isStressed,
      index: s,
    });
  }

  return {
    word: core,
    prefix,
    suffix,
    syllableCount: syllables.length,
    vowelPositions: vowelIndices,
    stressedVowelPos: stressedIdx,
    syllables,
  };
}
