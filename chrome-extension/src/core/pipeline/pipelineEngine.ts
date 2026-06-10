/**
 * Основной движок пайплайна поэтической генерации.
 *
 * Последовательно запускает агентов: Концептолог → Формалист → Поэт ↔ Метрист → Редактор → Финальная проверка.
 * Поддерживает отмену, прогресс-коллбэки и итеративную доработку метрики.
 */

import { llmRouter } from '../../llm/router';
import { getSettings } from '../storage/settings';
import { parseLLMJson } from '../exercise/prompts';
import { analyzeLine } from '../analysis/meterDetector';
import { analyzePoemRhymes } from '../analysis/rhymeChecker';
import type {
  AgentLog,
  MetristReport,
  PipelineRunConfig,
  PipelineStatus,
  PipelineStepInfo,
  RhymeDetail,
  LineMeterDetail,
} from './types';
import { PIPELINE_AGENTS } from './types';
import type { AgentName } from './types';
import * as Prompts from './prompts';

// ==================== Типы для коллбэков ====================

type ProgressCallback = (
  status: PipelineStatus,
  steps: PipelineStepInfo[],
  logs: AgentLog[],
  currentPoem?: string,
) => void;

// ==================== Константы ====================

/** Порог для прохождения метрической проверки (было 60, повышено) */
const METER_PASS_THRESHOLD = 70;

// ==================== PipelineEngine ====================

class PipelineEngine {
  private logs: AgentLog[] = [];
  private status: PipelineStatus = 'idle';
  private steps: PipelineStepInfo[] = [];
  private cancelled = false;
  private onProgress: ProgressCallback | null = null;

  /** Установить коллбэк для обновления UI */
  setProgressCallback(cb: ProgressCallback) {
    this.onProgress = cb;
  }

  /** Отменить текущий запуск */
  cancel() {
    this.cancelled = true;
    this.status = 'cancelled';
    this.emitProgress();
  }

  getStatus() {
    return this.status;
  }

  getSteps() {
    return [...this.steps];
  }

  getLogs() {
    return [...this.logs];
  }

  private emitProgress(currentPoem?: string) {
    this.onProgress?.(this.status, this.steps, this.logs, currentPoem);
  }

  private updateStep(stepNumber: number, agent: AgentName, update: Partial<PipelineStepInfo>) {
    const idx = this.steps.findIndex(s => s.stepNumber === stepNumber);
    if (idx >= 0) {
      this.steps[idx] = { ...this.steps[idx], ...update };
    } else {
      this.steps.push({
        stepNumber,
        agent,
        label: PIPELINE_AGENTS.find(a => a.name === agent)?.label ?? agent,
        status: 'pending',
        ...update,
      });
    }
    this.emitProgress();
  }

  private addLog(log: AgentLog) {
    this.logs.push(log);
  }

  // ==================== LLM ====================

  private async callLLM(
    systemPrompt: string,
    userPrompt: string,
    responseFormat: 'text' | 'json' = 'text',
  ): Promise<{ content: string; tokens: { prompt: number; completion: number } }> {
    const settings = await getSettings();
    if (!settings.apiProvider?.model) {
      throw new Error('Настройте API-провайдера в настройках');
    }

    const result = await llmRouter.chatCompletion(
      {
        model: settings.apiProvider.model,
        systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: responseFormat === 'json' ? 0.5 : 0.8,
        maxTokens: 4096,
        responseFormat,
      },
      settings.apiProvider.apiKey,
    );

    return {
      content: result.content.trim(),
      tokens: { prompt: result.usage.inputTokens, completion: result.usage.outputTokens },
    };
  }

  // ==================== Утилиты ====================

  /** Извлечь текст стихотворения из ответа LLM (удалить markdown, заголовки и т.д.) */
  private extractPoem(text: string): string {
    let cleaned = text.trim();
    // Remove markdown code blocks
    cleaned = cleaned.replace(/^```[\s\S]*?```$/gm, '').trim();
    // Remove title lines (single line at the very beginning before blank line)
    cleaned = cleaned.replace(/^[^\n]{1,40}\n\n/, '');
    // Normalize whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  }

  // ==================== Метрист ====================

  /**
   * Запустить Метриста: программная проверка размера и рифм.
   *
   * Проверяет:
   * 1. Количество слогов в строке (tolerance ±1 от моды)
   * 2. Рифмопары в каждой строфе (точные/богатые = pass, ассонанс/нет = fail)
   *
   * НЕ использует confidence из meterDetector (зависит от stressDetector,
   * который несовершенен). Вместо этого считает только слоги и рифмы.
   */
  private runMetrist(poem: string, _targetMeter: string): MetristReport {
    const lines = poem.split('\n');

    // --- Разбиваем на строфы ---
    const stanzas: string[][] = [];
    const stanzaGlobalLines: number[][] = [];
    let currentStanza: string[] = [];
    let currentGlobalLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed === '') {
        if (currentStanza.length > 0) {
          stanzas.push(currentStanza);
          stanzaGlobalLines.push(currentGlobalLines);
          currentStanza = [];
          currentGlobalLines = [];
        }
      } else {
        currentStanza.push(trimmed);
        currentGlobalLines.push(i + 1);
      }
    }
    if (currentStanza.length > 0) {
      stanzas.push(currentStanza);
      stanzaGlobalLines.push(currentGlobalLines);
    }

    // --- Анализ каждой строки на количество слогов ---
    const lineDetails: LineMeterDetail[] = [];
    const syllableCounts: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;

      const analysis = analyzeLine(trimmed);

      lineDetails.push({
        lineNumber: i + 1,
        text: trimmed.length > 60 ? trimmed.substring(0, 60) + '…' : trimmed,
        syllableCount: analysis.totalSyllables,
        expectedSyllables: null,
        meter: analysis.meter?.meter ?? 'не определён',
        confidence: analysis.meter?.confidence ?? 0,
        ok: true, // будет перезаписано после расчёта моды
      });

      if (analysis.totalSyllables > 0) {
        syllableCounts.push(analysis.totalSyllables);
      }
    }

    // Определяем ожидаемое количество слогов (мода)
    let expectedSyllables = 0;
    if (syllableCounts.length > 0) {
      const modeMap = new Map<number, number>();
      for (const c of syllableCounts) {
        modeMap.set(c, (modeMap.get(c) ?? 0) + 1);
      }
      let maxCount = 0;
      for (const [count, freq] of modeMap) {
        if (freq > maxCount) {
          maxCount = freq;
          expectedSyllables = count;
        }
      }
    }

    // Обновляем expectedSyllables и ok для каждой строки
    // Проверяем ТОЛЬКО количество слогов (tolerance ±1)
    // Confidence НЕ используем — он зависит от stressDetector
    const meterErrors: string[] = [];
    let meterOkCount = 0;

    for (const detail of lineDetails) {
      detail.expectedSyllables = expectedSyllables > 0 ? expectedSyllables : null;

      const isOk = expectedSyllables === 0
        || detail.syllableCount === expectedSyllables
        || Math.abs(detail.syllableCount - expectedSyllables) <= 1;

      detail.ok = isOk;

      if (!isOk) {
        meterErrors.push(
          `Строка ${detail.lineNumber}: ${detail.syllableCount} слогов (ожидается ${expectedSyllables})`
        );
      }
      if (isOk) meterOkCount++;
    }

    const meterScore = lineDetails.length > 0
      ? Math.round((meterOkCount / lineDetails.length) * 100)
      : 0;

    // --- Анализ рифм по строфам ---
    const rhymeErrors: string[] = [];
    const rhymeDetails: RhymeDetail[] = [];
    let rhymeOkCount = 0;
    let totalRhymePairs = 0;

    const stanzaAnalyses = analyzePoemRhymes(stanzas);

    for (let sIdx = 0; sIdx < stanzaAnalyses.length; sIdx++) {
      const analysis = stanzaAnalyses[sIdx];
      const globalLines = stanzaGlobalLines[sIdx];
      if (stanzas[sIdx].length < 2) continue;

      const schemePairs = getSchemePairs(analysis.scheme, stanzas[sIdx].length);

      for (let pIdx = 0; pIdx < analysis.pairs.length; pIdx++) {
        const pair = analysis.pairs[pIdx];
        totalRhymePairs++;

        const ok = pair.type === 'exact' || pair.type === 'rich';
        if (!ok) {
          rhymeErrors.push(
            `Рифма «${pair.word1} / ${pair.word2}»: ${pair.type === 'assonance' ? 'ассонанс' : 'нет рифмы'}`
          );
        } else {
          rhymeOkCount++;
        }

        let line1 = globalLines[0] ?? pIdx * 2 + 1;
        let line2 = globalLines[1] ?? pIdx * 2 + 2;

        if (schemePairs.length > pIdx) {
          const [li, lj] = schemePairs[pIdx];
          line1 = globalLines[li] ?? line1;
          line2 = globalLines[lj] ?? line2;
        }

        rhymeDetails.push({
          word1: pair.word1,
          word2: pair.word2,
          type: pair.type,
          score: pair.score,
          ok,
          lineNumber1: line1,
          lineNumber2: line2,
        });
      }

      for (const issue of analysis.issues) {
        rhymeErrors.push(issue);
      }
    }

    const rhymeScore = totalRhymePairs > 0
      ? Math.round((rhymeOkCount / totalRhymePairs) * 100)
      : 50;

    return {
      meterScore,
      rhymeScore,
      meterErrors,
      rhymeErrors,
      lineDetails,
      rhymeDetails,
      overallScore: Math.round((meterScore + rhymeScore) / 2),
      passed: meterScore >= METER_PASS_THRESHOLD && rhymeScore >= METER_PASS_THRESHOLD,
    };
  }

  // ==================== Основной запуск ====================

  /**
   * Запустить полный пайплайн.
   *
   * Последовательность: Концептолог → Формалист → [Поэт ↔ Метрист] × N → Редактор → Финальная проверка
   *
   * @returns финальный текст стихотворения
   */
  async run(config: PipelineRunConfig): Promise<string> {
    this.logs = [];
    this.steps = [];
    this.cancelled = false;
    this.status = 'running';

    let currentPoem = '';
    let lastMetristReport: MetristReport | undefined;

    try {
      // ===== Step 1: Conceptologist =====
      if (this.cancelled) throw new Error('cancelled');
      this.updateStep(1, 'conceptologist', { status: 'running' });

      const step1Start = Date.now();
      const step1Result = await this.callLLM(
        Prompts.CONCEPTOLOGIST_SYSTEM,
        Prompts.conceptologistPrompt(config.topic, config.style),
        'json',
      );
      this.addLog({
        agent: 'conceptologist',
        stepNumber: 1,
        prompt: Prompts.CONCEPTOLOGIST_SYSTEM,
        input: Prompts.conceptologistPrompt(config.topic, config.style),
        output: step1Result.content,
        durationMs: Date.now() - step1Start,
        tokens: step1Result.tokens,
      });
      this.updateStep(1, 'conceptologist', { status: 'completed' });
      const conceptsRaw = step1Result.content;
      const conceptsParsed = parseLLMJson<Record<string, unknown>>(conceptsRaw);
      if (!conceptsParsed) {
        console.warn('[Pipeline:conceptologist] Не удалось распарсить JSON-ответ');
      }

      // ===== Step 2: Formalist =====
      if (this.cancelled) throw new Error('cancelled');
      this.updateStep(2, 'formalist', { status: 'running' });

      const step2Start = Date.now();
      const step2Result = await this.callLLM(
        Prompts.FORMALIST_SYSTEM,
        Prompts.formalistPrompt(conceptsRaw, config.meter, config.stanzaCount, config.rhymeScheme),
        'json',
      );
      this.addLog({
        agent: 'formalist',
        stepNumber: 2,
        prompt: Prompts.FORMALIST_SYSTEM,
        input: Prompts.formalistPrompt(conceptsRaw, config.meter, config.stanzaCount, config.rhymeScheme),
        output: step2Result.content,
        durationMs: Date.now() - step2Start,
        tokens: step2Result.tokens,
      });
      this.updateStep(2, 'formalist', { status: 'completed' });
      const formalDataRaw = step2Result.content;
      const formalParsed = parseLLMJson<Record<string, unknown>>(formalDataRaw);
      if (!formalParsed) {
        console.warn('[Pipeline:formalist] Не удалось распарсить JSON-ответ');
      }

      // ===== Steps 3-4: Poet ↔ Metrist loop =====
      let corrections: string | undefined;
      const maxIter = config.maxIterations || 3;

      for (let iteration = 1; iteration <= maxIter; iteration++) {
        if (this.cancelled) throw new Error('cancelled');

        // Step 3: Poet
        this.updateStep(3, 'poet', { status: 'running', iteration });
        const step3Start = Date.now();
        const step3Result = await this.callLLM(
          Prompts.POET_SYSTEM,
          Prompts.poetPrompt(conceptsRaw, formalDataRaw, config.style, corrections),
          'text',
        );
        this.addLog({
          agent: 'poet',
          stepNumber: 3,
          iteration,
          prompt: Prompts.POET_SYSTEM,
          input: Prompts.poetPrompt(conceptsRaw, formalDataRaw, config.style, corrections),
          output: step3Result.content,
          durationMs: Date.now() - step3Start,
          tokens: step3Result.tokens,
        });
        this.updateStep(3, 'poet', { status: 'completed', iteration });
        currentPoem = this.extractPoem(step3Result.content);
        this.emitProgress(currentPoem);

        // Step 4: Metrist (programmatic)
        if (this.cancelled) throw new Error('cancelled');
        this.updateStep(4, 'metrist', { status: 'running', iteration });
        const step4Start = Date.now();
        const report = this.runMetrist(currentPoem, config.meter);
        lastMetristReport = report;

        this.addLog({
          agent: 'metrist',
          stepNumber: 4,
          iteration,
          prompt: '[программная проверка]',
          input: currentPoem,
          output: this.formatMetristReport(report),
          durationMs: Date.now() - step4Start,
          metristReport: report,
        });
        this.updateStep(4, 'metrist', { status: 'completed', iteration });

        // Прерываем цикл если passed или достигли max итераций
        if (report.passed || iteration >= maxIter) {
          break;
        }

        // Generate corrections for next iteration
        corrections = this.formatCorrections(report);
      }

      // ===== Step 5: Editor =====
      if (this.cancelled) throw new Error('cancelled');
      this.updateStep(5, 'editor', { status: 'running' });

      const step5Start = Date.now();
      // Передаём отчёт Метриста в Редактор!
      const metristContext = lastMetristReport
        ? `\n\nОТЧЁТ МЕТРИСТА (учти при редактировании):\n${this.formatMetristReport(lastMetristReport)}`
        : '';

      const step5Result = await this.callLLM(
        Prompts.EDITOR_SYSTEM,
        Prompts.editorPrompt(currentPoem, conceptsRaw) + metristContext,
        'text',
      );
      this.addLog({
        agent: 'editor',
        stepNumber: 5,
        prompt: Prompts.EDITOR_SYSTEM,
        input: Prompts.editorPrompt(currentPoem, conceptsRaw) + metristContext,
        output: step5Result.content,
        durationMs: Date.now() - step5Start,
        tokens: step5Result.tokens,
      });
      this.updateStep(5, 'editor', { status: 'completed' });
      currentPoem = this.extractPoem(step5Result.content);
      this.emitProgress(currentPoem);

      // ===== Step 6: Final check =====
      if (this.cancelled) throw new Error('cancelled');
      this.updateStep(6, 'final_check', { status: 'running' });

      // Run metrist again for final report
      const finalReport = this.runMetrist(currentPoem, config.meter);

      const step6Start = Date.now();
      const step6Result = await this.callLLM(
        Prompts.FINAL_CHECK_SYSTEM,
        Prompts.finalCheckPrompt(currentPoem, this.formatMetristReport(finalReport)),
        'json',
      );
      this.addLog({
        agent: 'final_check',
        stepNumber: 6,
        prompt: Prompts.FINAL_CHECK_SYSTEM,
        input: Prompts.finalCheckPrompt(currentPoem, this.formatMetristReport(finalReport)),
        output: step6Result.content,
        durationMs: Date.now() - step6Start,
        tokens: step6Result.tokens,
        metristReport: finalReport,
      });
      this.updateStep(6, 'final_check', { status: 'completed' });

      this.status = 'completed';
      this.emitProgress(currentPoem);

      return currentPoem;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'cancelled') {
        this.status = 'cancelled';
        this.emitProgress(currentPoem);
        return currentPoem;
      }

      this.status = 'error';
      this.addLog({
        agent: 'system',
        stepNumber: 0,
        prompt: '',
        input: '',
        output: '',
        durationMs: 0,
        error: e instanceof Error ? e.message : String(e),
      });
      this.emitProgress(currentPoem);
      throw e;
    }
  }

  // ==================== Форматирование отчётов ====================

  /** Форматировать отчёт Метриста как текст для контекста LLM */
  private formatMetristReport(report: MetristReport): string {
    const parts: string[] = [];
    parts.push(`Размер: ${report.meterScore}/100 (${report.meterErrors.length} ошибок)`);
    parts.push(`Рифмы: ${report.rhymeScore}/100 (${report.rhymeErrors.length} ошибок)`);
    parts.push(`Итого: ${report.overallScore}/100`);
    if (report.meterErrors.length > 0) {
      parts.push(`Ошибки размера: ${report.meterErrors.join('; ')}`);
    }
    if (report.rhymeErrors.length > 0) {
      parts.push(`Ошибки рифм: ${report.rhymeErrors.join('; ')}`);
    }
    return parts.join('\n');
  }

  /** Форматировать правки от Метриста для следующей итерации Поэта */
  private formatCorrections(report: MetristReport): string {
    const parts: string[] = [];
    if (report.meterErrors.length > 0) {
      parts.push('ИСПРАВИ РАЗМЕР:');
      for (const err of report.meterErrors) {
        parts.push(`- ${err}`);
      }
    }
    if (report.rhymeErrors.length > 0) {
      parts.push('ИСПРАВИ РИФМЫ:');
      for (const err of report.rhymeErrors) {
        parts.push(`- ${err}`);
      }
    }
    return parts.join('\n');
  }
}

// ==================== Вспомогательные функции ====================

/**
 * Извлечь пары индексов строк из схемы рифмовки.
 */
function getSchemePairs(scheme: string, lineCount: number): [number, number][] {
  const pairs: [number, number][] = [];
  if (!scheme || lineCount < 2) return pairs;

  const letterPositions: Map<string, number[]> = new Map();
  for (let i = 0; i < scheme.length && i < lineCount; i++) {
    const letter = scheme[i];
    if (!letterPositions.has(letter)) {
      letterPositions.set(letter, []);
    }
    letterPositions.get(letter)!.push(i);
  }

  for (const positions of letterPositions.values()) {
    for (let i = 0; i + 1 < positions.length; i += 2) {
      pairs.push([positions[i], positions[i + 1]]);
    }
  }

  return pairs;
}

/** Глобальный экземпляр пайплайн-движка */
export const pipelineEngine = new PipelineEngine();
