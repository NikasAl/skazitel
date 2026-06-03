/**
 * ExerciseEngine — ядро генерации и проверки упражнений.
 *
 * Отвечает за:
 * 1. Генерацию упражнений через LLM (по типу, теме, сложности)
 * 2. Проверку ответов пользователя через LLM
 * 3. Фоллбэк на встроенные упражнения (офлайн)
 */

import type { Exercise, ExerciseType, ExerciseReview, ExerciseConstraint, DrillData } from '../types';
import { llmRouter } from '../../llm/router';
import { getSettings } from '../storage/settings';
import { getSystemPrompt, getGeneratePrompt, getReviewPrompt, parseLLMJson } from './prompts';
import { addExercise, getProfile, updateProfile, addAttempt } from '../storage/repository';
import { LEVEL_XP_TABLE } from '../types';

// ==================== Типы для JSON-ответов LLM ====================

/** Структура JSON от LLM при генерации ритмического упражнения */
interface RhythmGenerateResponse {
  instruction: string;
  meter: string;
  syllableCount: number;
  expectedLines: number;
  proseText: string;
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Структура JSON от LLM при генерации рифмического упражнения */
interface RhymeGenerateResponse {
  instruction: string;
  keywords: string[];
  rhymeScheme: string;
  requiredPositions: string[];
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Структура JSON от LLM при генерации метафорического упражнения */
interface MetaphorGenerateResponse {
  instruction: string;
  images: string[];
  targetEmotion: string;
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Структура JSON от LLM при генерации упражнения с ограничениями */
interface ConstraintGenerateResponse {
  instruction: string;
  constraints: ExerciseConstraint[];
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Структура JSON от LLM при генерации деконструкции */
interface DeconstructionGenerateResponse {
  instruction: string;
  masterPoem: string;
  masterAuthor: string;
  techniques: string[];
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Структура JSON от LLM при генерации фонетического упражнения */
interface PhoneticsGenerateResponse {
  instruction: string;
  targetSounds: string[];
  minSoundWords: number;
  mood: string;
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Структура JSON от LLM при генерации упражнения "проза в поэзию" */
interface ProseToPoetryGenerateResponse {
  instruction: string;
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Структура JSON от LLM при генерации упражнения "анти-клише" */
interface AntiClicheGenerateResponse {
  instruction: string;
  forbiddenWords: string[];
  forbiddenImages: string[];
  requiredOriginalImages: number;
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Общий тип ответа LLM при генерации */
type GenerateResponse =
  | RhythmGenerateResponse
  | RhymeGenerateResponse
  | MetaphorGenerateResponse
  | ConstraintGenerateResponse
  | DeconstructionGenerateResponse
  | PhoneticsGenerateResponse
  | ProseToPoetryGenerateResponse
  | AntiClicheGenerateResponse
  // Дрели
  | DrillGenerateResponse;

/** Структура JSON от LLM при генерации дрели */
interface DrillGenerateResponse {
  instruction: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  examples: string[];
  successCriteria: string[];
  hints: string[];
}

/** Структура JSON от LLM при проверке ответа */
interface ReviewResponse {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  scores: {
    rhythm: number;
    rhyme: number;
    imagery: number;
    originality: number;
    overall: number;
  };
  xpEarned: number;
  difficultyAdjustment: 'up' | 'down' | 'same';
}

// ==================== Встроенные упражнения (фоллбэк) ====================

const BUILTIN_EXERCISES: Exercise[] = [
  {
    id: 'builtin-rhythm-1',
    type: 'rhythm',
    topicId: 'builtin',
    difficulty: 2,
    createdAt: new Date().toISOString(),
    instruction:
      'Перепиши этот текст ямбом:\n«Листья падают с деревьев, ветер кружит их в воздухе, земля покрывается ковром из золотых и красных листьев»\n\nТвой ответ должен содержать 4 строки по 8 слогов.',
    constraints: [],
    examples: [
      'Листья золотые падают (8 слогов) — ямб: ЛИС-тья ЗО-ло-ТЫ-е ПА-да-ют',
    ],
    successCriteria: [
      'Строки написаны ямбом',
      'Каждая строка содержит 8 слогов',
      'Смысл про осенних листьев сохранён',
    ],
    hints: [
      'Ямб — ударение на чётных слогах: та-ТА-та-TA-та-ТА-та-ТА',
      'Считай слоги на пальцах, отбивай ритм рукой',
    ],
    rhythmData: {
      meter: 'ямб',
      syllableCount: 8,
      expectedLines: 4,
      proseText:
        'Листья падают с деревьев, ветер кружит их в воздухе, земля покрывается ковром из золотых и красных листьев',
    },
  },
  {
    id: 'builtin-rhythm-2',
    type: 'rhythm',
    topicId: 'builtin',
    difficulty: 3,
    createdAt: new Date().toISOString(),
    instruction:
      'Перепиши этот текст хореем:\n«Мороз украсил окна узорами, деревья стоят в серебряном инее, тишина кругом»\n\nТвой ответ должен содержать 4 строки по 6 слогов.',
    constraints: [],
    examples: [
      'Мороз узором (4 слога) — хорей: МО-роз УЗО-ром',
    ],
    successCriteria: [
      'Строки написаны хореем',
      'Каждая строка содержит 6 слогов',
      'Образ зимнего утра сохранён',
    ],
    hints: [
      'Хорей — ударение на нечётных слогах: ТА-та-TA-та-TA-та',
    ],
    rhythmData: {
      meter: 'хорей',
      syllableCount: 6,
      expectedLines: 4,
      proseText:
        'Мороз украсил окна узорами, деревья стоят в серебряном инее, тишина кругом',
    },
  },
  {
    id: 'builtin-rhyme-1',
    type: 'rhyme',
    topicId: 'builtin',
    difficulty: 2,
    createdAt: new Date().toISOString(),
    instruction:
      'Ключевые слова: окно, свет, тени, следы\nСхема рифмовки: aabb\n\nСоставь четверостишие используя ВСЕ эти слова в позиции рифмующихся окончаний строк.',
    constraints: [],
    examples: [
      'Первая строка должна заканчиваться словом «окно»...',
    ],
    successCriteria: [
      'Все ключевые слова использованы',
      'Слова стоят в правильных позициях по схеме aabb',
      'Строки образуют связный текст',
    ],
    hints: [
      'aabb: 1-я и 2-я строки рифмуются, 3-я и 4-я — между собой',
    ],
    rhymeData: {
      keywords: ['окно', 'свет', 'тени', 'следы'],
      rhymeScheme: 'aabb',
      requiredPositions: ['конец строки 1', 'конец строки 2', 'конец строки 3', 'конец строки 4'],
    },
  },
];

// ==================== Встроенные дрели (фоллбэк) ====================

const BUILTIN_DRILLS: Exercise[] = [
  {
    id: 'builtin-syllable_count-1',
    type: 'syllable_count',
    topicId: 'builtin',
    difficulty: 1,
    createdAt: new Date().toISOString(),
    instruction: 'Посчитай слоги и выбери правильный вариант.',
    constraints: [],
    examples: [],
    successCriteria: ['Правильный подсчёт слогов'],
    hints: ['Каждая гласная буква = один слог'],
    drillData: {
      question: 'Сколько слогов в слове «золотой»?',
      options: ['2', '3', '4', '5'],
      correctIndex: 1,
      explanation: 'зо-ло-то́й — 3 слога',
    },
  },
  {
    id: 'builtin-syllable_count-2',
    type: 'syllable_count',
    topicId: 'builtin',
    difficulty: 2,
    createdAt: new Date().toISOString(),
    instruction: 'Посчитай слоги и выбери правильный вариант.',
    constraints: [],
    examples: [],
    successCriteria: ['Правильный подсчёт слогов'],
    hints: ['Не забудь про йотированные гласные'],
    drillData: {
      question: 'Сколько слогов в слове «вечерний»?',
      options: ['3', '4', '5', '6'],
      correctIndex: 1,
      explanation: 'ве-че-рен-ний — 4 слога',
    },
  },
  {
    id: 'builtin-stress_pattern-1',
    type: 'stress_pattern',
    topicId: 'builtin',
    difficulty: 1,
    createdAt: new Date().toISOString(),
    instruction: 'Определи схему ударности строки.',
    constraints: [],
    examples: [],
    successCriteria: ['Правильное определение ударности'],
    hints: ['Произнеси строку вслух, отбивай ударение рукой'],
    drillData: {
      question: 'Какая схема ударности у строки:\n«Мороз и солнце; день чудесный»?',
      options: ['та-ТА-та-ТА', 'ТА-та-ТА-ta', 'ta-ta-ТА-ТА', 'ТА-ТА-ta-ta'],
      correctIndex: 1,
      explanation: 'МО́-роз и СО́лн-це; день чу-ДЕС-ный — хорей: ТА-ta-ТА-ta-TA-ta',
    },
  },
  {
    id: 'builtin-rhyme_match-1',
    type: 'rhyme_match',
    topicId: 'builtin',
    difficulty: 1,
    createdAt: new Date().toISOString(),
    instruction: 'Выбери слово, которое рифмуется с данным.',
    constraints: [],
    examples: [],
    successCriteria: ['Правильный подбор рифмы'],
    hints: ['Рифма — совпадение звуков после ударного гласного'],
    drillData: {
      question: 'Какое слово рифмуется с «зима»?',
      options: ['дума', 'зима', 'дорога', 'картина'],
      correctIndex: 0,
      explanation: 'зи́ма — ду́ма: после ударного гласного «и»/«у» идёт «ма» — точная рифма',
    },
  },
  {
    id: 'builtin-line_builder-1',
    type: 'line_builder',
    topicId: 'builtin',
    difficulty: 2,
    createdAt: new Date().toISOString(),
    instruction: 'Расставь слова в правильном порядке, чтобы получилась строка ямба.',
    constraints: [],
    examples: [],
    successCriteria: ['Строка образует правильный ямб'],
    hints: ['Отбивай ритм: та-ТА-ta-ТА...'],
    drillData: {
      question: 'Составь строку ямба из слов:\nзолотые, падают, листья, с деревьев, тихо',
      options: [
        'Тихо падают с деревьев золотые листья',
        'Золотые листья тихо падают с деревьев',
        'Листья падают золотые тихо с деревьев',
        'С деревьев падают тихо золотые листья',
      ],
      correctIndex: 0,
      explanation: 'ТИ́-хо ПА-да-ЮТ с де-РЕВЬ-ев ЗО-ло-ТЫ-е ЛИС-тья\n— ямб: та-ТА-ta-ТА-ta-TA-ta-ТА',
    },
  },
];

// ==================== Встроенные отзывы (для офлайн) ====================

function getBuiltinReview(_exercise: Exercise, userResponse: string): ExerciseReview {
  const lines = userResponse.split('\n').filter(Boolean);

  return {
    id: crypto.randomUUID(),
    attemptId: '',
    provider: 'builtin',
    model: 'offline',
    strengths: [
      'Текст написан и отправлен на проверку',
      lines.length >= 3 ? 'Количество строк соответствует заданию' : 'Попробуй написать больше строк',
    ],
    weaknesses: [
      'Для полноценной проверки нужен API-ключ и подключение к интернету',
    ],
    suggestions: [
      'Подключите API в настройках для получения детального разбора от ИИ-наставника',
    ],
    scores: {
      rhythm: lines.length >= 3 ? 50 : 30,
      rhyme: 40,
      imagery: 40,
      originality: 40,
      overall: Math.round((lines.length >= 3 ? 50 : 30 + 40 + 40 + 40) / 4),
    },
    xpEarned: 10,
    levelUp: false,
    difficultyAdjustment: 'same',
  };
}

// ==================== Вспомогательные функции ====================

/** Получить текущие настройки API */
async function getApiConfig(): Promise<{ model: string; apiKey: string } | null> {
  const settings = await getSettings();
  if (!settings.apiProvider?.apiKey || !settings.apiProvider.model) {
    return null;
  }
  return {
    model: settings.apiProvider.model,
    apiKey: settings.apiProvider.apiKey,
  };
}

// ==================== Конвертация JSON → Exercise ====================

/**
 * Конвертирует JSON-ответ LLM в объект Exercise.
 * Добавляет специфичные данные в зависимости от типа.
 */
function buildExercise(
  type: ExerciseType,
  response: GenerateResponse,
  topicId: string,
  difficulty: number,
): Exercise | null {
  const base: Exercise = {
    id: crypto.randomUUID(),
    type,
    topicId,
    difficulty,
    createdAt: new Date().toISOString(),
    instruction: response.instruction,
    constraints: [],
    examples: response.examples ?? [],
    successCriteria: response.successCriteria ?? [],
    hints: response.hints ?? [],
  };

  switch (type) {
    // Дрели — единая обработка
    case 'syllable_count':
    case 'stress_pattern':
    case 'rhyme_match':
    case 'line_builder': {
      const d = response as DrillGenerateResponse;
      const drillData: DrillData = {
        question: d.question,
        options: d.options,
        correctIndex: Math.max(0, Math.min(d.options.length - 1, d.correctIndex ?? 0)),
        explanation: d.explanation,
      };
      base.drillData = drillData;
      base.instruction = d.instruction;
      return base;
    }
    case 'rhythm': {
      const r = response as RhythmGenerateResponse;
      base.rhythmData = {
        meter: r.meter,
        syllableCount: r.syllableCount,
        expectedLines: r.expectedLines,
        proseText: r.proseText,
      };
      // Подставляем данные вместо плейсхолдеров в инструкции
      base.instruction = base.instruction
        .replace(/\{\{meter\}\}/g, r.meter)
        .replace(/\{\{proseText\}\}/g, r.proseText)
        .replace(/\{\{prose\}\}/g, r.proseText)
        .replace(/\{\{expectedLines\}\}/g, String(r.expectedLines))
        .replace(/\{\{lines\}\}/g, String(r.expectedLines))
        .replace(/\{\{syllableCount\}\}/g, String(r.syllableCount))
        .replace(/\{\{syllables\}\}/g, String(r.syllableCount))
        .replace(/\{\{размер\}\}/g, r.meter)
        .replace(/\{\{проза\}\}/g, r.proseText)
        .replace(/\{\{строки\}\}/g, String(r.expectedLines))
        .replace(/\{\{слоги\}\}/g, String(r.syllableCount));
      return base;
    }
    case 'rhyme': {
      const r = response as RhymeGenerateResponse;
      base.rhymeData = {
        keywords: r.keywords,
        rhymeScheme: r.rhymeScheme,
        requiredPositions: r.requiredPositions ?? [],
      };
      // Подставляем данные вместо плейсхолдеров
      base.instruction = base.instruction
        .replace(/\{\{keywords\}\}/g, r.keywords.join(', '))
        .replace(/\{\{scheme\}\}/g, r.rhymeScheme)
        .replace(/\{\{слова\}\}/g, r.keywords.join(', '))
        .replace(/\{\{схема\}\}/g, r.rhymeScheme);
      return base;
    }
    case 'metaphor': {
      const r = response as MetaphorGenerateResponse;
      base.metaphorData = {
        images: r.images,
        targetEmotion: r.targetEmotion,
      };
      base.instruction = base.instruction
        .replace(/\{\{imageList\}\}/g, r.images.map((img, i) => `${i + 1}. ${img}`).join('\n'))
        .replace(/\{\{список образов\}\}/g, r.images.map((img) => `— ${img}`).join('\n'));
      return base;
    }
    case 'constraint': {
      const r = response as ConstraintGenerateResponse;
      base.constraints = r.constraints ?? [];
      base.constraintData = {};
      return base;
    }
    case 'deconstruction': {
      const r = response as DeconstructionGenerateResponse;
      base.deconstructionData = {
        masterPoem: r.masterPoem,
        masterAuthor: r.masterAuthor,
        techniques: r.techniques,
      };
      base.instruction = base.instruction
        .replace(/\{\{poemExcerpt\}\}/g, r.masterPoem)
        .replace(/\{\{отрывок\}\}/g, r.masterPoem)
        .replace(/\{\{techniques\}\}/g, r.techniques.join(', '))
        .replace(/\{\{список\}\}/g, r.techniques.join(', '));
      return base;
    }
    case 'phonetics': {
      const r = response as PhoneticsGenerateResponse;
      base.phoneticsData = {
        targetSounds: r.targetSounds,
        minSoundWords: r.minSoundWords,
        mood: r.mood,
      };
      return base;
    }
    case 'anti_cliche': {
      const r = response as AntiClicheGenerateResponse;
      base.antiClicheData = {
        forbiddenWords: r.forbiddenWords,
        forbiddenImages: r.forbiddenImages,
        requiredOriginalImages: r.requiredOriginalImages,
      };
      return base;
    }
    case 'prose_to_poetry':
      return base;
    default:
      return base;
  }
}

// ==================== Основной класс ====================

class ExerciseEngineClass {
  /**
   * Генерирует новое упражнение через LLM.
   * При отсутствии API-ключа возвращает встроенное упражнение.
   */
  async generateExercise(
    type: ExerciseType,
    topicId: string,
    topicName: string,
    difficulty: number,
  ): Promise<{ exercise: Exercise; usedBuiltin: boolean }> {
    const apiConfig = await getApiConfig();

    // Если нет API — фоллбэк на встроенные упражнения
    if (!apiConfig) {
      const drillBuiltin = BUILTIN_DRILLS.find(e => e.type === type);
      if (drillBuiltin) {
        return { exercise: { ...drillBuiltin, id: crypto.randomUUID(), topicId }, usedBuiltin: true };
      }
      const builtin = BUILTIN_EXERCISES.find(e => e.type === type) ?? BUILTIN_EXERCISES[0];
      return { exercise: { ...builtin, id: crypto.randomUUID(), topicId }, usedBuiltin: true };
    }

    // Дрели с API — генерируются через LLM ниже (фоллбэк на встроенные при ошибке)
    // Основные упражнения тоже через LLM

    try {
      // Генерируем через LLM
      const userPrompt = getGeneratePrompt(type, topicName, difficulty);
      const systemPrompt = getSystemPrompt();

      console.log('[Skazitel:engine] ═══ Генерация упражнения ═══');
      console.log('[Skazitel:engine] тип:', type);
      console.log('[Skazitel:engine] модель:', apiConfig.model);
      console.log('[Skazitel:engine] сложность:', difficulty);
      console.log('[Skazitel:engine] промпт (первые 500 символов):', userPrompt.slice(0, 500));

      const result = await llmRouter.chatCompletion(
        {
          model: apiConfig.model,
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.8,
          maxTokens: 2048,
          responseFormat: 'json',
        },
        apiConfig.apiKey,
      );

      console.log('[Skazitel:engine] ── Ответ LLM получен ──');
      console.log('[Skazitel:engine] модель ответа:', result.model);
      console.log('[Skazitel:engine] токены:', result.usage);
      console.log('[Skazitel:engine] raw content:', result.content);
      console.log('[Skazitel:engine] длина ответа:', result.content.length);

      let parsed = parseLLMJson<GenerateResponse>(result.content);

      console.log('[Skazitel:engine] ── Результат парсинга ──');
      if (!parsed) {
        console.warn('[Skazitel:engine] ❌ parseLLMJson вернул null — JSON не распознан');
      } else {
        console.log('[Skazitel:engine] поля:', Object.keys(parsed));
        console.log('[Skazitel:engine] instruction:', parsed.instruction);

        // Авто-распаковка: некоторые LLM вкладывают данные в вложенный объект
        // Например Gemma возвращает { "exercise": { "instruction": ..., "question": ... } }
        // вместо { "instruction": ..., "question": ... } на верхнем уровне
        const raw = parsed as unknown as Record<string, unknown>;
        if (!parsed.instruction) {
          const wrapperKeys = ['exercise', 'task', 'data'];
          for (const wk of wrapperKeys) {
            const nested = raw[wk];
            if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
              const nestedObj = nested as Record<string, unknown>;
              if (nestedObj.instruction || nestedObj.question) {
                console.log(`[Skazitel:engine] ⚡ Найден вложенный объект "${wk}" — распаковываем`);
                // Мержим: вложенные поля + верхнеуровневые (examples, hints и т.д.)
                parsed = { ...nestedObj, ...raw } as unknown as GenerateResponse;
                console.log('[Skazitel:engine] instruction (после распаковки):', parsed.instruction);
                break;
              }
            }
          }
        }

        if ('question' in parsed) console.log('[Skazitel:engine] question:', (parsed as DrillGenerateResponse).question);
        if ('options' in parsed) console.log('[Skazitel:engine] options:', (parsed as DrillGenerateResponse).options);
        if ('correctIndex' in parsed) console.log('[Skazitel:engine] correctIndex:', (parsed as DrillGenerateResponse).correctIndex);
        const rawAfter = parsed as unknown as Record<string, unknown>;
        if ('correct_index' in rawAfter) console.log('[Skazitel:engine] correct_index (snake_case!):', rawAfter.correct_index);
      }

      if (!parsed || !parsed.instruction) {
        // LLM вернул невалидный JSON — фоллбэк
        console.warn('[Skazitel:engine] ❌ Невалидный JSON от LLM, используем встроенное упражнение');
        console.warn('[Skazitel:engine] parsed:', parsed);
        const fallback = BUILTIN_DRILLS.find(e => e.type === type) ?? BUILTIN_EXERCISES.find(e => e.type === type) ?? BUILTIN_EXERCISES[0];
        return { exercise: { ...fallback, id: crypto.randomUUID(), topicId }, usedBuiltin: true };
      }

      const exercise = buildExercise(type, parsed, topicId, difficulty);
      if (!exercise) {
        console.error('[Skazitel:engine] ❌ buildExercise вернул null для типа', type);
        const fallback = BUILTIN_DRILLS.find(e => e.type === type) ?? BUILTIN_EXERCISES.find(e => e.type === type) ?? BUILTIN_EXERCISES[0];
        return { exercise: { ...fallback, id: crypto.randomUUID(), topicId }, usedBuiltin: true };
      }

      console.log('[Skazitel:engine] ✅ Упражнение собрано успешно');
      if (exercise.drillData) {
        console.log('[Skazitel:engine] drillData:', exercise.drillData);
      }

      // Сохраняем упражнение в БД
      await addExercise(exercise);

      return { exercise, usedBuiltin: false };
    } catch (error) {
      console.error('[Skazitel:engine] ❌ Ошибка генерации упражнения:', error);
      console.error('[Skazitel:engine] стек:', error instanceof Error ? error.stack : 'n/a');
      // Фоллбэк на встроенное
      const fallback = BUILTIN_DRILLS.find(e => e.type === type) ?? BUILTIN_EXERCISES.find(e => e.type === type) ?? BUILTIN_EXERCISES[0];
      return { exercise: { ...fallback, id: crypto.randomUUID(), topicId }, usedBuiltin: true };
    }
  }

  /**
   * Проверяет ответ пользователя через LLM.
   * Возвращает ExerciseReview с оценками и фидбеком.
   */
  async reviewResponse(
    exercise: Exercise,
    userResponse: string,
  ): Promise<ExerciseReview> {
    const apiConfig = await getApiConfig();

    // Если нет API — возвращаем встроенный отзыв
    if (!apiConfig) {
      return getBuiltinReview(exercise, userResponse);
    }

    try {
      const reviewPrompt = getReviewPrompt(
        exercise.type,
        exercise.instruction,
        userResponse,
        {
          rhythmData: exercise.rhythmData,
          rhymeData: exercise.rhymeData,
        },
      );
      const systemPrompt = getSystemPrompt();

      const result = await llmRouter.chatCompletion(
        {
          model: apiConfig.model,
          systemPrompt,
          messages: [{ role: 'user', content: reviewPrompt }],
          temperature: 0.5,
          maxTokens: 2048,
          responseFormat: 'json',
        },
        apiConfig.apiKey,
      );

      const parsed = parseLLMJson<ReviewResponse>(result.content);

      if (!parsed || typeof parsed.scores?.overall !== 'number') {
        // Невалидный ответ — фоллбэк
        console.warn('ExerciseEngine: невалидный JSON при проверке, используем встроенный отзыв');
        return getBuiltinReview(exercise, userResponse);
      }

      // Формируем ExerciseReview
      const review: ExerciseReview = {
        id: crypto.randomUUID(),
        attemptId: '',
        provider: apiConfig.model.split('/')[0],
        model: apiConfig.model,
        strengths: parsed.strengths ?? ['Текст получен и проанализирован'],
        weaknesses: parsed.weaknesses ?? [],
        suggestions: parsed.suggestions ?? [],
        scores: {
          rhythm: Math.min(100, Math.max(0, parsed.scores?.rhythm ?? 50)),
          rhyme: Math.min(100, Math.max(0, parsed.scores?.rhyme ?? 50)),
          imagery: Math.min(100, Math.max(0, parsed.scores?.imagery ?? 50)),
          originality: Math.min(100, Math.max(0, parsed.scores?.originality ?? 50)),
          overall: Math.min(100, Math.max(0, parsed.scores?.overall ?? 50)),
        },
        xpEarned: Math.min(50, Math.max(5, parsed.xpEarned ?? 20)),
        levelUp: false,
        difficultyAdjustment: parsed.difficultyAdjustment ?? 'same',
      };

      return review;
    } catch (error) {
      console.error('ExerciseEngine: ошибка проверки ответа:', error);
      return getBuiltinReview(exercise, userResponse);
    }
  }

  /**
   * Полный цикл: сохранить попытку, обновить профиль (XP, стрик, уровень).
   * Вызывается после получения review от LLM.
   */
  async saveAttemptAndUpdateProfile(
    exercise: Exercise,
    userResponse: string,
    review: ExerciseReview,
  ): Promise<void> {
    const profile = await getProfile();
    const attemptId = crypto.randomUUID();
    review.id = attemptId;
    review.attemptId = attemptId;

    // Сохраняем попытку
    await addAttempt({
      exerciseId: exercise.id,
      topicId: exercise.topicId,
      userId: profile?.id ?? '',
      userResponse,
      review,
      isCreativeSession: false,
    });

    // Обновляем профиль
    if (profile) {
      const newXP = profile.xp + review.xpEarned;
      let newLevel = profile.level;
      let levelUp = false;

      // Проверяем повышение уровня
      const nextLevelXP = LEVEL_XP_TABLE[profile.level + 1];
      if (nextLevelXP !== undefined && newXP >= nextLevelXP) {
        newLevel = profile.level + 1;
        levelUp = true;
      }

      // Обновляем стрик
      const today = new Date().toISOString().split('T')[0];
      let newStreak = profile.streak;
      if (profile.lastActiveDate !== today) {
        // Проверяем, был ли активен вчера
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (profile.lastActiveDate === yesterday) {
          newStreak += 1;
        } else if (profile.lastActiveDate !== today) {
          newStreak = 1; // Сброс стрика
        }
      }

      if (newStreak > profile.longestStreak) {
        await updateProfile({
          longestStreak: newStreak,
        });
      }

      await updateProfile({
        xp: newXP,
        level: newLevel,
        xpToNextLevel: LEVEL_XP_TABLE[newLevel + 1] ?? newXP,
        lastActiveDate: today,
        streak: newStreak,
        completedExercises: profile.completedExercises + 1,
        successfulExercises: review.scores.overall >= 40
          ? profile.successfulExercises + 1
          : profile.successfulExercises,
      });

      if (levelUp) {
        review.levelUp = true;
        review.newLevel = newLevel;
      }
    }
  }

  /**
   * Мгновенная проверка дрели — без вызова LLM.
   * Ответ проверяется по correctIndex из drillData.
   */
  checkDrillAnswer(
    exercise: Exercise,
    selectedIndex: number,
  ): { isCorrect: boolean; review: ExerciseReview } {
    const drill = exercise.drillData;
    if (!drill) {
      return { isCorrect: false, review: getBuiltinReview(exercise, String(selectedIndex)) };
    }

    const isCorrect = selectedIndex === drill.correctIndex;
    const xp = isCorrect ? 15 : 3;

    const review: ExerciseReview = {
      id: crypto.randomUUID(),
      attemptId: '',
      provider: 'drill',
      model: 'instant',
      strengths: isCorrect
        ? [drill.explanation]
        : ['Попытка засчитана — продолжай тренироваться'],
      weaknesses: isCorrect
        ? []
        : [`Правильный ответ: ${drill.options[drill.correctIndex]}`, drill.explanation],
      suggestions: isCorrect
        ? ['Отлично! Попробуй более сложный уровень.']
        : ['Внимательно прочитай пояснение и попробуй ещё раз.'],
      scores: {
        rhythm: isCorrect ? 80 : 30,
        rhyme: isCorrect ? 75 : 30,
        imagery: 50,
        originality: 50,
        overall: isCorrect ? 80 : 30,
      },
      xpEarned: xp,
      levelUp: false,
      difficultyAdjustment: isCorrect ? 'up' : 'same',
    };

    return { isCorrect, review };
  }
}

/** Глобальный экземпляр ExerciseEngine */
export const exerciseEngine = new ExerciseEngineClass();
