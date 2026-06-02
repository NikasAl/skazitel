/**
 * Интерфейс провайдера LLM.
 * Каждый провайдер (OpenRouter, ZAi, GigaChat) реализует этот интерфейс.
 */

import type { LLMModel, LLMRequest, LLMResponse } from '../core/types';

export interface LLMProvider {
  /** Уникальный идентификатор провайдера (например, 'openrouter') */
  readonly id: string;
  /** Человекочитаемое название провайдера */
  readonly name: string;
  /** Список доступных моделей */
  readonly models: LLMModel[];
  /** Отправка запроса к API чата */
  chatCompletion(request: LLMRequest, apiKey: string): Promise<LLMResponse>;
  /** Проверка валидности ключа API (с конкретной моделью) */
  validateApiKey(apiKey: string, modelId?: string): Promise<boolean>;
}
