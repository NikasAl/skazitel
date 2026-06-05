/**
 * WritingEngine — ИИ-ассистент для страницы «Писательство».
 *
 * Предоставляет инструменты для поэта:
 * 1. Создать черновик — генерация стихов по контексту и стилю
 * 2. Критик — анализ фрагмента стихов
 * 3. Подобрать рифмы — к заданному слову в контексте
 * 4. Перегенерировать строфу — переписать выделенную строфу в стиле
 * 5. Продолжить — дописать следующую строфу
 * 6. Сократить / Развернуть — изменить объём фрагмента
 */

import { llmRouter } from '../../llm/router';
import { getSettings } from '../storage/settings';
import { parseLLMJson } from './prompts';

// ==================== Типы ====================

export interface WritingToolResult {
  /** Тип инструмента */
  tool: WritingTool;
  /** Текстовый результат (генерированный текст, анализ, рифмы) */
  text: string;
  /** Метаданные результата (опционально) */
  meta?: Record<string, unknown>;
}

export type WritingTool =
  | 'generate'
  | 'critic'
  | 'rhymes'
  | 'rewrite_stanza'
  | 'continue'
  | 'resize';

// ==================== Системные промпты ====================

const WRITING_SYSTEM_PROMPT = `Ты — опытный поэт-наставник и литературный редактор. Ты помогаешь автору писать и улучшать стихи.
Ты НЕ переписываешь всё произведение за автора — ты предлагаешь варианты, анализируешь, подбираешь рифмы.
Отвечай на русском языке.
Если от тебя просят только текст (стихи, рифмы, продолжение) — возвращай ТОЛЬКО текст без пояснений.
Если от тебя просят анализ — давай структурированный разбор.`;

const WRITING_JSON_SYSTEM_PROMPT = `Ты — опытный поэт-наставник и литературный редактор.
Отвечай ТОЛЬКО в формате JSON. НЕ оборачивай JSON в markdown-блоки.
Ключи — camelCase. Ответ должен начинаться с { и заканчиваться }.`;

// ==================== Вспомогательные ====================

async function getApiConfig(): Promise<{ model: string; apiKey: string } | null> {
  const settings = await getSettings();
  if (!settings.apiProvider?.apiKey || !settings.apiProvider.model) {
    return null;
  }
  return {
    model: settings.apiProvider.model,
    apiKey: settings.apiProvider.apiKey,
  };
}

/**
 * Определить текущую строфу по позиции курсора в тексте.
 * Строфа = блок текста между пустыми строками.
 * Если есть выделение (selectionStart !== selectionEnd) — берём выделенный фрагмент
 * и расширяем до полных строф.
 */
export function getCurrentStanza(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { stanza: string; startIndex: number; endIndex: number } {
  if (!text.trim()) return { stanza: '', startIndex: 0, endIndex: 0 };

  // Если есть выделение — расширяем до полных строф
  if (selectionStart !== selectionEnd) {
    // Находим начало строфы, содержащей selectionStart
    let start = text.lastIndexOf('\n\n', selectionStart);
    start = start === -1 ? 0 : start + 2;

    // Находим конец строфы, содержащей selectionEnd
    let end = text.indexOf('\n\n', selectionEnd);
    end = end === -1 ? text.length : end;

    // Если выделение уже покрывает целую строфу (есть \n\n внутри выделения)
    if (text.substring(selectionStart, selectionEnd).includes('\n\n')) {
      start = selectionStart;
      end = selectionEnd;
    }

    return { stanza: text.substring(start, end).trim(), startIndex: start, endIndex: end };
  }

  // Нет выделения — определяем строфу по позиции курсора
  // Ищем ближайшие пустые строки
  let start = text.lastIndexOf('\n\n', selectionStart);
  start = start === -1 ? 0 : start + 2;

  let end = text.indexOf('\n\n', selectionStart);
  end = end === -1 ? text.length : end;

  return { stanza: text.substring(start, end).trim(), startIndex: start, endIndex: end };
}

// ==================== Промпты инструментов ====================

function generateDraftPrompt(context: string, style: string): string {
  return `Напиши стихотворение (4-8 строф), вдохновлённое следующим текстом/описанием:

«${context}»

Стиль: ${style || 'современная русская поэзия, свободный стиль'}.

Требования:
- Сохрани настроение и ключевые образы из вдохновения
- Используй указанный стиль
- Стихи должны звучать естественно и ритмично
- Верни ТОЛЬКО текст стихотворения, без заголовка и пояснений`;
}

function criticPrompt(text: string): string {
  return `Проанализируй следующий фрагмент стихотворения:

«${text}»

Ответь в формате JSON:
{
  "meter": "определённый или предполагаемый стихотворный размер (ямб, хорей, дактиль, амфибрахий, анапест, свободный)",
  "meterAnalysis": "краткий разбор: почему именно этот размер, какие отклонения есть",
  "rhymeAnalysis": "анализ рифм: точные/неточные, богатые/бедные, схема",
  "rhythmScore": 0-100,
  "rhymeScore": 0-100,
  "imageryScore": 0-100,
  "overallScore": 0-100,
  "strengths": ["что получилось хорошо (2-3 пункта)"],
  "weaknesses": ["что можно улучшить (2-3 пункта)"],
  "suggestions": ["конкретные советы по улучшению (2-3 пункта)"]
}`;
}

function rhymesPrompt(word: string, context: string): string {
  return `Подбери рифмы к слову «${word}» в контексте: ${context || 'общий'}.

Ответь в формате JSON:
{
  "exactRhymes": ["точная рифма 1", "точная рифма 2", "точная рифма 3", "точная рифма 4"],
  "approximateRhymes": ["неточная рифма 1", "неточная рифма 2", "неточная рифма 3"],
  "assonanceRhymes": ["ассонансная рифма 1", "ассонансная рифма 2"]
}`;
}

function rewriteStanzaPrompt(stanza: string, style: string, fullContext: string): string {
  return `Перепиши следующую строфу, сохранив её смысл, но улучшив форму.

Исходная строфа:
«${stanza}»

${style ? `Желаемый стиль: ${style}` : 'Стиль: сохрани текущий, но сделай ритм более ровным.'}

${fullContext ? `Контекст всего произведения (для сохранения связности):\n«${fullContext.substring(0, 500)}»` : ''}

Требования:
- Сохрани смысл и образы строфы
- Улучши ритм и звучание
- ${style ? 'Следуй указанному стилю' : 'Сделай более поэтичной'}
- Верни ТОЛЬКО переписанную строфу (4 строки или сколько было в оригинале)`;
}

function continuePrompt(fullText: string, style: string): string {
  // Берём последние 2-3 строфы как контекст для продолжения
  const stanzas = fullText.split(/\n\n+/).filter(s => s.trim());
  const recentStanzas = stanzas.slice(-3).join('\n\n');

  return `Продолжи стихотворение, написав следующую строфу.

Последние строфы:
«${recentStanzas}»

${style ? `Стиль: ${style}` : ''}

Требования:
- Продолжи по смыслу и настроению
- Сохрани ритм и размер (если есть)
- Напиши ОДНУ строфу (4-6 строк)
- Верни ТОЛЬКО текст новой строфы, без пояснений`;
}

function resizePrompt(text: string, action: 'shorter' | 'longer'): string {
  const actionText = action === 'shorter'
    ? 'Сократи текст, убрав лишнее, но сохрани смысл и лучшие строки. Сделай лаконичнее.'
    : 'Развёрни текст: добавь детали, образы, эмоции. Расширь без потери смысла.';

  return `${actionText}

Текст:
«${text}»

Верни ТОЛЬКО переработанный текст, без пояснений.`;
}

// ==================== Основной класс ====================

class WritingEngineClass {
  /**
   * Универсальный вызов LLM с текстовым ответом (не JSON).
   */
  private async callLLMText(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiConfig = await getApiConfig();
    if (!apiConfig) {
      throw new Error('Для использования инструментов нужен API-ключ. Настройте его в разделе «Настройки».');
    }

    const result = await llmRouter.chatCompletion(
      {
        model: apiConfig.model,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.8,
        maxTokens: 2048,
        responseFormat: 'text',
      },
      apiConfig.apiKey,
    );

    return result.content.trim();
  }

  /**
   * Вызов LLM с ожиданием JSON-ответа.
   */
  private async callLLMJson<T>(systemPrompt: string, userPrompt: string): Promise<T | null> {
    const apiConfig = await getApiConfig();
    if (!apiConfig) {
      throw new Error('Для использования инструментов нужен API-ключ. Настройте его в разделе «Настройки».');
    }

    const result = await llmRouter.chatCompletion(
      {
        model: apiConfig.model,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.5,
        maxTokens: 2048,
        responseFormat: 'json',
      },
      apiConfig.apiKey,
    );

    return parseLLMJson<T>(result.content);
  }

  /**
   * 1. Создать черновик — генерация стихов по контексту и стилю.
   */
  async generateDraft(context: string, style: string): Promise<WritingToolResult> {
    const text = await this.callLLMText(WRITING_SYSTEM_PROMPT, generateDraftPrompt(context, style));
    return { tool: 'generate', text };
  }

  /**
   * 2. Критик — анализ фрагмента стихов.
   */
  async criticize(text: string): Promise<WritingToolResult> {
    interface CriticResponse {
      [key: string]: unknown;
      meter?: string;
      meterAnalysis?: string;
      rhymeAnalysis?: string;
      rhythmScore?: number;
      rhymeScore?: number;
      imageryScore?: number;
      overallScore?: number;
      strengths?: string[];
      weaknesses?: string[];
      suggestions?: string[];
    }

    const parsed = await this.callLLMJson<CriticResponse>(
      WRITING_JSON_SYSTEM_PROMPT,
      criticPrompt(text),
    );

    if (!parsed) {
      return {
        tool: 'critic',
        text: 'Не удалось получить анализ от ИИ. Попробуйте ещё раз.',
      };
    }

    // Формируем текстовый отчёт
    const parts: string[] = [];

    if (parsed.meter) {
      parts.push(`**Размер:** ${parsed.meter}`);
    }
    if (parsed.meterAnalysis) {
      parts.push(parsed.meterAnalysis);
    }
    if (parsed.rhymeAnalysis) {
      parts.push(`**Рифмы:** ${parsed.rhymeAnalysis}`);
    }

    const scores = [
      parsed.rhythmScore != null ? `Ритм: ${parsed.rhythmScore}/100` : null,
      parsed.rhymeScore != null ? `Рифма: ${parsed.rhymeScore}/100` : null,
      parsed.imageryScore != null ? `Образность: ${parsed.imageryScore}/100` : null,
      parsed.overallScore != null ? `Общая: ${parsed.overallScore}/100` : null,
    ].filter(Boolean);
    if (scores.length) {
      parts.push(`**Оценки:** ${scores.join(' | ')}`);
    }

    if (parsed.strengths?.length) {
      parts.push(`**Сильные стороны:**\n${parsed.strengths.map(s => `• ${s}`).join('\n')}`);
    }
    if (parsed.weaknesses?.length) {
      parts.push(`**Что улучшить:**\n${parsed.weaknesses.map(s => `• ${s}`).join('\n')}`);
    }
    if (parsed.suggestions?.length) {
      parts.push(`**Советы:**\n${parsed.suggestions.map(s => `• ${s}`).join('\n')}`);
    }

    return {
      tool: 'critic',
      text: parts.join('\n\n'),
      meta: parsed,
    };
  }

  /**
   * 3. Подобрать рифмы к заданному слову.
   */
  async findRhymes(word: string, context: string): Promise<WritingToolResult> {
    interface RhymesResponse {
      [key: string]: unknown;
      exactRhymes?: string[];
      approximateRhymes?: string[];
      assonanceRhymes?: string[];
    }

    const parsed = await this.callLLMJson<RhymesResponse>(
      WRITING_JSON_SYSTEM_PROMPT,
      rhymesPrompt(word, context),
    );

    if (!parsed) {
      return { tool: 'rhymes', text: 'Не удалось подобрать рифмы. Попробуйте ещё раз.' };
    }

    const parts: string[] = [`Рифмы к слову **«${word}»**:`];

    if (parsed.exactRhymes?.length) {
      parts.push(`**Точные рифмы:** ${parsed.exactRhymes.join(', ')}`);
    }
    if (parsed.approximateRhymes?.length) {
      parts.push(`**Неточные рифмы:** ${parsed.approximateRhymes.join(', ')}`);
    }
    if (parsed.assonanceRhymes?.length) {
      parts.push(`**Ассонансы:** ${parsed.assonanceRhymes.join(', ')}`);
    }

    return {
      tool: 'rhymes',
      text: parts.join('\n'),
      meta: parsed,
    };
  }

  /**
   * 4. Перегенерировать строфу в заданном стиле.
   */
  async rewriteStanza(stanza: string, style: string, fullContext: string): Promise<WritingToolResult> {
    const text = await this.callLLMText(
      WRITING_SYSTEM_PROMPT,
      rewriteStanzaPrompt(stanza, style, fullContext),
    );
    return { tool: 'rewrite_stanza', text };
  }

  /**
   * 5. Продолжить стихотворение.
   */
  async continue(fullText: string, style: string): Promise<WritingToolResult> {
    const text = await this.callLLMText(
      WRITING_SYSTEM_PROMPT,
      continuePrompt(fullText, style),
    );
    return { tool: 'continue', text };
  }

  /**
   * 6. Сократить или развернуть фрагмент.
   */
  async resize(text: string, action: 'shorter' | 'longer'): Promise<WritingToolResult> {
    const result = await this.callLLMText(
      WRITING_SYSTEM_PROMPT,
      resizePrompt(text, action),
    );
    return { tool: 'resize', text: result };
  }
}

/** Глобальный экземпляр */
export const writingEngine = new WritingEngineClass();
