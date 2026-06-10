/**
 * Модуль проверки рифм.
 *
 * Алгоритм:
 * 1. Для каждого слова находит ударную гласную (через stressDetector)
 * 2. Извлекает «рифменный хвост» — от ударной гласной до конца слова
 * 3. Сравнивает хвосты пар слов:
 *    - exact: хвосты совпадают, согласная ПЕРЕД ударной гласной различается
 *    - rich: хвосты совпадают И согласная+гласная перед ударной гласной тоже совпадают
 *    - assonance: совпадает только ударная гласная или частично согласные
 *    - none: недостаточное совпадение
 *
 * Согласные нормализуются: звонкие/глухие пары считаются одинаковыми
 * (б=п, в=ф, г=к, д=т, ж=ш, з=с).
 */

import type { RhymeResult, StanzaRhymeAnalysis } from './types';
import { detectStress } from './stressDetector';

// ==================== Константы ====================

/** Гласные */
const VOWELS = new Set('аеёиоуыэюяАЕЁИОУЫЭЮЯ');

/**
 * Группы парных согласных (звонкий → глухой и наоборот).
 * Используются для нормализации при сравнении рифм.
 */
const CONSONANT_GROUPS: Map<string, string> = new Map([
  ['б', 'п'], ['п', 'б'],
  ['в', 'ф'], ['ф', 'в'],
  ['г', 'к'], ['к', 'г'],
  ['д', 'т'], ['т', 'д'],
  ['ж', 'ш'], ['ш', 'ж'],
  ['з', 'с'], ['с', 'з'],
]);

// ==================== Вспомогательные функции ====================

/**
 * Нормализовать согласную (звонкую ↔ глухую).
 * Возвращает «базовую» букву для сравнения.
 */
function normalizeConsonant(ch: string): string {
  const lower = ch.toLowerCase();
  return CONSONANT_GROUPS.get(lower) ?? lower;
}

/**
 * Очистить слово от пунктуации и привести к нижнему регистру.
 * @param word — слово (возможно с пунктуацией)
 * @returns чистое слово в lowercase
 */
function cleanWord(word: string): string {
  return word.replace(/[^а-яА-ЯёЁ-]/g, '').toLowerCase();
}

/**
 * Получить последнее слово в строке (последнее «слово» по whitespace).
 * @param line — строка текста
 * @returns последнее слово или пустая строка
 */
function getLastWord(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return '';

  const tokens = trimmed.split(/\s+/);
  const lastToken = tokens[tokens.length - 1];

  return cleanWord(lastToken);
}

/**
 * Найти индекс последней гласной в слове.
 * @returns -1 если гласных нет
 */
function lastVowelIndex(word: string): number {
  for (let i = word.length - 1; i >= 0; i--) {
    if (VOWELS.has(word[i])) return i;
  }
  return -1;
}

/**
 * Найти индекс согласной перед указанной позицией.
 * @returns -1 если нет согласной перед pos
 */
function consonantBefore(word: string, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) {
    const ch = word[i].toLowerCase();
    if (VOWELS.has(ch)) break; // Наткнулись на гласную — нет согласной между гласными
    if (!VOWELS.has(ch) && ch !== 'ь' && ch !== 'ъ' && ch !== '-') {
      return i;
    }
  }
  return -1;
}

/**
 * Найти индекс гласной перед указанной позицией.
 * @returns -1 если нет гласной перед pos
 */
function vowelBefore(word: string, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) {
    if (VOWELS.has(word[i])) return i;
  }
  return -1;
}

// ==================== Публичный API ====================

/**
 * Извлечь рифменный хвост — от ударной гласной до конца слова (включая её).
 *
 * @param word — чистое слово (без пунктуации)
 * @param stressedVowelPos — позиция ударной гласной (индекс в строке)
 * @returns подстрока от ударной гласной до конца
 */
export function extractRhymeTail(word: string, stressedVowelPos: number): string {
  if (stressedVowelPos < 0 || stressedVowelPos >= word.length) return '';
  return word.slice(stressedVowelPos).toLowerCase();
}

/**
 * Проверить пару слов на рифму.
 *
 * @param word1 — первое слово (без пунктуации, lowercase)
 * @param word2 — второе слово (без пунктуации, lowercase)
 * @returns RhymeResult с типом и оценкой
 */
export function checkRhymePair(word1: string, word2: string): RhymeResult {
  const w1 = cleanWord(word1);
  const w2 = cleanWord(word2);

  // Пустые слова — не рифма
  if (!w1 || !w2) {
    return {
      word1: w1,
      word2: w2,
      type: 'none',
      score: 0,
      tail1: '',
      tail2: '',
    };
  }

  // Определяем ударения
  const stress1 = detectStress(w1);
  const stress2 = detectStress(w2);

  // Если не удалось определить ударение — используем последнюю гласную
  // (частый случай для рифмующихся слов в конце строки)
  const svp1 = stress1 !== -1 ? stress1 : lastVowelIndex(w1);
  const svp2 = stress2 !== -1 ? stress2 : lastVowelIndex(w2);

  // Нет гласных — не рифма
  if (svp1 === -1 || svp2 === -1) {
    return {
      word1: w1,
      word2: w2,
      type: 'none',
      score: 0,
      tail1: '',
      tail2: '',
    };
  }

  // Извлекаем рифменные хвосты
  const tail1 = extractRhymeTail(w1, svp1);
  const tail2 = extractRhymeTail(w2, svp2);

  // Сравниваем хвосты
  return compareTails(w1, w2, svp1, svp2, tail1, tail2);
}

/**
 * Проанализировать рифмовку строфы (4 строки).
 *
 * Проверяет все возможные схемы: ААББ, АБАБ, АББА, АААА.
 * Возвращает лучшую совпавшую схему и пары рифм.
 *
 * @param lines — строки строфы (4 или более строк)
 * @returns StanzaRhymeAnalysis
 */
export function analyzeStanzaRhymes(lines: string[]): StanzaRhymeAnalysis {
  if (lines.length < 2) {
    return {
      scheme: '',
      pairs: [],
      issues: ['Меньше двух строк — невозможно определить рифмовку'],
    };
  }

  const cleanLines = lines.map(l => l.trim()).filter(l => l.length > 0);
  if (cleanLines.length < 2) {
    return {
      scheme: '',
      pairs: [],
      issues: ['Нет достаточного количества непустых строк'],
    };
  }

  const words = cleanLines.map(l => getLastWord(l));
  const pairs: RhymeResult[] = [];
  const issues: string[] = [];

  // Проверяем известные схемы
  const schemes = detectScheme(cleanLines, words);

  // Строим пары на основе обнаруженной схемы
  for (const [i, j] of schemes.pairs) {
    if (i < words.length && j < words.length) {
      const rhyme = checkRhymePair(words[i], words[j]);
      pairs.push(rhyme);
    }
  }

  // Проверяем непарные строки
  if (schemes.unpaired.length > 0) {
    for (const idx of schemes.unpaired) {
      if (idx < cleanLines.length) {
        issues.push(`Строка ${idx + 1} не имеет парной рифмы`);
      }
    }
  }

  return {
    scheme: schemes.name,
    pairs,
    issues,
  };
}

/**
 * Полный анализ рифм всего стихотворения (по строфам).
 *
 * @param stanzas — массив строф, каждая строфа = массив строк
 * @returns массив StanzaRhymeAnalysis по каждой строфе
 */
export function analyzePoemRhymes(stanzas: string[][]): StanzaRhymeAnalysis[] {
  return stanzas.map(stanza => analyzeStanzaRhymes(stanza));
}

// ==================== Внутренние функции ====================

/**
 * Сравнить два рифменных хвоста и классифицировать рифму.
 */
function compareTails(
  w1: string, w2: string,
  svp1: number, svp2: number,
  tail1: string, tail2: string,
): RhymeResult {
  // Если слова одинаковы — нет рифмы (тавтология)
  if (w1 === w2) {
    return {
      word1: w1,
      word2: w2,
      type: 'none',
      score: 0,
      tail1,
      tail2,
    };
  }

  // Точное совпадение хвостов
  if (tail1 === tail2) {
    // Проверяем согласную перед ударной гласной
    const consBefore1 = consonantBefore(w1, svp1);
    const consBefore2 = consonantBefore(w2, svp2);

    if (consBefore1 !== -1 && consBefore2 !== -1) {
      const n1 = normalizeConsonant(w1[consBefore1]);
      const n2 = normalizeConsonant(w2[consBefore2]);

      if (n1 === n2) {
        // Согласная перед ударной гласной совпадает → богатая рифма
        // Проверяем ещё и гласную перед ударной (если есть)
        const vowBefore1 = vowelBefore(w1, svp1);
        const vowBefore2 = vowelBefore(w2, svp2);

        if (vowBefore1 !== -1 && vowBefore2 !== -1) {
          if (w1[vowBefore1].toLowerCase() === w2[vowBefore2].toLowerCase()) {
            return {
              word1: w1,
              word2: w2,
              type: 'rich',
              score: 1.0,
              tail1,
              tail2,
            };
          }
        }

        // Согласная совпадает, но гласная перед ней различается → богатая
        return {
          word1: w1,
          word2: w2,
          type: 'rich',
          score: 0.9,
          tail1,
          tail2,
        };
      }
    }

    // Хвосты совпадают, согласная перед ударной различается → точная рифма
    return {
      word1: w1,
      word2: w2,
      type: 'exact',
      score: 0.8,
      tail1,
      tail2,
    };
  }

  // Хвосты не совпадают полностью — проверяем ассонанс
  // Совпадение по ударной гласной и хотя бы одной согласной
  if (tail1.length > 0 && tail2.length > 0) {
    const vowel1 = tail1[0].toLowerCase();
    const vowel2 = tail2[0].toLowerCase();

    // Ударные гласные совпадают
    if (vowel1 === vowel2) {
      // Проверяем совпадение согласных после ударной гласной (с нормализацией)
      const consonants1 = extractConsonants(tail1.slice(1));
      const consonants2 = extractConsonants(tail2.slice(1));

      const matchCount = countMatchingConsonants(consonants1, consonants2);
      const maxLen = Math.max(consonants1.length, consonants2.length, 1);

      if (matchCount >= 1 && matchCount >= maxLen * 0.5) {
        // Есть совпадение согласных → ассонанс
        return {
          word1: w1,
          word2: w2,
          type: 'assonance',
          score: 0.3 + (matchCount / maxLen) * 0.3,
          tail1,
          tail2,
        };
      }

      // Только гласная совпадает — слабый ассонанс
      return {
        word1: w1,
        word2: w2,
        type: 'assonance',
        score: 0.2,
        tail1,
        tail2,
      };
    }
  }

  // Нет совпадения
  return {
    word1: w1,
    word2: w2,
    type: 'none',
    score: 0,
    tail1,
    tail2,
  };
}

/**
 * Извлечь массив согласных из строки (с нормализацией звонких/глухих).
 */
function extractConsonants(str: string): string[] {
  const result: string[] = [];
  for (const ch of str) {
    const lower = ch.toLowerCase();
    if (!VOWELS.has(lower) && lower !== 'ь' && lower !== 'ъ' && lower !== '-') {
      result.push(normalizeConsonant(lower));
    }
  }
  return result;
}

/**
 * Посчитать количество совпадающих согласных (с начала, побуквенно).
 */
function countMatchingConsonants(c1: string[], c2: string[]): number {
  let count = 0;
  const len = Math.min(c1.length, c2.length);
  for (let i = 0; i < len; i++) {
    if (c1[i] === c2[i]) {
      count++;
    } else {
      break; // Разрыв последовательности — прекращаем
    }
  }
  return count;
}

// ==================== Определение схемы рифмовки ====================

interface SchemeMatch {
  name: string;
  pairs: [number, number][];
  unpaired: number[];
  score: number;
}

/**
 * Определить схему рифмовки строфы по расположению рифмующихся строк.
 */
function detectScheme(lines: string[], words: string[]): SchemeMatch {
  const n = lines.length;
  if (n < 2) {
    return { name: '', pairs: [], unpaired: [], score: 0 };
  }

  // Рассчитываем «рифменность» каждой пары строк
  const rhymeMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const rhyme = checkRhymePair(words[i], words[j]);
      rhymeMatrix[i][j] = rhyme.type !== 'none' ? rhyme.score : 0;
      rhymeMatrix[j][i] = rhymeMatrix[i][j];
    }
  }

  // Проверяем стандартные схемы
  const schemes: Array<{ name: string; pairs: [number, number][] }> = [];

  if (n >= 4) {
    schemes.push({ name: 'АБАБ', pairs: [[0, 2], [1, 3]] });     // Перекрёстная
    schemes.push({ name: 'ААББ', pairs: [[0, 1], [2, 3]] });     // Смежная (парная)
    schemes.push({ name: 'АББА', pairs: [[0, 3], [1, 2]] });     // Кольцевая (опоясывающая)
  }
  if (n >= 3) {
    schemes.push({ name: 'ААА', pairs: [[0, 1], [1, 2]] });       // Монорифмная
  }
  if (n >= 5) {
    schemes.push({ name: 'АБАБВ', pairs: [[0, 2], [1, 3]] });       // Пятистишие с перекрёстной
  }
  if (n >= 6) {
    schemes.push({ name: 'ААББВВ', pairs: [[0, 1], [2, 3], [4, 5]] }); // Смежная 6 строк
    schemes.push({ name: 'АБАБАБ', pairs: [[0, 2], [1, 3], [4, 0]] }); // Перекрёстная 6 строк
  }

  // Для длинных строф — используем автоматическое определение
  // Группируем строки по «рифменности»
  let bestScheme: SchemeMatch = { name: '', pairs: [], unpaired: [], score: 0 };

  for (const scheme of schemes) {
    let score = 0;
    let pairCount = 0;
    const unpaired = new Set<number>();

    for (let i = 0; i < n; i++) {
      unpaired.add(i);
    }

    for (const [i, j] of scheme.pairs) {
      if (i < n && j < n) {
        const pairScore = rhymeMatrix[i][j];
        score += pairScore;
        pairCount++;
        unpaired.delete(i);
        unpaired.delete(j);
      }
    }

    const avgScore = pairCount > 0 ? score / pairCount : 0;

    if (avgScore > bestScheme.score) {
      bestScheme = {
        name: avgScore >= 0.2 ? scheme.name : '',
        pairs: scheme.pairs.filter(([i, j]) => i < n && j < n),
        unpaired: [...unpaired].sort(),
        score: avgScore,
      };
    }
  }

  // Если ни одна схема не подошла — пробуем автоматическую
  if (bestScheme.score < 0.2) {
    return autoDetectScheme(n, words, rhymeMatrix);
  }

  return bestScheme;
}

/**
 * Автоматическое определение схемы рифмовки для произвольного числа строк.
 * Жадный алгоритм: находим рифмующиеся пары с конца строки (концевые рифмы).
 */
function autoDetectScheme(
  n: number,
  _words: string[],
  rhymeMatrix: number[][],
): SchemeMatch {
  const paired = new Set<number>();
  const pairs: [number, number][] = [];
  const schemeLetters = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';

  // Ищем пары строк с хорошей рифмой (>= 0.3), начиная с последних
  // (в русской поэзии чаще всего рифмуются соседние или через одну строки)
  for (let gap = 1; gap <= Math.max(2, Math.floor(n / 2)); gap++) {
    for (let i = n - 1; i >= 0; i--) {
      if (paired.has(i)) continue;
      const j = i - gap;
      if (j < 0 || j >= n || paired.has(j)) continue;

      if (rhymeMatrix[i][j] >= 0.3) {
        pairs.push([Math.min(i, j), Math.max(i, j)]);
        paired.add(i);
        paired.add(j);
      }
    }
  }

  // Строим схему
  const unpaired: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!paired.has(i)) unpaired.push(i);
  }

  // Присваиваем буквы схемы
  const letterMap = new Map<number, string>();
  let nextLetter = 0;
  const sortedPairs = [...pairs].sort((a, b) => a[0] - b[0]);

  for (const [i, j] of sortedPairs) {
    if (!letterMap.has(i) && !letterMap.has(j)) {
      const letter = schemeLetters[nextLetter] ?? String(nextLetter);
      letterMap.set(i, letter);
      letterMap.set(j, letter);
      nextLetter++;
    }
  }

  for (const idx of unpaired) {
    if (!letterMap.has(idx)) {
      letterMap.set(idx, schemeLetters[nextLetter] ?? String(nextLetter));
      nextLetter++;
    }
  }

  const schemeStr = Array.from({ length: n }, (_, i) => letterMap.get(i) ?? '?').join('');

  return {
    name: schemeStr,
    pairs: sortedPairs,
    unpaired,
    score: pairs.length > 0 ? 0.4 : 0,
  };
}
