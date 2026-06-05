# Архитектура Сказителя

## Общие принципы

- **Нет бэкенда** — приложение работает полностью на клиенте, все данные хранятся локально
- **API через ключ пользователя** — LLM-вызовы идут напрямую к провайдерам (OpenRouter, GigaChat, z-ai)
- **Два независимых кода** — Chrome-плагин и Android-приложение живут в одном репозитории, но не делят код
- **Общие спецификации** — в `shared-concepts/` лежат YAML/JSON-определения и промпт-шаблоны, которые обе платформы реализуют независимо
- **Оффлайн-режим** — приложение работает без API-ключа с встроенными упражнениями (дрели и 3 творческих)

## Chrome-плагин: детальная архитектура

### manifest.json (Manifest V3)

```json
{
  "manifest_version": 3,
  "name": "Сказитель — тренажёр стихосложения",
  "version": "0.1.0",
  "description": "Учись писать стихи через геймификацию",
  "chrome_url_overrides": {
    "newtab": "index.html"
  },
  "permissions": ["storage"],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

Реализуется как **New Tab Override** — при открытии новой вкладки пользователь видит Сказитель. Это даёт полноценное пространство для UI, без ограничений popup.

### Слои архитектуры

```
┌─────────────────────────────────────────────────┐
│                    UI (React)                      │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐    │
│  │ Screens  │ │ Library  │ │  Syllable/Meter│    │
│  └────┬─────┘ └────┬─────┘ └───────┬───────┘    │
├───────┼────────────┼──────────────┼─────────────┤
│                    Core                            │
│  ┌──────────┐ ┌──────────┐ ┌───────────────┐     │
│  │ Exercise │ │Gamificat.│ │   Storage     │     │
│  │ Engine   │ │ XP/Lvl   │ │  (Dexie.js)   │     │
│  └────┬─────┘ └────┬─────┘ └───────┬───────┘     │
├───────┼────────────┼──────────────┼─────────────┤
│                  LLM Layer                         │
│  ┌──────────────────────────────────────────┐     │
│  │  Provider Router (единый интерфейс)      │     │
│  │  ┌──────────┐ ┌──────┐ ┌──────────┐    │     │
│  │  │OpenRouter│ │ z-ai │ │GigaChat  │    │     │
│  │  │ 15 models│ │ 4 mdl│ │ 2 models │    │     │
│  │  └──────────┘ └──────┘ └──────────┘    │     │
│  └──────────────────────────────────────────┘     │
├───────────────────────────────────────────────────┤
│             chrome.storage / IndexedDB             │
└───────────────────────────────────────────────────┘
```

### Экраны (Screens)

| Экран | Маршрут | Реализация | Описание |
|-------|---------|------------|----------|
| **HomeScreen** | `/` | ✅ Полный | Стрик, уровень, XP, кнопка «Новое задание», список типов упражнений, темы (CRUD, активная тема), последние результаты |
| **ExerciseScreen** | `/exercise` | ✅ Полный | Тип упражнения, генерация через LLM/fallback, поле ввода, подсказки, **панель анализа слогов/ударений/размера**, кнопка «Проверить» |
| **ReviewScreen** | `/review` | ✅ Полный | Баллы по категориям (rhythm, rhyme, imagery, originality, overall), strengths/weaknesses/suggestions, XP, level-up |
| **LibraryScreen** | `/library` | ✅ Полный | Фильтрация по категории/типу, карточки с полным контекстом, повтор, редактирование, удаление |
| **PoemsScreen** | `/poems` | ✅ Частичный | Список стихов (из таблицы poems + попыток), удаление. Нет редактирования |
| **CreativeScreen** | `/creative` | ⚠️ Заглушка | Текстовое поле, счётчики. Нет LLM-разбора, XP, сохранения |
| **EditorScreen** | — | ❌ Не реализован | Планируется: редактор стихов с подсветкой |
| **SettingsScreen** | `/settings` | ✅ Полный | API-ключ, провайдер, модель, валидация, ежедневная цель, экспорт/импорт |
| **OnboardingScreen** | `/onboarding` | ✅ Полный | 3 шага: welcome → уровень → тема |

### Навигация

```
OnboardingScreen (первый запуск)
       │
       ▼
HomeScreen ◄─────────────────────────┐
  ├── «Новое задание» → ExerciseScreen│
  │                      │             │
  │                      ▼             │
  │                ReviewScreen        │
  │                      │             │
  │                «Ещё одно» ────────┘
  │                «На главную» ──────┘
  │
  ├── «Библиотека» → LibraryScreen
  │                     ├── «Повторить» → ExerciseScreen
  │                     └── «Редактировать» / «Удалить»
  │
  ├── «Мои стихи» → PoemsScreen (просмотр, удаление)
  │
  └── «Настройки» → SettingsScreen
```

## Модели данных

### TypeScript-типы (Chrome-плагин)

```typescript
// ==================== Пользователь и прогресс ====================

interface UserProfile {
  id: string;                    // UUID, генерируется при первом запуске
  createdAt: string;             // ISO 8601
  level: number;                  // 1–10
  xp: number;                     // Текущий XP
  xpToNextLevel: number;          // XP до следующего уровня
  streak: number;                 // Дней подряд
  longestStreak: number;          // Рекорд
  lastActiveDate: string;         // ISO date (YYYY-MM-DD)
  difficultyPreference: 1 | 2 | 3; // 1=начинающий, 2=средний, 3=продвинутый
  completedExercises: number;     // Всего выполнено
  successfulExercises: number;    // Успешных (score >= 40)
}

// ==================== Темы ====================

interface Topic {
  id: string;
  name: string;                   // "осенний дождь"
  isBuiltIn: boolean;            // Из репозитория или создана пользователем
  createdAt: string;
  exerciseCount: number;          // Денормализованный счётчик (обновляется при сохранении)
}

// ==================== Упражнения ====================

type ExerciseType =
  // Творческие (8 типов)
  | 'rhythm'          // Ритмический тренажёр
  | 'rhyme'           // Рифмический конструктор
  | 'metaphor'        // Метафорический мост
  | 'constraint'      // Ограничение как искусство
  | 'deconstruction'  // Деконструкция мастера
  | 'phonetics'       // Фонетический этюд
  | 'prose_to_poetry' // Перевод прозы в поэзию
  | 'anti_cliche'     // Анти-клише
  // Дрели (4 типа — с выбором из вариантов)
  | 'syllable_count'  // Силлабический счётчик
  | 'stress_pattern'  // Определение ударений
  | 'rhyme_match'     // Подбор рифмы
  | 'line_builder';   // Конструктор строки

interface Exercise {
  id: string;
  type: ExerciseType;
  topicId: string;
  difficulty: number;             // 1–10
  createdAt: string;

  instruction: string;
  constraints: ExerciseConstraint[];
  examples: string[];
  successCriteria: string[];       // Может быть строкой от LLM (защита Array.isArray)
  hints: string[];

  // Тип-специфичные данные (для творческих типов)
  rhythmData?: { meter, syllableCount, expectedLines, proseText };
  rhymeData?: { keywords, rhymeScheme, requiredPositions };
  metaphorData?: { images, targetEmotion };
  constraintData?: { wordLimit, forbiddenPartsOfSpeech, requiredVerbTense, rhymeScheme, customRules };
  deconstructionData?: { masterPoem, masterAuthor, techniques };
  phoneticsData?: { targetSounds, minSoundWords, mood };
  antiClicheData?: { forbiddenWords, forbiddenImages, requiredOriginalImages };

  // Данные для дрелей (выбор из вариантов)
  drillData?: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

interface ExerciseConstraint {
  type: 'meter' | 'syllable_count' | 'word_count' | 'rhyme_scheme'
       | 'forbidden_words' | 'required_pos' | 'sound' | 'custom';
  value: string | number | string[];
  description: string;
}

// ==================== Ответ и проверка ====================

interface ExerciseAttempt {
  id: string;
  exerciseId: string;
  topicId: string;
  userId: string;
  userResponse: string;
  submittedAt: string;
  review?: ExerciseReview;
  isCreativeSession: boolean;
}

interface ExerciseReview {
  id: string;
  attemptId: string;
  provider: string;
  model: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  scores: {
    rhythm: number;        // 0–100
    rhyme: number;         // 0–100
    imagery: number;       // 0–100
    originality: number;   // 0–100
    overall: number;       // 0–100
  };
  xpEarned: number;
  levelUp: boolean;
  newLevel?: number;
  difficultyAdjustment: 'up' | 'down' | 'same';
}

// ==================== Стихи ====================

interface Poem {
  id: string;
  title: string;
  content: string;
  topicId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  analysis?: {
    meter: string;
    rhymeScheme: string;
    syllablesPerLine: number[];
  };
}

// ==================== Настройки ====================

interface AppSettings {
  apiProvider: ApiProviderConfig | null;
  defaultDifficulty: 1 | 2 | 3;
  dailyGoal: number;              // XP в день (10, 20, 50)
  isOnboarded: boolean;
  exportFormat: 'json';
  activeTopicId?: string;         // ID активной темы для генерации
}

interface ApiProviderConfig {
  provider: 'openrouter' | 'z-ai' | 'gigachat';
  apiKey: string;
  model: string;                  // Полное имя модели с провайдером
}

// ==================== Система уровней ====================

const LEVEL_XP_TABLE: Record<number, number> = {
  1: 0, 2: 100, 3: 300, 4: 600, 5: 1000,
  6: 1500, 7: 2200, 8: 3000, 9: 4000, 10: 5500,
};

const LEVEL_NAMES: Record<number, string> = {
  1: 'Подмастерье', 2: 'Ученик', 3: 'Рифмач', 4: 'Стихотворец',
  5: 'Версификатор', 6: 'Поэт', 7: 'Мастер слова',
  8: 'Творец', 9: 'Виртуоз', 10: 'Сказитель',
};
```

### Хранение данных (IndexedDB через Dexie.js)

```typescript
class SkazitelDB extends Dexie {
  profiles!: Table<UserProfile>;
  topics!: Table<Topic>;
  exercises!: Table<Exercise>;
  attempts!: Table<ExerciseAttempt>;
  poems!: Table<Poem>;

  version(1).stores({
    profiles: 'id, lastActiveDate',
    topics: 'id, isBuiltIn, createdAt',
    exercises: 'id, type, topicId, difficulty, createdAt',
    attempts: 'id, exerciseId, topicId, submittedAt',
    poems: 'id, topicId, isDraft, createdAt',
  });
}
```

### Repository (27 функций)

| Категория | Функции |
|-----------|---------|
| Профиль | `getProfile`, `updateProfile`, `createProfile` |
| Темы | `getTopics`, `addTopic`, `deleteTopic`, `incrementTopicExerciseCount` |
| Активная тема | `setActiveTopicId`, `getActiveTopicId` |
| Упражнения | `getExercise`, `addExercise`, `getExercisesByTopic`, `getExerciseCountByTopic`, `getAllExercises`, `getExercisesByType`, `deleteExercise`, `updateExercise` |
| Попытки | `addAttempt`, `deleteAttempt`, `getAttemptsByTopic`, `getRecentAttempts`, `getRecentAttemptsByTopic` |
| Стихи | `getPoems`, `addPoem`, `updatePoem`, `deletePoem` |
| Экспорт/Импорт | `exportAllData`, `importData` |

Настройки хранятся через `chrome.storage.local` для быстрого доступа.

### Импорт / Экспорт

Экспорт собирает все таблицы IndexedDB + настройки в JSON-файл `skazitel-backup-YYYY-MM-DD.json`. API-ключ не включается.

## LLM-слой

### Провайдеры и модели

| Провайдер | Моделей | Примеры |
|-----------|---------|---------|
| **OpenRouter** | 15 | Gemma 4 31B, Gemini 2.0/2.5/3.1 Flash/Pro, Phi-4, DeepSeek V4 Flash/Pro, Nemotron, Hermes 3 405B |
| **z-ai** | 4 | GLM-4.7-Flash, GLM-4.7, GLM-5.1, GLM-5-Turbo |
| **GigaChat** | 2 | GigaChat-2, GigaChat-2-Mini |
| **Итого** | **21** | |

Маршрутизация: по префиксу `provider/model` через `LLMRouter`.

### Обработка ответов LLM

Движок упражнений (`engine.ts`) содержит несколько уровней защиты от некорректных ответов LLM:

1. **Авто-распаковка вложенного JSON** — если LLM обёрнул ответ в `{ "review": {...} }`, система извлекает внутренний объект
2. **Нормализация flat-полей** — LLM может вернуть `rhythmScore: 20` или `rhythm: 20` вместо `scores: { rhythm: 20 }`; все 3 варианта нормализуются
3. **Конвертация snake_case → camelCase** — поля LLM автоматически маппятся
4. **Форматный пример в промптах** — `REVIEW_JSON_FORMAT` с явным WRONG/RIGHT примерами добавляется к каждому промпту проверки

## Анализ текста (клиентский, без LLM)

Встроенный в ExerciseScreen, работает в реальном времени при вводе:

| Функция | Описание |
|---------|----------|
| `splitWordToSyllables(word)` | Разделение слова на слоги (каждая гласная = новый слог, сонорные ъ/й разделяют гласные) |
| `analyzeLine(line)` | Подсчёт слогов, детекция ударений (заглавные гласные) |
| `detectMeter(pattern)` | Определение стихотворного размера: хорей, ямб, дактиль, амфибрахий, анапест, пеон I–IV |
| `analyzeText(text)` | Построчный анализ + общий размер по большинству |

Визуализация: цветовые слоги (ударные/безударные), паттерн ТА/та, прогресс доверия к определению размера.

## Система геймификации

### XP-система

| Действие | XP |
|----------|-----|
| Дрель: правильный ответ | 15 |
| Дрель: неправильный ответ | 3 |
| Творческое упражнение | 5–50 (от LLM, зависит от оценки) |
| Стрик-бонус (7+ дней) | UI-бейдж «+50% XP» (множожитель ещё не реализован) |

### Стики

Проверка при каждом `saveAttemptAndUpdateProfile()`:
- `lastActiveDate` = сегодня → ничего
- `lastActiveDate` = вчера → `streak++`
- Иначе → `streak = 1`

## Движок упражнений (ExerciseEngine)

Основные методы:

| Метод | Описание |
|-------|----------|
| `generateExercise(type, topicId, topicName, difficulty)` | Генерация через LLM → сохранение в БД → инкремент счётчика темы. Фоллбэк на встроенные. |
| `reviewResponse(exercise, userResponse)` | Проверка через LLM с обработкой некорректных форматов. Фоллбэк на встроенный отзыв. |
| `checkDrillAnswer(exercise, selectedIndex)` | Мгновенная проверка дрели по `correctIndex`. XP: 15/3. |
| `saveAttemptAndUpdateProfile(exercise, response, review)` | Сохранение попытки + автосохранение стиха (творческие) + обновление XP/уровня/стрика. |

### Встроенные упражнения (8 штук)

| Тип | Кол-во | Пример |
|-----|--------|-------|
| rhythm | 2 | Перепиши текст ямбом (сложность 2, 3) |
| rhyme | 1 | Составь четверостишие по схеме abab |
| syllable_count | 2 | Сколько слогов в «золотой»? |
| stress_pattern | 1 | Определи размер «Мороз и солнце; день чудесный» |
| rhyme_match | 1 | Какое слово рифмуется с «зима»? |
| line_builder | 1 | Собери ямбическую строку из слов |

## Безопасность API-ключей

- API-ключ хранится в `chrome.storage.local`
- При экспорте данных API-ключ **не включается** в бэкап
- При импорте — API-ключ не восстанавливается, пользователь вводит заново
