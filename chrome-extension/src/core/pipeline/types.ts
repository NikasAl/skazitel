/**
 * Типы для ядра пайплайна поэтической генерации.
 */

/** Имена агентов пайплайна */
export type AgentName = 'conceptologist' | 'formalist' | 'poet' | 'metrist' | 'editor' | 'final_check';

/** Метаданные агента */
export interface AgentInfo {
  name: AgentName;
  label: string;
  labelEn: string;
  description: string;
  educationalNote: string;
  isProgrammatic: boolean;
}

/** Конфигурация запуска пайплайна */
export interface PipelineRunConfig {
  topic: string;
  style: string;
  meter: string;
  rhymeScheme: string;
  stanzaCount: number;
  maxIterations: number;
}

/** Результат программной проверки Метриста */
export interface MetristReport {
  /** Оценка размера: 0-100 */
  meterScore: number;
  /** Оценка рифм: 0-100 */
  rhymeScore: number;
  /** Ошибки размера по строкам */
  meterErrors: string[];
  /** Ошибки рифм по строфам */
  rhymeErrors: string[];
  /** Детали по строкам */
  lineDetails: LineMeterDetail[];
  /** Детали по рифмам */
  rhymeDetails: RhymeDetail[];
  /** Общая оценка (среднее) */
  overallScore: number;
  /** Пройдена ли проверка (оба >= 60) */
  passed: boolean;
}

/** Детали по одной строке */
export interface LineMeterDetail {
  lineNumber: number;
  text: string;
  syllableCount: number;
  expectedSyllables: number | null;
  meter: string;
  confidence: number;
  ok: boolean;
}

/** Детали по одной рифмопаре */
export interface RhymeDetail {
  word1: string;
  word2: string;
  type: 'exact' | 'rich' | 'assonance' | 'none';
  score: number;
  ok: boolean;
  lineNumber1: number;
  lineNumber2: number;
}

/** Промпт и ответ агента для логирования */
export interface AgentLog {
  agent: AgentName | 'system';
  stepNumber: number;
  iteration?: number;
  prompt: string;
  input: string;
  output: string;
  durationMs: number;
  tokens?: { prompt: number; completion: number };
  metristReport?: MetristReport;
  error?: string;
}

/** Статус пайплайна для UI */
export type PipelineStatus = 'idle' | 'configuring' | 'running' | 'paused' | 'completed' | 'error' | 'cancelled';

/** Информация о текущем шаге */
export interface PipelineStepInfo {
  stepNumber: number;
  agent: AgentName;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped' | 'edited';
  iteration?: number;
}

/** Все агенты с их метаданными */
export const PIPELINE_AGENTS: AgentInfo[] = [
  {
    name: 'conceptologist',
    label: 'Концептолог',
    labelEn: 'The Architect',
    description: 'Извлекает образы, метафоры и конфликты из контекста',
    educationalNote: 'Приём: перед написанием стиха разложите тему на образы и смыслы. Это помогает сохранить фокус и избежать банальностей.',
    isProgrammatic: false,
  },
  {
    name: 'formalist',
    label: 'Формалист',
    labelEn: 'The Skeleton Builder',
    description: 'Создаёт схему рифмовки и подбирает звучные рифмопары',
    educationalNote: 'Приём: сначала подберите рифмопары — звучные, нетривиальные, не глагольные — а потом пишите строки под них. Это повышает качество.',
    isProgrammatic: false,
  },
  {
    name: 'poet',
    label: 'Поэт',
    labelEn: 'The Weaver',
    description: 'Пишет черновик стихотворения по образам и рифмопарам',
    educationalNote: 'Приём: пишите с ограничениями — определённые рифмопары, конкретные образы. Ограничения рождают креативность.',
    isProgrammatic: false,
  },
  {
    name: 'metrist',
    label: 'Метрист',
    labelEn: 'The Metrist',
    description: 'Программная проверка размера и рифм',
    educationalNote: 'Внимательность к метрике — основа стихосложения. Научитесь слышать ритм и считать слоги.',
    isProgrammatic: true,
  },
  {
    name: 'editor',
    label: 'Редактор',
    labelEn: 'The Editor',
    description: 'Смысловая и стилистическая шлифовка',
    educationalNote: 'Приём: перечитайте стих, замените слабые глаголы, уберите плеоназмы, усильте финал.',
    isProgrammatic: false,
  },
  {
    name: 'final_check',
    label: 'Финальная проверка',
    labelEn: 'Final Check',
    description: 'Повторная программная проверка + итоговая оценка',
    educationalNote: 'Последний взгляд — проверьте метрику и смысл ещё раз перед завершением.',
    isProgrammatic: false,
  },
];
