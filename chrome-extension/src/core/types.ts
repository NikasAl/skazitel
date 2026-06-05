// ==================== Пользователь и прогресс ====================

export interface UserProfile {
  id: string;
  createdAt: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  longestStreak: number;
  lastActiveDate: string;
  difficultyPreference: 1 | 2 | 3;
  completedExercises: number;
  successfulExercises: number;
}

// ==================== Темы ====================

export interface Topic {
  id: string;
  name: string;
  isBuiltIn: boolean;
  createdAt: string;
  exerciseCount: number;
}

// ==================== Упражнения ====================

export type ExerciseType =
  | 'rhythm'
  | 'rhyme'
  | 'metaphor'
  | 'constraint'
  | 'deconstruction'
  | 'phonetics'
  | 'prose_to_poetry'
  | 'anti_cliche'
  // Дрели — базовые навыки (с выбором из вариантов)
  | 'syllable_count'
  | 'stress_pattern'
  | 'rhyme_match'
  | 'line_builder';

export interface Exercise {
  id: string;
  type: ExerciseType;
  topicId: string;
  difficulty: number;
  createdAt: string;

  instruction: string;
  constraints: ExerciseConstraint[];
  examples: string[];
  successCriteria: string[];
  hints: string[];

  rhythmData?: RhythmData;
  rhymeData?: RhymeData;
  metaphorData?: MetaphorData;
  constraintData?: ConstraintData;
  deconstructionData?: DeconstructionData;
  phoneticsData?: PhoneticsData;
  antiClicheData?: AntiClicheData;
  // Дрели
  drillData?: DrillData;
}

export interface ExerciseConstraint {
  type:
    | 'meter'
    | 'syllable_count'
    | 'word_count'
    | 'rhyme_scheme'
    | 'forbidden_words'
    | 'required_pos'
    | 'sound'
    | 'custom';
  value: string | number | string[];
  description: string;
}

export interface RhythmData {
  meter: string;
  syllableCount: number;
  expectedLines: number;
  proseText: string;
}

export interface RhymeData {
  keywords: string[];
  rhymeScheme: string;
  requiredPositions: string[];
}

export interface MetaphorData {
  images: string[];
  targetEmotion: string;
}

export interface ConstraintData {
  wordLimit?: number;
  forbiddenPartsOfSpeech?: string[];
  requiredVerbTense?: string;
  rhymeScheme?: string;
  customRules?: string[];
}

export interface DeconstructionData {
  masterPoem: string;
  masterAuthor: string;
  techniques: string[];
}

export interface PhoneticsData {
  targetSounds: string[];
  minSoundWords: number;
  mood: string;
}

export interface AntiClicheData {
  forbiddenWords: string[];
  forbiddenImages: string[];
  requiredOriginalImages: number;
}

// ==================== Дрели (базовые навыки) ====================

/**
 * Единый формат данных для всех дрелей.
 * Дрели — упражнения с выбором из вариантов (не свободный ввод).
 * Результат проверяется мгновенно без вызова LLM.
 */
export interface DrillData {
  /** Текст вопроса (отображается крупно) */
  question: string;
  /** Варианты ответа (3–6 штук) */
  options: string[];
  /** Индекс правильного ответа (0-based) */
  correctIndex: number;
  /** Пояснение, показываемое после ответа */
  explanation: string;
}

// ==================== Ответ и проверка ====================

export interface ExerciseAttempt {
  id: string;
  exerciseId: string;
  topicId: string;
  userId: string;
  userResponse: string;
  submittedAt: string;
  review?: ExerciseReview;
  isCreativeSession: boolean;
}

export interface ExerciseReview {
  id: string;
  attemptId: string;
  provider: string;
  model: string;

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
  levelUp: boolean;
  newLevel?: number;
  difficultyAdjustment: 'up' | 'down' | 'same';
}

// ==================== Стихи ====================

export interface Poem {
  id: string;
  title: string;
  content: string;
  topicId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  analysis?: PoemAnalysis;
  /** Контекст / вдохновение — опорный текст или описание (для черновиков из Писательства) */
  context?: string;
  /** Описание стиля — свободный текст (для черновиков из Писательства) */
  style?: string;
  /** Статус черновика: draft — в работе, finished — готово (для черновиков из Писательства) */
  status?: 'draft' | 'finished';
  /** Отчёт критика — сохранённый результат анализа ИИ (для черновиков из Писательства) */
  criticReport?: string;
}

export interface PoemAnalysis {
  meter: string;
  rhymeScheme: string;
  syllablesPerLine: number[];
}

// ==================== Настройки ====================

export interface AppSettings {
  apiProvider: ApiProviderConfig | null;
  defaultDifficulty: 1 | 2 | 3;
  dailyGoal: number;
  isOnboarded: boolean;
  exportFormat: 'json';
  activeTopicId?: string;
}

export interface ApiProviderConfig {
  provider: 'openrouter' | 'z-ai' | 'gigachat';
  apiKey: string;
  model: string;
}

// ==================== LLM ====================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model: string;
  systemPrompt: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface LLMResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
}

export interface LLMModel {
  id: string;
  displayName: string;
  inputCostPerM: number;
  outputCostPerM: number;
  contextWindow: number;
}

// ==================== Экспорт ====================

export interface ExportBundle {
  version: string;
  exportedAt: string;
  profile: UserProfile;
  settings: AppSettings;
  topics: Topic[];
  exercises: Exercise[];
  attempts: ExerciseAttempt[];
  poems: Poem[];
}

// ==================== Система уровней ====================

export const LEVEL_XP_TABLE: Record<number, number> = {
  1: 0,
  2: 100,
  3: 300,
  4: 600,
  5: 1000,
  6: 1500,
  7: 2200,
  8: 3000,
  9: 4000,
  10: 5500,
};

export const LEVEL_NAMES: Record<number, string> = {
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

// ==================== Типы упражнений (метаданные) ====================

export const EXERCISE_TYPE_INFO: Record<
  ExerciseType,
  { name: string; description: string; icon: string }
> = {
  rhythm: {
    name: 'Ритмический тренажёр',
    description: 'Переложи прозу в заданный стихотворный размер',
    icon: '🎵',
  },
  rhyme: {
    name: 'Рифмический конструктор',
    description: 'Построй четверостишие по схеме рифмовки',
    icon: '🔗',
  },
  metaphor: {
    name: 'Метафорический мост',
    description: 'Найди неожиданные связи между образами',
    icon: '🌉',
  },
  constraint: {
    name: 'Ограничение как искусство',
    description: 'Напиши стих с жёсткими формальными ограничениями',
    icon: '⛓️',
  },
  deconstruction: {
    name: 'Деконструкция мастера',
    description: 'Разбери приёмы великих поэтов и примени их',
    icon: '🔍',
  },
  phonetics: {
    name: 'Фонетический этюд',
    description: 'Создай настроение через звукопись',
    icon: ' whispers',
  },
  prose_to_poetry: {
    name: 'Перевод прозы в поэзию',
    description: 'Преврати свой текст в стихи',
    icon: '✨',
  },
  anti_cliche: {
    name: 'Анти-клише',
    description: 'Напиши стих, избегая очевидных образов',
    icon: '🚫',
  },
  // Дрели — базовые навыки
  syllable_count: {
    name: 'Силлабический счётчик',
    description: 'Определи количество слогов в слове или строке',
    icon: '🔢',
  },
  stress_pattern: {
    name: 'Определение ударений',
    description: 'Найди схему ударений и стихотворный размер',
    icon: '🎙️',
  },
  rhyme_match: {
    name: 'Подбор рифмы',
    description: 'Найди точную рифму среди вариантов',
    icon: '🎯',
  },
  line_builder: {
    name: 'Конструктор строки',
    description: 'Собери строку с правильным ритмом из слов',
    icon: '🧩',
  },
};

export const EXERCISE_TYPES: ExerciseType[] = [
  // Дрели — базовые навыки (рекомендуются начинающим)
  'syllable_count',
  'stress_pattern',
  'rhyme_match',
  'line_builder',
  // Основные упражнения
  'rhythm',
  'rhyme',
  'metaphor',
  'constraint',
  'deconstruction',
  'phonetics',
  'prose_to_poetry',
  'anti_cliche',
];
