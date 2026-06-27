/**
 * Провайдер OpenRouter — единый шлюз к множеству моделей
 * (OpenAI, Anthropic, Google, Meta, Mistral и др.)
 */

import type { LLMModel, LLMRequest, LLMResponse } from '../core/types';
import type { LLMProvider } from './types';

/** Доступные модели через OpenRouter */
const MODELS: LLMModel[] = [
  // Google
  { id: 'openrouter/google/gemma-4-31b-it', displayName: 'Gemma 4 31B IT', inputCostPerM: 0.2, outputCostPerM: 0.2, contextWindow: 128000 },
  { id: 'openrouter/google/gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', inputCostPerM: 0.075, outputCostPerM: 0.3, contextWindow: 128000 },
  { id: 'openrouter/google/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', inputCostPerM: 1.25, outputCostPerM: 10, contextWindow: 1000000 },
  { id: 'openrouter/google/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', inputCostPerM: 0.15, outputCostPerM: 0.6, contextWindow: 1000000 },
  { id: 'openrouter/google/gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite', inputCostPerM: 0.075, outputCostPerM: 0.3, contextWindow: 1000000 },
  { id: 'openrouter/google/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', inputCostPerM: 1.25, outputCostPerM: 10, contextWindow: 1000000 },
  { id: 'openrouter/google/gemini-2.0-flash-lite-001', displayName: 'Gemini 2.0 Flash Lite', inputCostPerM: 0.075, outputCostPerM: 0.3, contextWindow: 128000 },
  { id: 'openrouter/google/gemini-2.0-flash-001', displayName: 'Gemini 2.0 Flash', inputCostPerM: 0.1, outputCostPerM: 0.4, contextWindow: 128000 },
  // Microsoft
  { id: 'openrouter/microsoft/phi-4', displayName: 'Phi-4', inputCostPerM: 0.15, outputCostPerM: 0.6, contextWindow: 16384 },
  // DeepSeek
  { id: 'openrouter/deepseek/deepseek-v4-flash', displayName: 'DeepSeek V4 Flash', inputCostPerM: 0.04, outputCostPerM: 0.04, contextWindow: 131072 },
  { id: 'openrouter/deepseek/deepseek-v4-flash:free', displayName: 'DeepSeek V4 Flash (free)', inputCostPerM: 0, outputCostPerM: 0, contextWindow: 131072 },
  { id: 'openrouter/deepseek/deepseek-v4-pro', displayName: 'DeepSeek V4 Pro', inputCostPerM: 0.14, outputCostPerM: 0.42, contextWindow: 131072 },
  // NVIDIA
  { id: 'openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', displayName: 'Nemotron Nano Omni 30B (free)', inputCostPerM: 0, outputCostPerM: 0, contextWindow: 131072 },
  { id: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free', displayName: 'Nemotron Super 120B (free)', inputCostPerM: 0, outputCostPerM: 0, contextWindow: 131072 },
  // NousResearch
  { id: 'openrouter/nousresearch/hermes-3-llama-3.1-405b:free', displayName: 'Hermes 3 Llama 3.1 405B (free)', inputCostPerM: 0, outputCostPerM: 0, contextWindow: 131072 },
];

/** Базовый URL API OpenRouter */
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Префикс провайдера в идентификаторе модели */
const PROVIDER_PREFIX = 'openrouter/';

export class OpenRouterProvider implements LLMProvider {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  readonly models = MODELS;

  /**
   * Отправляет запрос к OpenRouter API и возвращает результат.
   * Из model убирается префикс «openrouter/», который нужен только
   * для внутренней маршрутизации.
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
      max_tokens: request.maxTokens ?? 4096,
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
        'HTTP-Referer': 'https://github.com/NikasAl/skazitel',
      },
      body: JSON.stringify(body),
    });

    // Обработка ошибок
    if (!response.ok) {
      await this.handleError(response, 'OpenRouter');
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
   * Если указана modelId — использует её, иначе первую из списка.
   */
  async validateApiKey(apiKey: string, modelId?: string): Promise<boolean> {
    try {
      // Убираем префикс провайдера если передан полный ID
      const model = modelId
        ? (modelId.startsWith(PROVIDER_PREFIX) ? modelId.slice(PROVIDER_PREFIX.length) : modelId)
        : 'google/gemini-2.0-flash-001';

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/NikasAl/skazitel',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });

      if (!response.ok) {
        // 401 = неверный ключ, 404 = модель не найдена
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
