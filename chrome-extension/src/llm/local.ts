/**
 * Провайдер локальных моделей — единая точка доступа к Ollama, LM Studio,
 * llama.cpp и другим серверам с OpenAI-совместимым API.
 *
 * Параметр apiKey переиспользуется как базовый URL сервера
 * (конвенция, чтобы не расширять интерфейс LLMProvider).
 */

import type { LLMModel, LLMRequest, LLMResponse } from '../core/types';
import type { LLMProvider } from './types';

/** Базовый URL по умолчанию */
const DEFAULT_BASE_URL = 'http://turbo:8080';

/** Доступные локальные модели */
const MODELS: LLMModel[] = [
  { id: 'local/gemma-4-26b', displayName: 'Gemma 4 26B (локальная)', inputCostPerM: 0, outputCostPerM: 0, contextWindow: 131072 },
  { id: 'local/llama-3', displayName: 'Llama 3 (локальная)', inputCostPerM: 0, outputCostPerM: 0, contextWindow: 8192 },
  { id: 'local/qwen-2.5', displayName: 'Qwen 2.5 (локальная)', inputCostPerM: 0, outputCostPerM: 0, contextWindow: 32768 },
  { id: 'local/custom', displayName: 'Пользовательская модель', inputCostPerM: 0, outputCostPerM: 0, contextWindow: 4096 },
];

/** Префикс провайдера в идентификаторе модели */
const PROVIDER_PREFIX = 'local/';

export class LocalProvider implements LLMProvider {
  readonly id = 'local';
  readonly name = 'Локальная модель';
  readonly models = MODELS;

  /**
   * Отправляет запрос к локальному API и возвращает результат.
   * Из model убирается префикс «local/», который нужен только
   * для внутренней маршрутизации.
   *
   * Параметр apiKey переиспользуется как базовый URL сервера.
   */
  async chatCompletion(request: LLMRequest, apiKey: string): Promise<LLMResponse> {
    const baseUrl = apiKey || DEFAULT_BASE_URL;

    // Убираем префикс провайдера перед отправкой
    const modelId = request.model.startsWith(PROVIDER_PREFIX)
      ? request.model.slice(PROVIDER_PREFIX.length)
      : request.model;

    // Формируем сообщения: system-промпт + цепочка диалога
    const messages = [
      { role: 'system' as const, content: request.systemPrompt },
      ...request.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    // Тело запроса
    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    };

    // Если запрошен JSON-формат ответа — добавляем response_format
    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Обработка ошибок
    if (!response.ok) {
      await this.handleError(response, 'Локальная модель');
    }

    const data = await response.json();

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      model: data.model ?? request.model,
    };
  }

  /**
   * Проверяет доступность локального сервера через GET /v1/models.
   * Параметр apiKey переиспользуется как базовый URL сервера.
   */
  async validateApiKey(apiKey: string, _modelId?: string): Promise<boolean> {
    try {
      const baseUrl = apiKey || DEFAULT_BASE_URL;
      const url = `${baseUrl.replace(/\/+$/, '')}/v1/models`;
      const response = await fetch(url, {
        method: 'GET',
      });

      if (!response.ok) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Обрабатывает HTTP-ошибку: пытается извлечь описание из тела ответа.
   */
  private async handleError(response: Response, providerName: string): Promise<never> {
    let message = `Ошибка ${providerName}: ${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (data.error?.message) {
        message = `Ошибка ${providerName}: ${data.error.message}`;
      }
    } catch {
      // Тело не JSON — используем статус
    }
    throw new Error(message);
  }
}
