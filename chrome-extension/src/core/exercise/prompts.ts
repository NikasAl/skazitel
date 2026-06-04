/**
 * Промпт-шаблоны для генерации и проверки упражнений.
 * Основано на docs/EXERCISES.md.
 *
 * Каждый тип упражнения имеет:
 * - systemPrompt: общий системный промпт для роли наставника
 * - generatePrompt(user): промпт для генерации упражнения
 * - reviewPrompt(exercise, response): промпт для проверки ответа
 */

import type { ExerciseType } from '../types';

// ==================== Общий системный промпт ====================

const BASE_SYSTEM_PROMPT = `Ты — наставник по стихосложению. Твоя задача — НЕ писать стихи за
пользователя, а помогать ему развивать навыки.

## Правила
1. Объясняй какую технику мы тренируем
2. Давай чёткое задание с ограничениями
3. Предоставляй 1-2 примера (но не полный ответ)
4. Указывай критерии успеха
5. При проверке: сначала strengths, затем weaknesses, потом suggestions
6. НИКОГДА не переписывай текст за пользователя

## Формат ответа
- Возвращай ответы ТОЛЬКО в формате JSON.
- НЕ оборачивай JSON в markdown-блоки.
- НЕ добавляй комментарии, пояснения или текст до/после JSON.
- Ключи JSON — camelCase (instruction, correctIndex — НЕ correct_index).
- JSON должен быть ПЛОСКИМ: все поля (instruction, question, options и т.д.) —
  на верхнем уровне объекта. ЗАПРЕЩЁНО вкладывать их в обёртки ("exercise", "task", "data").

ПРАВИЛЬНО:
{"instruction": "...", "question": "...", "options": [...], "correctIndex": 2}

НЕПРАВИЛЬНО:
{"exercise": {"instruction": "...", "question": "..."}}
{"data": {"instruction": "..."}}
{"technique": "...", "assignment": "...", "exercise": {...}}`;

// ==================== Сложность → параметры ====================

interface DifficultyParams {
  meterRange: string;
  linesRange: string;
  hintLevel: string;
}

export function getDifficultyParams(difficulty: number): DifficultyParams {
  if (difficulty <= 2) {
    return {
      meterRange: 'ямб или хорей, 4 стопы',
      linesRange: '4 строки',
      hintLevel: 'дай подробные подсказки с примерами',
    };
  }
  if (difficulty <= 4) {
    return {
      meterRange: 'ямб, хорей, дактиль или амфибрахий, 4-5 стоп',
      linesRange: '4-6 строк',
      hintLevel: 'дай 1-2 краткие подсказки',
    };
  }
  if (difficulty <= 6) {
    return {
      meterRange: 'любой размер, 5-6 стоп',
      linesRange: '4-8 строк',
      hintLevel: 'дай 1 общую подсказку',
    };
  }
  return {
    meterRange: 'сложные или смешанные размеры',
    linesRange: '4-10 строк',
    hintLevel: 'не давай подсказок (пользователь продвинутый)',
  };
}

// ==================== Промпты генерации по типам ====================

function rhythmGeneratePrompt(topic: string, difficulty: number): string {
  const dp = getDifficultyParams(difficulty);
  return `Создай упражнение типа «Ритмический тренажёр».

## Контекст
- Тема пользователя: ${topic}
- Уровень сложности: ${difficulty} (из 10)
- Стихотворные размеры: ${dp.meterRange}
- Количество строк: ${dp.linesRange}

## Задача
1. Напиши 2-3 прозаических предложения на тему «${topic}».
   Текст должен быть связным, живым, содержать конкретные образы.
2. Выбери стихотворный размер из разрешённых для этого уровня.
3. Укажи количество строк и слогов в строке.
4. ${dp.hintLevel}

## Формат ответа (JSON)
{
  "instruction": "Перепиши этот текст {{размер}}:\n«{{проза}}»\n\nТвой ответ должен содержать {{строки}} строк по {{слоги}} слогов.",
  "meter": "название размера",
  "syllableCount": 8,
  "expectedLines": 4,
  "proseText": "2-3 предложения прозы...",
  "examples": ["Пример первой строки с правильным ритмом (не полный ответ)"],
  "successCriteria": [
    "Строки написаны в указанном размере",
    "Каждая строка содержит указанное количество слогов",
    "Смысл исходного текста сохранён"
  ],
  "hints": ["Подсказка по ритму"]
}`;
}

function rhymeGeneratePrompt(topic: string, difficulty: number): string {
  const scheme = difficulty <= 2 ? 'aabb (паровая)'
    : difficulty <= 6 ? 'abab (перекрёстная)'
    : 'abba (кольцевая) или свободная';

  return `Создай упражнение типа «Рифмический конструктор».

## Контекст
- Тема пользователя: ${topic}
- Уровень сложности: ${difficulty} (из 10)
- Схема рифмовки: ${scheme}

## Задача
Для темы «${topic}» подбери 4-6 слов которые:
- Семантически связаны с темой
- Образуют 2-3 рифмующиеся пары (точные или неточные)
- Разной сложности
- Учитывают уровень ${difficulty}

## Формат ответа (JSON)
{
  "instruction": "Ключевые слова: {{слова}}\nСхема рифмовки: {{схема}}\n\nСоставь четверостишие используя ВСЕ эти слова в позиции рифмующихся окончаний строк.",
  "keywords": ["слово1", "слово2", "слово3", "слово4"],
  "rhymeScheme": "${scheme}",
  "requiredPositions": ["конец строки 1", "конец строки 2", ...],
  "examples": ["Пример направления мысли"],
  "successCriteria": [
    "Все ключевые слова использованы",
    "Слова стоят в правильных позициях по схеме",
    "Строки образуют связный текст"
  ],
  "hints": ["Подсказка по рифмовке"]
}`;
}

function metaphorGeneratePrompt(topic: string, difficulty: number): string {
  const imageCount = difficulty <= 2 ? 3 : difficulty <= 6 ? 5 : 7;

  return `Создай упражнение типа «Метафорический мост».

## Контекст
- Тема пользователя: ${topic}
- Уровень сложности: ${difficulty} (из 10)

## Задача
Для темы «${topic}» подбери ${imageCount} образов которые:
- Визуально яркие и конкретные
- Имеют параллели с темой (но неочевидные)
- Не являются клише
- Подходят для уровня ${difficulty}

Определи основную эмоцию/чувство, которое передаёт тема.

## Формат ответа (JSON)
{
  "instruction": "Тема: «${topic}»\n\nНайди метафоры через образы:\n{{список образов}}\n\nНапиши по двустишию на каждую метафору.",
  "images": ["образ 1", "образ 2", ...],
  "targetEmotion": "основная эмоция",
  "examples": ["Пример метафоры для первого образа"],
  "successCriteria": [
    "Каждый образ раскрыт через метафору",
    "Метафоры неочевидные (не клише)",
    "Образы связаны общей темой"
  ],
  "hints": ["Подсказка"]
}`;
}

function constraintGeneratePrompt(topic: string, difficulty: number): string {
  const constraintCount = difficulty <= 2 ? '1-2' : difficulty <= 6 ? '3-4' : '4-5';

  return `Создай упражнение типа «Ограничение как искусство».

## Контекст
- Тема пользователя: ${topic}
- Уровень сложности: ${difficulty} (из 10)

## Задача
Придумай для темы «${topic}» набор из ${constraintCount} ограничений:
- Которые делают задачу сложной, но выполнимой
- Которые тренируют конкретный навык (плотность, точность, лаконичность)
- Адекватны уровню ${difficulty}

Ограничения могут касаться:
- Количество слов / строк
- Запрещённые / обязательные части речи
- Время глаголов
- Обязательные звуки
- Схема рифмовки

## Формат ответа (JSON)
{
  "instruction": "Напиши стих на тему «${topic}» с ограничениями:\n{{список ограничений}}",
  "constraints": [
    {"type": "тип", "value": "значение", "description": "описание ограничения"}
  ],
  "examples": ["Пример строки с соблюдением ограничений"],
  "successCriteria": [
    "Все ограничения соблюдены",
    "Текст связный и осмысленный",
    "Тема раскрыта"
  ],
  "hints": ["Подсказка"]
}`;
}

function deconstructionGeneratePrompt(topic: string, difficulty: number): string {
  return `Создай упражнение типа «Деконструкция мастера».

## Контекст
- Тема пользователя: ${topic}
- Уровень сложности: ${difficulty} (из 10)

## Задача
Для темы «${topic}» найди отрывок (4-8 строк) из известного стихотворения
русской или зарубежной поэзии, который тематически близок.

Выдели 2-4 конкретных поэтических приёма в этом отрывке:
- Анжамбеман, перенос смысла
- Контраст высокого и низкого стиля
- Повторы (анафора, эпифора)
- Аллитерация
- Оксюморон
- И т.д.

## Формат ответа (JSON)
{
  "instruction": "Прочитай отрывок:\n«{{отрывок}}»\n\nПриёмы: {{список}}\n\nНапиши своё четверостишие на тему «${topic}» используя минимум 2 из этих приёмов.",
  "masterPoem": "отрывок из стихотворения",
  "masterAuthor": "автор",
  "techniques": ["приём 1", "приём 2"],
  "examples": ["Пример использования приёма"],
  "successCriteria": [
    "Минимум 2 приёма использованы",
    "Текст связан с темой",
    "Приёмы применлены осмысленно"
  ],
  "hints": ["Подсказка"]
}`;
}

function phoneticsGeneratePrompt(topic: string, difficulty: number): string {
  const minWords = difficulty <= 2 ? 5 : difficulty <= 6 ? 8 : 12;

  return `Создай упражнение типа «Фонетический этюд».

## Контекст
- Тема пользователя: ${topic}
- Уровень сложности: ${difficulty} (из 10)

## Задача
Для темы «${topic}» выбери 1-3 звука (согласные) которые создадут определённое настроение.
Задача пользователя — написать четверостишие, где минимум ${minWords} слов содержат эти звуки.

## Формат ответа (JSON)
{
  "instruction": "Тема: «${topic}»\n\nНапиши четверостишие где преобладают звуки {{звуки}}.\nМинимум ${minWords} слов с этими звуками.",
  "targetSounds": ["с", "ш"],
  "minSoundWords": ${minWords},
  "mood": "настроение (шёпот, громкость, тревога...)",
  "examples": ["Пример строки с нужными звуками"],
  "successCriteria": [
    "Превышен минимум слов с нужными звуками",
    "Настроение соответствует заданному",
    "Текст связный"
  ],
  "hints": ["Подсказка"]
}`;
}

function proseToPoetryGeneratePrompt(topic: string, difficulty: number): string {
  const wordCount = difficulty <= 4 ? 200 : difficulty <= 6 ? 150 : 100;

  return `Создай упражнение типа «Перевод прозы в поэзию».

## Контекст
- Тема пользователя: ${topic}
- Уровень сложности: ${difficulty} (из 10)

## Задача
Предложи пользователю написать прозаический текст на тему «${topic}» (${wordCount} слов).
Затем дай задание превратить этот текст в стихи с указанием формы.

## Формат ответа (JSON)
{
  "instruction": "1. Напиши честный текст о теме «${topic}» (${wordCount} слов).\nНе думай о стихах, просто пиши как чувствуешь.\n\n2. Когда закончишь — преврати свой текст в стихотворную форму (4-8 строк).",
  "examples": ["Пример: из прозы «я стоял у окна и смотрел на дождь...» можно сделать «Стою у окна, а дождь стучит по стеклу...»"],
  "successCriteria": [
    "Смысл исходного текста сохранён",
    "Текст обрёл стихотворную форму",
    "Ритмически связный"
  ],
  "hints": ["Подсказка"]
}`;
}

function antiClicheGeneratePrompt(topic: string, difficulty: number): string {
  const forbidCount = difficulty <= 2 ? 5 : difficulty <= 6 ? 10 : 15;

  return `Создай упражнение типа «Анти-клише».

## Контекст
- Тема пользователя: ${topic}
- Уровень сложности: ${difficulty} (из 10)

## Задача
Для темы «${topic}» составь список из ${forbidCount} клише:
- Слова-штампы (очевидные ассоциации)
- Банальные образы
- Затёртые рифмы
- Шаблонные метафоры

Также укажи сколько неочевидных образов нужно найти.

## Формат ответа (JSON)
{
  "instruction": "Тема: «${topic}»\n\nЗапрещённые слова: {{список}}\n\nНапиши стих, избегая ВСЕХ запрещённых слов. Найди минимум {{количество}} неожиданных образов.",
  "forbiddenWords": ["слово1", "слово2", ...],
  "forbiddenImages": ["образ1", "образ2"],
  "hints": ["Подсказка"]
}`;
}

// ==================== Промпты генерации для дрелей ====================

function syllableCountGeneratePrompt(topic: string, difficulty: number): string {
  const complexity = difficulty <= 2
    ? 'одиночные русские слова (2-4 слога)'
    : difficulty <= 6
      ? 'целые строки стихотворений (6-10 слогов)'
      : 'сложные слова с беглыми гласными и целые строфы';

  return `Создай упражнение типа "Силлабический счётчик".

## Контекст
- Тема: ${topic}
- Сложность: ${difficulty}/10
- Материал: ${complexity}

## Задача
Придумай ${difficulty <= 4 ? 'одно слово или короткую строчку' : 'строку или две'} и подсчитай количество слогов.
Составь 4 варианта ответа с числами (только один верный).
Неверные варианты должны быть правдоподобными (плюс-минус 1-2 от верного).

## Правила подсчёта слогов для русского языка
- Каждая гласная = 1 слог
- Беглые гласные (о, е) в конце слова после согласной обычно не образуют слог
- Йотированные (ё, ю, я, е) после согласной = 1 слог (не 2)

## Формат ответа (JSON)
{
  "instruction": "Посчитай слоги и выбери правильный вариант.",
  "question": "Сколько слогов в слове/строке: ... ?",
  "options": ["3", "4", "5", "6"],
  "correctIndex": 2,
  "explanation": "Разбор по слогам: слог-1-слог-2...",
  "examples": [],
  "successCriteria": ["Правильный подсчёт слогов"],
  "hints": ["Вспомни: каждая гласная буква = один слог"]
}`;
}

function stressPatternGeneratePrompt(topic: string, difficulty: number): string {
  const complexity = difficulty <= 2
    ? 'двусложные и трёхсложные слова'
    : difficulty <= 6
      ? 'строки из 4-6 слогов'
      : 'строки из 6-9 слогов, определение размера по схеме';

  return `Создай упражнение типа "Определение ударений".

## Контекст
- Тема: ${topic}
- Сложность: ${difficulty}/10
- Материал: ${complexity}

## Задача
${difficulty <= 4
    ? 'Покажи слово/строку и предложи 4 варианта схемы ударности (та-ТА, ТА-та и т.п.). Только один вариант верный.'
    : 'Покажи строку и предложи 4 варианта стихотворного размера. Только один верный.'
  }

## Схемы ударности
- ямб: та-ТА-та-ТА-та-ТА
- хорей: ТА-та-ТА-та-ТА-та
- дактиль: ТА-та-та-ТА-та-та
- амфибрахий: та-ТА-та-та-ТА-та
- анапест: та-та-ТА-та-та-ТА

## Формат ответа (JSON)
{
  "instruction": "Определи схему ударности строки.",
  "question": "Какая схема ударности у строки: ... ?",
  "options": ["та-ТА-та-ТА", "ТА-та-ТА-та", "та-та-ТА", "ТА-та-та"],
  "correctIndex": 0,
  "explanation": "Разбор: ударения падают на слоги ... это соответствует ...",
  "examples": [],
  "successCriteria": ["Правильное определение ударности"],
  "hints": ["Произнеси строку вслух, отбивай ударение рукой"]
}`;
}

function rhymeMatchGeneratePrompt(topic: string, difficulty: number): string {
  const rhymeType = difficulty <= 2
    ? 'точные рифмы (совпадают все звуки после ударного)'
    : difficulty <= 6
      ? 'точные и неточные рифмы'
      : 'любые виды рифм включая составные и дактилические';

  return `Создай упражнение типа "Подбор рифмы".

## Контекст
- Тема: ${topic}
- Сложность: ${difficulty}/10
- Тип рифм: ${rhymeType}

## Задача
Дай одно слово и 4 варианта рифмы. Только один вариант - верная рифма.
Остальные - правдоподобные, но не рифмующиеся слова.

## Формат ответа (JSON)
{
  "instruction": "Выбери слово, которое рифмуется с данным.",
  "question": "Какое слово рифмуется с ... ?",
  "options": ["слово1", "слово2", "слово3", "слово4"],
  "correctIndex": 0,
  "explanation": "... и ... рифмуются, потому что после ударного гласного совпадают звуки: ...",
  "examples": [],
  "successCriteria": ["Правильный подбор рифмы"],
  "hints": ["Рифма - совпадение звуков после ударного гласного"]
}`;
}

function lineBuilderGeneratePrompt(topic: string, difficulty: number): string {
  return `Создай упражнение типа "Конструктор строки".

## Контекст
- Тема: ${topic}
- Сложность: ${difficulty}/10

## Задача
Дай ${difficulty <= 4 ? '4-5' : '6-8'} слов на тему "${topic}". Пользователь должен собрать из них строку в заданном стихотворном размере.
Правильный ответ - одна конкретная перестановка слов. Неверные - другие перестановки.

## Формат ответа (JSON)
{
  "instruction": "Расставь слова в правильном порядке, чтобы получилась строка (ямб, 4 стопы).",
  "question": "Составь строку ямба из слов: слово1, слово2, слово3, слово4, слово5",
  "options": [
    "Слово1 слово2 слово3 слово4 слово5",
    "Слово3 слово1 слово5 слово2 слово4",
    "Слово2 слово4 слово1 слово3 слово5",
    "Слово5 слово3 слово2 слово4 слово1"
  ],
  "correctIndex": 0,
  "explanation": "Правильная строка: ... - проверяем ударения: та-ТА-та-ТА-та-ТА",
  "examples": [],
  "successCriteria": ["Слова расставлены в порядке, образующем правильный ямб"],
  "hints": ["Пройдись по вариантам, отбивая ритм: та-ТА-та-ТА..."]
}`;
}

// ==================== Маппинг генерации по типам ====================

/** Краткое напоминание о формате JSON — приписывается к каждому промпту генерации */
const JSON_FORMAT_WARNING = `

## КРИТИЧЕСКОЕ ТРЕБОВАНИЕ К ФОРМАТУ
Выведи ОДИН плоский JSON-объект. Все поля (instruction, question, options, correctIndex и т.д.)
должны быть на ВЕРХНЕМ уровне. НЕ вкладывай данные в обёртки "exercise", "task", "data", "result".
НЕ добавляй посторонних полей (technique, assignment и т.п.).
Ответ должен начинаться с { и заканчиваться } — без текста до и после.`;

const GENERATE_PROMPTS: Record<ExerciseType, (topic: string, difficulty: number) => string> = {
  // Дрели
  syllable_count: syllableCountGeneratePrompt,
  stress_pattern: stressPatternGeneratePrompt,
  rhyme_match: rhymeMatchGeneratePrompt,
  line_builder: lineBuilderGeneratePrompt,
  // Основные упражнения
  rhythm: rhythmGeneratePrompt,
  rhyme: rhymeGeneratePrompt,
  metaphor: metaphorGeneratePrompt,
  constraint: constraintGeneratePrompt,
  deconstruction: deconstructionGeneratePrompt,
  phonetics: phoneticsGeneratePrompt,
  prose_to_poetry: proseToPoetryGeneratePrompt,
  anti_cliche: antiClicheGeneratePrompt,
};

// ==================== Общий JSON-формат для review ====================

const REVIEW_JSON_FORMAT = `
## Формат ответа (JSON)
{
  "strengths": ["Что получилось хорошо (2-3 пункта)"],
  "weaknesses": ["Конкретные проблемы (1-3 пункта)"],
  "suggestions": ["Как улучшить (2-3 конкретных совета)"],
  "scores": {
    "rhythm": 0-100,
    "rhyme": 0-100,
    "imagery": 0-100,
    "originality": 0-100,
    "overall": 0-100
  },
  "xpEarned": 10-50,
  "difficultyAdjustment": "up" | "down" | "same"
}

КРИТИЧЕСКОЕ ТРЕБОВАНИЕ К ФОРМАТУ:
1. Все оценки ДОЛЖНЫ быть вложены в объект "scores". НЕ пиши их на верхнем уровне.
2. Все поля (strengths, weaknesses, suggestions, scores, xpEarned) — на ВЕРХНЕМ уровне. НЕ вкладывай в обёртки "review", "result", "analysis".

ПРАВИЛЬНО:
{"strengths": [...], "weaknesses": [...], "suggestions": [...], "scores": {"rhythm": 20, "overall": 40}, "xpEarned": 15}

НЕПРАВИЛЬНО (ошибки):
{"strengths": [...], "rhythm": 20, "overall": 40}
{"strengths": [...], "rhythmScore": 20, "overallScore": 40}
{"review": {"strengths": [...], "scores": {...}}}
Ответ должен начинаться с { и заканчиваться } — без текста до и после.`;

// ==================== Промпты проверки (review) по типам ====================

function rhythmReviewPrompt(instruction: string, userResponse: string, rhythmData?: { meter: string; syllableCount: number; expectedLines: number }): string {
  let criteriaBlock = '## Критерии проверки\n1. Правильность стихотворного размера\n2. Количество слогов в строке\n3. Количество строк\n4. Смысловая связность';
  if (rhythmData) {
    criteriaBlock = `## Критерии проверки\n1. Правильность стихотворного размера: ${rhythmData.meter}\n2. Количество слогов в строке: ${rhythmData.syllableCount}\n3. Количество строк: ${rhythmData.expectedLines}\n4. Смысловая связность`;
  }
  return 'Проверь упражнение «Ритмический тренажёр».\n\n## Исходное задание\n' + instruction + '\n\n## Ответ пользователя\n' + userResponse + '\n\n' + criteriaBlock + '\n' + REVIEW_JSON_FORMAT;
}

function rhymeReviewPrompt(instruction: string, userResponse: string): string {
  return 'Проверь упражнение «Рифмический конструктор».\n\n## Исходное задание\n' + instruction + '\n\n## Ответ пользователя\n' + userResponse + '\n\n## Критерии проверки\n1. Все ключевые слова использованы в рифмующихся позициях\n2. Схема рифмовки соблюдена\n3. Текст связный и осмысленный\n4. Рифмы не слишком банальные (если уровень > 3)\n' + REVIEW_JSON_FORMAT;
}

function metaphorReviewPrompt(instruction: string, userResponse: string): string {
  return 'Проверь упражнение «Метафорический мост».\n\n## Исходное задание\n' + instruction + '\n\n## Ответ пользователя\n' + userResponse + '\n\n## Критерии проверки\n1. Каждый образ раскрыт через метафору\n2. Метафоры оригинальные (не клише)\n3. Образы связаны общей темой/эмоцией\n4. Техническое качество текста\n' + REVIEW_JSON_FORMAT;
}

// Общий review-промпт для типов без специализированного шаблона
function genericReviewPrompt(typeName: string, instruction: string, userResponse: string): string {
  return 'Проверь упражнение «' + typeName + '».\n\n## Исходное задание\n' + instruction + '\n\n## Ответ пользователя\n' + userResponse + '\n\n## Критерии проверки\n1. Задание выполнено (ограничения соблюдены)\n2. Текст связный и осмысленный\n3. Тема раскрыта\n4. Техническое качество (ритм, рифма, если применимо)\n' + REVIEW_JSON_FORMAT;
}

// ==================== Экспорт ====================

/**
 * Получить системный промпт для наставника
 */
export function getSystemPrompt(): string {
  return BASE_SYSTEM_PROMPT;
}

/**
 * Получить промпт для генерации упражнения
 */
export function getGeneratePrompt(type: ExerciseType, topic: string, difficulty: number): string {
  return GENERATE_PROMPTS[type](topic, difficulty) + JSON_FORMAT_WARNING;
}

/**
 * Получить промпт для проверки ответа пользователя
 */
export function getReviewPrompt(
  type: ExerciseType,
  instruction: string,
  userResponse: string,
  exerciseData?: Record<string, unknown>,
): string {
  switch (type) {
    case 'rhythm':
      return rhythmReviewPrompt(instruction, userResponse, exerciseData?.rhythmData as { meter: string; syllableCount: number; expectedLines: number });
    case 'rhyme':
      return rhymeReviewPrompt(instruction, userResponse);
    case 'metaphor':
      return metaphorReviewPrompt(instruction, userResponse);
    default:
      return genericReviewPrompt(
        type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        instruction,
        userResponse,
      );
  }
}

// ==================== Парсинг JSON-ответа LLM ====================

/**
 * Безопасно извлечь JSON из ответа LLM.
 * LLM часто оборачивает JSON в markdown-блоки ```json ... ```.
 */
export function parseLLMJson<T>(raw: string): T | null {
  // Сначала пытаемся убрать markdown-обёртки
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    // Убираем первую и последнюю строку (```json и ```)
    const lines = cleaned.split('\n');
    lines.shift(); // убираем ```json или ```
    lines.pop();   // убираем ```
    cleaned = lines.join('\n').trim();
  }

  try {
    const parsed = JSON.parse(cleaned) as T;
    // Нормализация snake_case → camelCase для совместимости с разными LLM
    return normalizeKeys(parsed) as T;
  } catch {
    // Попытка извлечь JSON из текста (LLM мог добавить текст до/после JSON)
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as T;
        return normalizeKeys(parsed) as T;
      } catch {
        console.warn('[Skazitel:prompts] ❌ Не удалось распарсить JSON:', jsonMatch[0]?.slice(0, 300));
        return null;
      }
    }
    console.warn('[Skazitel:prompts] ❌ Не найден JSON-объект в ответе LLM (длина:', raw.length, ')');
    return null;
  }
}

/**
 * Рекурсивно нормализует snake_case ключи в camelCase.
 * Некоторые LLM (Gemini, GigaChat, DeepSeek) возвращают snake_case ключи
 * вместо camelCase, ожидаемых нашим кодом.
 */
function normalizeKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeKeys);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = normalizeKeys(value);
  }
  return result;
}
