/**
 * Провайдер GigaChat — LLM от Сбера.
 * Поддерживает модели GigaChat 2 и GigaChat 2 Mini.
 */

import type { LLMModel, LLMRequest, LLMResponse } from '../core/types';
import type { LLMProvider } from './types';

/** Доступные модели GigaChat */
const MODELS: LLMModel[] = [
  { id: 'gigachat/giga-2', displayName: 'GigaChat 2', inputCostPerM: 0.15, outputCostPerM: 0.15, contextWindow: 32000 },
  { id: 'gigachat/giga-2-mini', displayName: 'GigaChat 2 Mini', inputCostPerM: 0.05, outputCostPerM: 0.05, contextWindow: 16000 },
];

/** Основной URL API GigaChat */
const API_URL = 'https://gigachat.devices.sber.ru/v2/chat/completions';

/** Префикс провайдера в идентификаторе модели */
const PROVIDER_PREFIX = 'gigachat/';

export class GigaChatProvider implements LLMProvider {
  readonly id = 'gigachat';
  readonly name = 'GigaChat';
  readonly models = MODELS;

  /**
   * Отправляет запрос к GigaChat API и возвращает результат.
   * Из model убирается префикс «gigachat/».
   */
  async chatCompletion(request: LLMRequest, apiKey: string): Promise<LLMResponse> {
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

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Обработка ошибок
    if (!response.ok) {
      await this.handleError(response, 'GigaChat');
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
   * Проверяет валидность API-ключа отправкой минимального запроса.
   */
  async validateApiKey(apiKey: string, _modelId?: string): Promise<boolean> {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'GigaChat-2',
          messages: [{ role: 'user', content: 'привет' }],
          max_tokens: 1,
        }),
      });
      return response.ok;
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
