/**
 * Провайдер ZAi (智谱AI / ZhipuAI) — китайская LLM-платформа.
 * Использует JWT-токен в качестве API-ключа.
 */

import type { LLMModel, LLMRequest, LLMResponse } from '../core/types';
import type { LLMProvider } from './types';

/** Доступные модели ZAi */
const MODELS: LLMModel[] = [
  { id: 'z-ai/glm-4.7-flash', displayName: 'GLM-4.7-Flash', inputCostPerM: 0.01, outputCostPerM: 0.01, contextWindow: 128000 },
  { id: 'z-ai/glm-4.7', displayName: 'GLM-4.7', inputCostPerM: 0.1, outputCostPerM: 0.1, contextWindow: 128000 },
  { id: 'z-ai/glm-5.1', displayName: 'GLM-5.1', inputCostPerM: 0.14, outputCostPerM: 0.14, contextWindow: 128000 },
  { id: 'z-ai/glm-5-turbo', displayName: 'GLM-5-Turbo', inputCostPerM: 0.1, outputCostPerM: 0.1, contextWindow: 128000 },
];

/** Базовый URL API ZAi (智谱AI) */
const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

/** Префикс провайдера в идентификаторе модели */
const PROVIDER_PREFIX = 'z-ai/';

export class ZAiProvider implements LLMProvider {
  readonly id = 'z-ai';
  readonly name = 'ZAi (智谱AI)';
  readonly models = MODELS;

  /**
   * Отправляет запрос к ZAi API и возвращает результат.
   * Из model убирается префикс «z-ai/».
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
      await this.handleError(response, 'ZAi');
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
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4.7-flash',
          messages: [{ role: 'user', content: 'hi' }],
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
