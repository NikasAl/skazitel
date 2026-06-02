/**
 * Маршрутизатор LLM-запросов.
 * Определяет провайдера по префиксу в идентификаторе модели
 * и перенаправляет запрос соответствующему провайдеру.
 *
 * Пример:
 *  «openrouter/openai/gpt-4o» → OpenRouterProvider
 *  «z-ai/glm-4»              → ZAiProvider
 *  «gigachat/giga-2»          → GigaChatProvider
 */

import type { LLMRequest, LLMResponse, LLMModel } from '../core/types';
import type { LLMProvider } from './types';
import { OpenRouterProvider } from './openrouter';
import { ZAiProvider } from './zai';
import { GigaChatProvider } from './gigachat';

class LLMRouter {
  /** Карта зарегистрированных провайдеров по идентификатору */
  private providers: Map<string, LLMProvider>;

  constructor() {
    const providers: LLMProvider[] = [
      new OpenRouterProvider(),
      new ZAiProvider(),
      new GigaChatProvider(),
    ];
    this.providers = new Map(providers.map(p => [p.id, p]));
  }

  /** Возвращает все модели всех зарегистрированных провайдеров */
  getAllModels(): LLMModel[] {
    return Array.from(this.providers.values()).flatMap(p => p.models);
  }

  /** Возвращает провайдера по идентификатору или undefined */
  getProvider(providerId: string): LLMProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Выполняет chat-completion запрос.
   * Провайдер определяется по первому сегменту идентификатора модели.
   * API-ключ передаётся провайдеру напрямую.
   */
  async chatCompletion(request: LLMRequest, apiKey: string): Promise<LLMResponse> {
    const providerId = request.model.split('/')[0];
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(
        `Провайдер "${providerId}" не найден. Модель: "${request.model}". ` +
        `Доступные провайдеры: ${Array.from(this.providers.keys()).join(', ')}`,
      );
    }
    return provider.chatCompletion(request, apiKey);
  }

  /**
   * Проверяет валидность API-ключа для указанного провайдера.
   * Возвращает false при отсутствии провайдера или при любой ошибке.
   */
  async validateApiKey(providerId: string, apiKey: string): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    try {
      return await provider.validateApiKey(apiKey);
    } catch {
      return false;
    }
  }
}

/** Глобальный экземпляр маршрутизатора */
export const llmRouter = new LLMRouter();
export { LLMRouter };
