# Архитектура Сказителя

## Общие принципы

- **Нет бэкенда** — приложение работает полностью на клиенте, все данные хранятся локально
- **API через ключ пользователя** — LLM-вызовы идут напрямую к провайдерам (OpenRouter, GigaChat, z-ai)
- **Два независимых кода** — Chrome-плагин и Android-приложение живут в одном репозитории, но не делят код
- **Общие спецификации** — в `shared-concepts/` лежат YAML/JSON-определения и промпт-шаблоны, которые обе платформы реализуют независимо
- **Оффлайн-режим** — приложение работает без API-ключа с встроенными темами и упражнениями

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
┌─────────────────────────────────────────┐
│                  UI (React)             │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ │
│  │ Screens │ │ Widgets  │ │  Editor   │ │
│  └────┬────┘ └────┬─────┘ └─────┬─────┘ │
├───────┼───────────┼────────────┼───────┤
│                  Core                       │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ │
│  │Exercise │ │Gamificat.│ │  Storage   │ │
│  │ Engine  │ │ System   │ │  (Dexie)   │ │
│  └────┬────┘ └────┬─────┘ └─────┬─────┘ │
├───────┼───────────┼────────────┼───────┤
│                LLM Layer                    │
│  ┌──────────────────────────────────┐     │
│  │  Provider Router (единый iface)  │     │
│  │  ┌───────┐ ┌──────┐ ┌────────┐ │     │
│  │  │OpenRoutr│ │z-ai │ │GigaChat│ │     │
│  │  └───────┘ └──────┘ └────────┘ │     │
│  └──────────────────────────────────┘     │
├───────────────────────────────────────────┤
│           chrome.storage / IndexedDB       │
└───────────────────────────────────────────┘
```

### Экраны (Screens)

| Экран | Назначение | Описание |
|-------|-----------|----------|
| **HomeScreen** | Главная | Стрик, уровень, XP, кнопка «Новое задание», список тем |
| **ExerciseScreen** | Выполнение | Текст задания, поле ввода, подсказки, кнопка «Проверить» |
| **ReviewScreen** | Фидбек | Результат проверки, анализ, заработанный XP, кнопка «Далее» |
| **CreativeScreen** | Творческая сессия | Свободное письмо без оценки, опциональный разбор ИИ |
| **PoemsScreen** | Мои стихи | Список написанных стихов, редактор |
| **EditorScreen** | Редактор | Текстовый редактор с подсветкой ритма/рифмы |
| **SettingsScreen** | Настройки | API-ключ, провайдер, модель, экспорт/импорт |
| **OnboardingScreen** | Онбординг | Выбор уровня, ввод темы, описание механики |

### Навигация

```
OnboardingScreen (первый запуск)
       │
       ▼
HomeScreen ◄─────────────────────────┐
  ├── NewTab → ExerciseScreen        │
  │               │                  │
  │               ▼                  │
  │          ReviewScreen             │
  │               │                  │
  │        (каждое 5-е)              │
  │               ▼                  │
  │        CreativeScreen ────────────┘
  │
  ├── PoemsScreen → EditorScreen
  │
  └── SettingsScreen
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
  lastActiveDate: string;         // ISO date (YYYY-MM-DD)
  difficultyPreference: 1 | 2 | 3; // 1=начинающий, 2=средний, 3=продвинутый
  completedExercises: number;     // Всего выполнено
  successfulExercises: number;    // Успешных
}

// ==================== Темы ====================

interface Topic {
  id: string;
  name: string;                   // "осенний дождь"
  isBuiltIn: boolean;            // Из репозитория или создана пользователем
  createdAt: string;
  exerciseCount: number;          // Сколько упражнений выполнено по этой теме
}

// ==================== Упражнения ====================

type ExerciseType =
  | 'rhythm'          // Ритмический тренажёр
  | 'rhyme'           // Рифмический конструктор
  | 'metaphor'        // Метафорический мост
  | 'constraint'      // Ограничение как искусство
  | 'deconstruction'  // Деконструкция мастера
  | 'phonetics'       // Фонетический этюд
  | 'prose_to_poetry' // Перевод прозы в поэзию
  | 'anti_cliche';    // Анти-клише

interface Exercise {
  id: string;
  type: ExerciseType;
  topicId: string;
  difficulty: number;             // 1–10
  createdAt: string;

  // Содержимое задания (заполняется LLM или из встроенных данных)
  instruction: string;           // Текст инструкции для пользователя
  constraints: ExerciseConstraint[];
  examples: string[];            // 1–2 примера (не ответы)
  successCriteria: string[];     // Критерии успеха
  hints: string[];                // Подсказки (показываются по запросу)

  // Тип-специфичные поля
  rhythmData?: {
    meter: string;                // "ямб", "хорей", "дактиль" и т.д.
    syllableCount: number;
    expectedLines: number;
    proseText: string;            // Прозаический текст для переложения
  };
  rhymeData?: {
    keywords: string[];           // Ключевые слова
    rhymeScheme: string;         // "abab", "aabb" и т.д.
    requiredPositions: string[];  // Где должны стоять рифмующиеся слова
  };
  metaphorData?: {
    images: string[];             // Образы для метафор
    targetEmotion: string;       // Целевое настроение
  };
  constraintData?: {
    wordLimit: number;
    forbiddenPartsOfSpeech: string[];
    requiredVerbTense: string;
    rhymeScheme: string;
    customRules: string[];
  };
  deconstructionData?: {
    masterPoem: string;           // Отрывок стихотворения
    masterAuthor: string;
    techniques: string[];         // Приёмы для использования
  };
  phoneticsData?: {
    targetSounds: string[];       // ['с', 'ш', 'щ']
    minSoundWords: number;
    mood: string;
  };
  antiClicheData?: {
    forbiddenWords: string[];
    forbiddenImages: string[];
    requiredOriginalImages: number;
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
  userResponse: string;          // Текст ответа пользователя
  submittedAt: string;

  // Результат проверки
  review?: ExerciseReview;
  isCreativeSession: boolean;     // Творческая сессия (без оценки)
}

interface ExerciseReview {
  id: string;
  attemptId: string;
  provider: string;               // "openrouter", "z-ai", "gigachat"
  model: string;                  // "gpt-4o", "claude-3.5-sonnet" и т.д.

  strengths: string[];            // Что получилось хорошо
  weaknesses: string[];          // На что обратить внимание
  suggestions: string[];         // 2–3 варианта улучшения

  scores: {
    rhythm: number;               // 0–100
    rhyme: number;                // 0–100
    imagery: number;              // 0–100
    originality: number;          // 0–100
    overall: number;             // 0–100 (взвешенное)
  };

  xpEarned: number;              // Заработанный XP
  levelUp: boolean;              // Повышение уровня
  newLevel?: number;

  // Для адаптации сложности
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
  // Автоматический анализ
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
}

interface ApiProviderConfig {
  provider: 'openrouter' | 'z-ai' | 'gigachat';
  apiKey: string;
  model: string;                  // Полное имя модели с провайдером
}

// ==================== Система уровней ====================

// XP-таблица для уровней
const LEVEL_XP_TABLE: Record<number, number> = {
  1: 0,       // Подмастерье
  2: 100,     // Ученик
  3: 300,     // Рифмач
  4: 600,     // Стихотворец
  5: 1000,    // Версификатор
  6: 1500,    // Поэт
  7: 2200,    // Мастер слова
  8: 3000,    // Творец
  9: 4000,    // Виртуоз
  10: 5500,   // Сказитель
};

const LEVEL_NAMES: Record<number, string> = {
  1: 'Подмастерье',
  2: 'Ученик',
  3: 'Рифмач',
  4: 'Стихотворец',
  5: 'Версификатор',
  6: 'Поэт',
  7: 'Мастер слова',
  8: 'Творец',
  9: 'Виртуоз',
  10: 'Сказитель',
};
```

### Хранение данных (IndexedDB через Dexie.js)

```typescript
import Dexie, { Table } from 'dexie';

class SkazitelDB extends Dexie {
  profiles!: Table<UserProfile>;
  topics!: Table<Topic>;
  exercises!: Table<Exercise>;
  attempts!: Table<ExerciseAttempt>;
  poems!: Table<Poem>;

  constructor() {
    super('skazitel');

    this.version(1).stores({
      profiles: 'id, lastActiveDate',
      topics: 'id, isBuiltIn, createdAt',
      exercises: 'id, type, topicId, difficulty, createdAt',
      attempts: 'id, exerciseId, topicId, submittedAt',
      poems: 'id, topicId, isDraft, createdAt',
    });
  }
}

const db = new SkazitelDB();
```

Настройки хранятся через `chrome.storage.local` для быстрого доступа:

```typescript
chrome.storage.local.get(['settings'], ({ settings }) => { ... });
chrome.storage.local.set({ settings: newSettings });
```

### Импорт / Экспорт

Экспорт собирает все таблицы IndexedDB + настройки в один JSON-файл:

```typescript
interface ExportBundle {
  version: string;
  exportedAt: string;
  profile: UserProfile;
  settings: AppSettings;
  topics: Topic[];
  exercises: Exercise[];
  attempts: ExerciseAttempt[];
  poems: Poem[];
}
```

Формат файла: `skazitel-backup-YYYY-MM-DD.json`.

## LLM-слой

### Архитектура провайдеров

```typescript
// Единый интерфейс для всех провайдеров
interface LLMProvider {
  readonly id: 'openrouter' | 'z-ai' | 'gigachat';
  readonly name: string;
  readonly models: LLMModel[];

  chatCompletion(request: LLMRequest): Promise<LLMResponse>;
  validateApiKey(key: string): Promise<boolean>;
}

interface LLMModel {
  // Уникальный идентификатор модели, включающий провайдера
  // Формат: "provider/model-name"
  // Примеры:
  //   "openrouter/openai/gpt-4o"
  //   "openrouter/anthropic/claude-3.5-sonnet"
  //   "z-ai/glm-4"
  //   "gigachat/giga-2"
  id: string;

  // Отображаемое имя (короткое)
  displayName: string;

  // Провайдер, определяемый из id
  get provider(): string;

  // Стоимость за 1M токенов (вход/выход)
  inputCostPerM: number;
  outputCostPerM: number;

  // Контекстное окно
  contextWindow: number;
}

interface LLMRequest {
  model: string;        // Полный id модели
  systemPrompt: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}
```

### Роутер провайдеров

По имени модели (из dropdown) однозначно определяется провайдер:

```typescript
class LLMRouter {
  private providers: Map<string, LLMProvider>;

  // Получить список всех моделей (для dropdown)
  getAllModels(): LLMModel[];

  // Отправить запрос по полному имени модели
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const providerId = request.model.split('/')[0]; // "openrouter", "z-ai", "gigachat"
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Провайдер ${providerId} не найден`);
    return provider.chatCompletion(request);
  }
}
```

### Dropdown-модели

Пользователь видит единый выпадающий список. Формат элементов:

```
── OpenRouter ──
  openai/gpt-4o
  openai/gpt-4o-mini
  anthropic/claude-sonnet-4
  anthropic/claude-haiku-3.5
  google/gemini-2.5-pro
  meta-llama/llama-3.1-70b
  mistralai/mixtral-8x22b

── z-ai ──
  glm-4
  glm-4-flash

── GigaChat ──
  giga-2
  giga-2-mini
```

Идентификатор модели (`model.id`) используется для маршрутизации. При выборе модели провайдер переключается автоматически.

### Реализация провайдеров

#### OpenRouter

```typescript
class OpenRouterProvider implements LLMProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  readonly models: LLMModel[];

  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/NikasAl/skazitel',
      },
      body: JSON.stringify({
        model: request.model.replace('openrouter/', ''),
        messages: [
          { role: 'system', content: request.systemPrompt },
          ...request.messages,
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2000,
        response_format: request.responseFormat === 'json'
          ? { type: 'json_object' }
          : undefined,
      }),
    });
    // ... парсинг ответа
  }
}
```

#### z-ai

```typescript
class ZAiProvider implements LLMProvider {
  readonly id = 'z-ai';
  readonly name = 'z-ai';
  readonly models: LLMModel[];

  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    // z-ai SDK или REST API
    // ... аналогичная реализация
  }
}
```

#### GigaChat

```typescript
class GigaChatProvider implements LLMProvider {
  readonly id = 'gigachat';
  readonly name = 'GigaChat';
  readonly models: LLMModel[];

  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    // GigaChat API (REST)
    // Авторизация через client_id/client_secret или ключ
    // ... аналогичная реализация
  }
}
```

### Кэширование упражнений

Для экономии API-вызовов сгенерированные упражнения кэшируются локально:

```typescript
interface ExerciseCache {
  topicId: string;
  exerciseType: ExerciseType;
  difficulty: number;
  exercise: Exercise;
  generatedAt: string;
  // Хэш параметров для проверки актуальности
  paramsHash: string;
}
```

Кэш хранится в IndexedDB. При повторном запросе с теми же параметрами — возвращается кэшированное упражнение.

## Система геймификации

### XP-система

| Действие | XP |
|----------|-----|
| Выполнение упражнения (успех) | 20–40 (зависит от сложности) |
| Выполнение упражнения (попытка) | 5–10 |
| Творческая сессия | 15 |
| Написание стиха в редакторе | 10 |
| Стрик-бонус (7+ дней) | +50% к XP |
| Стрик-бонус (30+ дней) | +100% к XP |

### Стики

```typescript
interface StreakData {
  currentStreak: number;        // Текущий стрик
  longestStreak: number;        // Рекорд
  lastActiveDate: string;       // YYYY-MM-DD
  streakHistory: {             // Последние 30 дней
    date: string;
    active: boolean;
  }[];
}
```

Проверка стрика при каждом открытии приложения:
1. Если `lastActiveDate` = сегодня — ничего не делаем
2. Если `lastActiveDate` = вчера — `currentStreak++`
3. Если `lastActiveDate` старше — `currentStreak = 0`

### Определение сложности

```typescript
function calculateNextDifficulty(
  currentDifficulty: number,
  recentResults: ExerciseReview[]
): number {
  const last3 = recentResults.slice(-3);
  const avgScore = last3.reduce((sum, r) => sum + r.scores.overall, 0) / last3.length;

  if (avgScore >= 80 && last3.length >= 3) {
    return Math.min(10, currentDifficulty + 1);
  }
  if (avgScore < 40 && last3.length >= 3) {
    return Math.max(1, currentDifficulty - 1);
  }
  return currentDifficulty;
}
```

## Редактор стихов

### Базовые функции

- Подсветка слогов в реальном времени (число слогов в строке)
- Определение стихотворного размера (ямб, хорей, дактиль, амфибрахий, анапест)
- Подсветка рифмующихся окончаний (цветом по парам)
- Подсчёт количества слов, строк
- Счётчик для ограничений (слова, запрещённые слова)

### Локальный анализ (без LLM)

```typescript
interface PoemAnalysis {
  lines: AnalysedLine[];
  detectedMeter: string;
  rhymeScheme: string;
  totalSyllables: number;
  totalWords: number;
}

interface AnalysedLine {
  text: string;
  syllableCount: number;
  stresses: number[];       // Позиции ударений
  metricalPattern: string;  // "_U_U_U_U" (U=ударный, _=безударный)
}
```

Определение слогов — через словарь или эвристику. Ударения — через словарь ударений (встроенный JSON с частотными словами).

## Безопасность API-ключей

- API-ключ хранится в `chrome.storage.local` (зашифрованное хранилище Chrome)
- При экспорте данных API-ключ **не включается** в бэкап (замещается на `[REDACTED]`)
- При импорте — API-ключ не восстанавливается, пользователь вводит заново
