import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { pipelineEngine } from '../core/pipeline/pipelineEngine';
import type {
  AgentName,
  PipelineRunConfig,
  PipelineStatus,
  PipelineStepInfo,
  AgentLog,
  MetristReport,
} from '../core/pipeline/types';
import { PIPELINE_AGENTS } from '../core/pipeline/types';
import { db } from '../core/storage/db';
import type { PipelineRun } from '../core/types';

// ==================== Константы ====================

const METER_OPTIONS = ['авто', 'Ямб', 'Хорей', 'Дактиль', 'Амфибрахий', 'Анапест', 'Дольник'];
const RHYME_OPTIONS = ['АБАБ', 'ААББ', 'АББА', 'ААА'];
const STYLE_OPTIONS = [
  'современная русская поэзия',
  'классическая',
  'элегия',
  'сатира',
  'романтическая',
  'акмеизм',
  'футуризм',
  'имажинизм',
];

// ==================== Вспомогательные компоненты ====================

/** Круг с индикатором статуса шага */
function StepCircle({
  status,
  label,
  isHighlighted,
  onClick,
}: {
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped' | 'edited';
  label: string;
  isHighlighted: boolean;
  onClick?: () => void;
}) {
  const baseClasses = 'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 flex-shrink-0';

  const statusStyles: Record<string, string> = {
    pending: 'bg-dusk/10 text-dusk/40 border-2 border-dusk/20',
    running: 'bg-ember/20 text-ember border-2 border-ember animate-pulse',
    completed: 'bg-sage text-white border-2 border-sage',
    error: 'bg-ember text-white border-2 border-ember',
    skipped: 'bg-dusk/10 text-dusk/30 border-2 border-dusk/10 line-through',
    edited: 'bg-gold/20 text-gold border-2 border-gold',
  };

  const statusIcons: Record<string, string> = {
    pending: '○',
    running: '⟳',
    completed: '✓',
    error: '✗',
    skipped: '–',
    edited: '✎',
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        className={`${baseClasses} ${statusStyles[status] ?? statusStyles.pending} ${
          isHighlighted && status !== 'completed' ? 'ring-2 ring-ember/40 ring-offset-2' : ''
        } ${onClick ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
        title={label}
      >
        {status === 'running' ? (
          <span className="animate-spin inline-block">{statusIcons.running}</span>
        ) : (
          statusIcons[status]
        )}
      </button>
      <span
        className={`text-xs text-center leading-tight max-w-[72px] ${
          isHighlighted ? 'text-ember font-semibold' : 'text-dusk/60'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/** Линия-соединитель между шагами */
function StepConnector({ active }: { active: boolean }) {
  return (
    <div
      className={`flex-1 h-0.5 rounded-full mx-1 min-w-[12px] max-w-[48px] transition-colors duration-500 ${
        active ? 'bg-ember' : 'bg-dusk/15'
      }`}
    />
  );
}

/** Оценочная полоска (score bar) */
function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color =
    value >= 60 ? 'bg-sage' : value >= 40 ? 'bg-gold' : 'bg-ember';
  const textColor =
    value >= 60 ? 'text-sage' : value >= 40 ? 'text-gold' : 'text-ember';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-dusk/70">{label}</span>
        <span className={`text-sm font-semibold ${textColor}`}>{value}/{max}</span>
      </div>
      <div className="progress-bar">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Отчёт Метриста — цветные баллы */
function MetristScores({ report }: { report: MetristReport }) {
  return (
    <div className="space-y-2 mt-2">
      <ScoreBar label="Размер (meter)" value={report.meterScore} />
      <ScoreBar label="Рифмы (rhyme)" value={report.rhymeScore} />
      <ScoreBar label="Общая оценка" value={report.overallScore} />
      {report.meterErrors.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-dusk/60">Ошибки размера:</p>
          {report.meterErrors.map((err, i) => (
            <p key={i} className="text-xs text-ember/80">• {err}</p>
          ))}
        </div>
      )}
      {report.rhymeErrors.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-dusk/60">Ошибки рифм:</p>
          {report.rhymeErrors.map((err, i) => (
            <p key={i} className="text-xs text-ember/80">• {err}</p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Раскрываемый блок промпта или ответа */
function CollapsibleBlock({
  title,
  content,
  isOpen,
  onToggle,
}: {
  title: string;
  content: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-dusk/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-dusk/70
          hover:bg-dusk/5 transition-colors"
      >
        <span>{title}</span>
        <span className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {isOpen && (
        <div className="px-3 py-2 bg-dusk/3 border-t border-dusk/5">
          <pre className="text-xs text-dusk/80 whitespace-pre-wrap break-words leading-relaxed font-sans">
            {content.length > 2000 ? content.slice(0, 2000) + '\n… (обрезано)' : content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ==================== Основной компонент ====================

export default function PipelineScreen() {
  const navigate = useNavigate();
  const runIdRef = useRef<string | null>(null);

  // --- Основное состояние ---
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [steps, setSteps] = useState<PipelineStepInfo[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [currentPoem, setCurrentPoem] = useState('');
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [expandedLogSection, setExpandedLogSection] = useState<string | null>(null);
  const [showPoem, setShowPoem] = useState(false);
  const [history, setHistory] = useState<PipelineRun[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // --- Конфигурация ---
  const [config, setConfig] = useState<PipelineRunConfig>({
    topic: '',
    style: 'современная русская поэзия',
    meter: 'авто',
    rhymeScheme: 'АБАБ',
    stanzaCount: 4,
    maxIterations: 3,
  });

  // --- Прогресс-коллбэк ---
  useEffect(() => {
    pipelineEngine.setProgressCallback((newStatus, newSteps, newLogs, poem) => {
      setStatus(newStatus);
      setSteps([...newSteps]);
      setLogs([...newLogs]);
      if (poem) {
        setCurrentPoem(poem);
        setShowPoem(true);
      }
    });
    return () => pipelineEngine.setProgressCallback(() => {});
  }, []);

  // --- Загрузка истории ---
  const loadHistory = useCallback(async () => {
    try {
      const runs = await db.pipelineRuns
        .orderBy('createdAt')
        .reverse()
        .limit(10)
        .toArray();
      setHistory(runs);
    } catch {
      // Таблица может быть ещё не инициализирована
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // --- Получить логи по номеру шага ---
  const getLogsForStep = useCallback(
    (stepNumber: number) => {
      return logs.filter((log) => log.stepNumber === stepNumber);
    },
    [logs],
  );

  // --- Получить информацио агента по имени ---
  const getAgentInfo = useCallback(
    (agentName: string) => {
      return PIPELINE_AGENTS.find((a) => a.name === agentName);
    },
    [],
  );

  // --- Определить, запущен ли шаг сейчас ---
  const currentRunningStep = steps.find((s) => s.status === 'running');

  // --- Запуск пайплайна ---
  const handleStart = useCallback(async () => {
    if (!config.topic.trim()) return;

    setStatus('running');
    setSteps([]);
    setLogs([]);
    setCurrentPoem('');
    setShowPoem(false);
    setExpandedStep(null);
    setExpandedLogSection(null);

    // Создаём запись в IndexedDB
    const runId = crypto.randomUUID ? crypto.randomUUID() : `run_${Date.now()}`;
    runIdRef.current = runId;

    try {
      await db.pipelineRuns.add({
        id: runId,
        createdAt: Date.now(),
        config: {
          topic: config.topic,
          style: config.style,
          meter: config.meter,
          stanzaCount: config.stanzaCount,
          provider: '',
          maxIterations: config.maxIterations,
        },
        status: 'running',
      });

      const finalPoem = await pipelineEngine.run(config);

      // Сохраняем финальные результаты
      const finalStatus = pipelineEngine.getStatus();
      const finalLogs = pipelineEngine.getLogs();
      // Ищем последний отчёт Метриста
      const lastMetristLog = [...finalLogs].reverse().find((l) => l.agent === 'metrist' && l.metristReport);

      await db.pipelineRuns.update(runId, {
        status: finalStatus === 'completed' ? 'completed' : finalStatus === 'cancelled' ? 'cancelled' : 'error',
        resultPoem: finalPoem,
        finalScore: lastMetristLog?.metristReport
          ? {
              meterScore: lastMetristLog.metristReport.meterScore,
              rhymeScore: lastMetristLog.metristReport.rhymeScore,
              styleScore: lastMetristLog.metristReport.overallScore,
            }
          : undefined,
      });

      // Сохраняем шаги
      for (const log of finalLogs) {
        const agentInfo = getAgentInfo(log.agent);
        await db.pipelineSteps.add({
          runId,
          stepNumber: log.stepNumber,
          agentName: log.agent,
          agentLabel: agentInfo?.label ?? log.agent,
          status: log.error ? 'error' : 'completed',
          prompt: log.prompt,
          input: log.input,
          output: log.output,
          tokens: log.tokens,
          durationMs: log.durationMs,
          iteration: log.iteration,
          metadata: log.metristReport
            ? {
                meterErrors: log.metristReport.meterErrors,
                rhymeErrors: log.metristReport.rhymeErrors,
                meterScore: log.metristReport.meterScore,
                rhymeScore: log.metristReport.rhymeScore,
              }
            : undefined,
          error: log.error,
        });
      }

      await loadHistory();
    } catch (err) {
      console.error('[PipelineScreen] Ошибка запуска:', err);
      if (runIdRef.current) {
        try {
          await db.pipelineRuns.update(runIdRef.current, { status: 'error' });
        } catch {
          // ignore
        }
      }
    }
  }, [config, getAgentInfo, loadHistory]);

  // --- Отмена ---
  const handleCancel = useCallback(() => {
    pipelineEngine.cancel();
  }, []);

  // --- Сброс для нового запуска ---
  const handleNewRun = useCallback(() => {
    setStatus('configuring');
    setSteps([]);
    setLogs([]);
    setCurrentPoem('');
    setShowPoem(false);
    setExpandedStep(null);
    setExpandedLogSection(null);
    runIdRef.current = null;
  }, []);

  // --- Сохранить стих в «Мои стихи» ---
  const handleSavePoem = useCallback(async () => {
    if (!currentPoem.trim()) return;

    try {
      await db.poems.add({
        id: crypto.randomUUID ? crypto.randomUUID() : `poem_${Date.now()}`,
        title: config.topic.slice(0, 60),
        content: currentPoem.trim(),
        tags: ['pipeline', config.style],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDraft: false,
      });
      alert('Стихотворение сохранено в «Мои стихи»!');
    } catch {
      alert('Не удалось сохранить стихотворение');
    }
  }, [currentPoem, config.style, config.topic]);

  // --- Экспорт лога ---
  const handleExportLog = useCallback(() => {
    const lines: string[] = [];
    lines.push('═══ Лог поэтического пайплайна ═══');
    lines.push(`Тема: ${config.topic}`);
    lines.push(`Стиль: ${config.style}`);
    lines.push(`Размер: ${config.meter}`);
    lines.push(`Рифмовка: ${config.rhymeScheme}`);
    lines.push(`Строф: ${config.stanzaCount}`);
    lines.push(`Итераций: ${config.maxIterations}`);
    lines.push('');

    for (const log of logs) {
      const agentInfo = getAgentInfo(log.agent);
      lines.push(`──── Шаг ${log.stepNumber}: ${agentInfo?.label ?? log.agent} ${log.iteration ? `(итерация ${log.iteration})` : ''} ────`);
      lines.push(`Длительность: ${log.durationMs} мс`);
      if (log.tokens) {
        lines.push(`Токены: ${log.tokens.prompt} prompt / ${log.tokens.completion} completion`);
      }
      lines.push('');
      if (log.error) {
        lines.push(`ОШИБКА: ${log.error}`);
        lines.push('');
      }
      lines.push('--- Промпт (система) ---');
      lines.push(log.prompt);
      lines.push('');
      lines.push('--- Вход ---');
      lines.push(log.input);
      lines.push('');
      lines.push('--- Ответ ---');
      lines.push(log.output);
      lines.push('');
      if (log.metristReport) {
        lines.push('--- Отчёт Метриста ---');
        lines.push(`Размер: ${log.metristReport.meterScore}/100`);
        lines.push(`Рифмы: ${log.metristReport.rhymeScore}/100`);
        lines.push(`Общее: ${log.metristReport.overallScore}/100`);
        if (log.metristReport.meterErrors.length > 0) {
          lines.push(`Ошибки размера: ${log.metristReport.meterErrors.join('; ')}`);
        }
        if (log.metristReport.rhymeErrors.length > 0) {
          lines.push(`Ошибки рифм: ${log.metristReport.rhymeErrors.join('; ')}`);
        }
        lines.push('');
      }
    }

    if (currentPoem) {
      lines.push('═══ Финальное стихотворение ═══');
      lines.push(currentPoem);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-log-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs, currentPoem, config, getAgentInfo]);

  // --- Показать лог из истории ---
  const handleShowHistoryLog = useCallback(async (runId: string) => {
    if (expandedHistoryId === runId) {
      setExpandedHistoryId(null);
      return;
    }

    setExpandedHistoryId(runId);

    try {
      // Загружаем существующую запись
      const existingRun = await db.pipelineRuns.get(runId);
      if (existingRun?.resultPoem) {
        setCurrentPoem(existingRun.resultPoem);
        setShowPoem(true);
      }
    } catch {
      // ignore
    }
  }, [expandedHistoryId]);

  // --- Финальные баллы ---
  const finalScores = (() => {
    const lastMetristLog = [...logs].reverse().find((l) => l.agent === 'metrist' && l.metristReport);
    const lastCheckLog = [...logs].reverse().find((l) => l.agent === 'final_check');
    return {
      meter: lastMetristLog?.metristReport?.meterScore ?? 0,
      rhyme: lastMetristLog?.metristReport?.rhymeScore ?? 0,
      overall: lastMetristLog?.metristReport?.overallScore ?? 0,
      review: lastCheckLog?.output ?? '',
    };
  })();

  const isIdle = status === 'idle' || status === 'configuring';
  const isRunning = status === 'running';
  const isFinished = status === 'completed' || status === 'error' || status === 'cancelled';

  return (
    <div className="screen-container">
      {/* ═══════════════ Шапка ═══════════════ */}
      <header className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-full bg-dusk/10 flex items-center justify-center
            hover:bg-dusk/20 transition-colors text-dusk flex-shrink-0"
          aria-label="Назад"
        >
          ←
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink">Поэтический Пайплайн</h1>
          <p className="text-sm text-dusk/60 mt-0.5">
            Исследовательский и образовательный инструмент: создание стихов с прозрачным процессом
          </p>
        </div>
      </header>

      {/* ═══════════════ Панель конфигурации ═══════════════ */}
      {isIdle && (
        <section className="card mb-6">
          <h2 className="section-title mb-4 text-lg">Настройки пайплайна</h2>

          {/* Тема */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink mb-1.5">
              Тема / контекст <span className="text-ember">*</span>
            </label>
            <textarea
              value={config.topic}
              onChange={(e) => setConfig((c) => ({ ...c, topic: e.target.value }))}
              placeholder="Новостной текст, тема, образ или ситуация для стихотворения…"
              rows={3}
              className="input-field resize-none"
            />
          </div>

          {/* Стиль */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink mb-1.5">Стиль</label>
            <select
              value={config.style}
              onChange={(e) => setConfig((c) => ({ ...c, style: e.target.value }))}
              className="input-field appearance-none"
            >
              {STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Размер */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink mb-1.5">Размер</label>
            <select
              value={config.meter}
              onChange={(e) => setConfig((c) => ({ ...c, meter: e.target.value }))}
              className="input-field appearance-none"
            >
              {METER_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Рифмовка и строфы — в одну строку на десктопе */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Схема рифмовки</label>
              <select
                value={config.rhymeScheme}
                onChange={(e) => setConfig((c) => ({ ...c, rhymeScheme: e.target.value }))}
                className="input-field appearance-none"
              >
                {RHYME_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Количество строф</label>
              <input
                type="number"
                min={2}
                max={8}
                value={config.stanzaCount}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    stanzaCount: Math.min(8, Math.max(2, parseInt(e.target.value) || 4)),
                  }))
                }
                className="input-field"
              />
            </div>
          </div>

          {/* Итерации */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-ink mb-1.5">
              Макс. итераций правки метрики
            </label>
            <input
              type="number"
              min={1}
              max={5}
              value={config.maxIterations}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  maxIterations: Math.min(5, Math.max(1, parseInt(e.target.value) || 3)),
                }))
              }
              className="input-field max-w-[120px]"
            />
            <p className="text-xs text-dusk/40 mt-1">
              Сколько раз Поэт и Метрист будут дорабатывать ритм и рифмы
            </p>
          </div>

          {/* Кнопка запуска */}
          <button
            type="button"
            onClick={handleStart}
            disabled={!config.topic.trim()}
            className="btn-primary w-full text-lg py-4 disabled:opacity-40"
          >
            Запустить пайплайн
          </button>
        </section>
      )}

      {/* ═══════════════ Визуализация пайплайна ═══════════════ */}
      {(isRunning || isFinished) && steps.length > 0 && (
        <section className="card mb-6">
          <h2 className="section-title mb-4 text-lg">Прогресс</h2>

          {/* Горизонтальная цепочка шагов */}
          <div className="flex items-center justify-center gap-0 mb-6 overflow-x-auto pb-2">
            {PIPELINE_AGENTS.map((agent, idx) => {
              const stepInfo = steps.find(
                (s) => s.agent === agent.name && s.status !== 'pending',
              ) ?? { stepNumber: idx + 1, agent: agent.name as AgentName, label: agent.label, status: 'pending' as const };

              const isHighlighted =
                currentRunningStep?.stepNumber === stepInfo.stepNumber;

              return (
                <div key={agent.name} className="flex items-center">
                  {idx > 0 && (
                    <StepConnector
                      active={
                        steps.some(
                          (s) => s.agent === PIPELINE_AGENTS[idx - 1].name && s.status === 'completed',
                        )
                      }
                    />
                  )}
                  <StepCircle
                    status={stepInfo.status}
                    label={agent.label}
                    isHighlighted={isHighlighted}
                    onClick={
                      stepInfo.status === 'completed' || stepInfo.status === 'error'
                        ? () => {
                            setExpandedStep(
                              expandedStep === stepInfo.stepNumber ? null : stepInfo.stepNumber,
                            );
                            setExpandedLogSection(null);
                          }
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* Статус текст */}
          {isRunning && currentRunningStep && (
            <div className="text-center mb-4">
              <span className="text-sm text-dusk/60">
                Работает:{' '}
                <span className="font-semibold text-ember">
                  {getAgentInfo(currentRunningStep.agent)?.label ?? currentRunningStep.agent}
                </span>
                {currentRunningStep.iteration && (
                  <span className="text-dusk/40"> (итерация {currentRunningStep.iteration})</span>
                )}
              </span>
            </div>
          )}

          {/* Кнопка отмены */}
          {isRunning && (
            <div className="flex justify-center">
              <button type="button" onClick={handleCancel} className="btn-secondary text-sm px-6 py-2">
                Отменить
              </button>
            </div>
          )}

          {/* Развернутые детали шага */}
          {expandedStep !== null && (
            <div className="mt-6 border-t border-dusk/10 pt-4 space-y-4">
              {getLogsForStep(expandedStep).map((log, logIdx) => {
                const agentInfo = getAgentInfo(log.agent);
                return (
                  <div key={`${log.stepNumber}-${logIdx}`} className="space-y-3">
                    {/* Имя агента + длительность */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink text-sm">
                          {agentInfo?.label ?? log.agent}
                        </span>
                        {log.iteration && (
                          <span className="badge text-xs">ит. {log.iteration}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-dusk/50">
                        <span>{log.durationMs} мс</span>
                        {log.tokens && (
                          <span>
                            {log.tokens.prompt + log.tokens.completion} токенов
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Образовательная заметка */}
                    {agentInfo?.educationalNote && (
                      <div className="bg-gold/5 border border-gold/20 rounded-lg px-3 py-2">
                        <p className="text-xs text-dusk/70 leading-relaxed">
                          💡 {agentInfo.educationalNote}
                        </p>
                      </div>
                    )}

                    {/* Ошибка */}
                    {log.error && (
                      <div className="bg-ember/10 border border-ember/20 rounded-lg px-3 py-2">
                        <p className="text-xs text-ember">⚠ {log.error}</p>
                      </div>
                    )}

                    {/* Промпт */}
                    {log.prompt && (
                      <CollapsibleBlock
                        title="Промпт (система)"
                        content={log.prompt}
                        isOpen={expandedLogSection === 'prompt'}
                        onToggle={() =>
                          setExpandedLogSection(expandedLogSection === 'prompt' ? null : 'prompt')
                        }
                      />
                    )}

                    {/* Вход */}
                    {log.input && (
                      <CollapsibleBlock
                        title="Входные данные"
                        content={log.input}
                        isOpen={expandedLogSection === 'input'}
                        onToggle={() =>
                          setExpandedLogSection(expandedLogSection === 'input' ? null : 'input')
                        }
                      />
                    )}

                    {/* Ответ */}
                    {log.output && (
                      <CollapsibleBlock
                        title="Ответ"
                        content={log.output}
                        isOpen={expandedLogSection === 'response'}
                        onToggle={() =>
                          setExpandedLogSection(
                            expandedLogSection === 'response' ? null : 'response',
                          )
                        }
                      />
                    )}

                    {/* Отчёт Метриста */}
                    {log.metristReport && <MetristScores report={log.metristReport} />}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ═══════════════ Предпросмотр стиха ═══════════════ */}
      {showPoem && currentPoem && (
        <section className="card mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title text-lg mb-0">
              {status === 'completed' ? 'Финальное стихотворение' : 'Текущая версия'}
            </h2>
            <button
              type="button"
              onClick={() => setShowPoem((v) => !v)}
              className="text-xs text-dusk/50 hover:text-dusk/70 transition-colors"
            >
              {showPoem ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          <div
            className={`bg-parchment/80 rounded-lg p-5 border border-dusk/10 ${
              status === 'completed' ? 'ring-2 ring-gold/30' : ''
            }`}
          >
            <pre className="whitespace-pre-wrap font-serif text-ink leading-relaxed text-base">
              {currentPoem}
            </pre>
          </div>
        </section>
      )}

      {/* ═══════════════ Финальные результаты ═══════════════ */}
      {status === 'completed' && currentPoem && (
        <section className="card mb-6">
          <h2 className="section-title mb-4 text-lg">Результаты</h2>

          {/* Баллы */}
          <div className="space-y-3 mb-6">
            <ScoreBar label="Размер (meter)" value={finalScores.meter} />
            <ScoreBar label="Рифмы (rhyme)" value={finalScores.rhyme} />
            <ScoreBar label="Общая оценка" value={finalScores.overall} />
          </div>

          {/* Финальный обзор LLM */}
          {finalScores.review && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-ink mb-2">Обзор финальной проверки</h3>
              <div className="bg-dusk/5 rounded-lg p-3 border border-dusk/10">
                <pre className="text-sm text-dusk/80 whitespace-pre-wrap break-words leading-relaxed font-sans">
                  {finalScores.review.length > 1500
                    ? finalScores.review.slice(0, 1500) + '…'
                    : finalScores.review}
                </pre>
              </div>
            </div>
          )}

          {/* Кнопки действий */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={handleSavePoem} className="btn-primary py-3">
              Сохранить в Мои стихи
            </button>
            <button type="button" onClick={handleNewRun} className="btn-secondary py-3">
              Новый запуск
            </button>
          </div>
          <button
            type="button"
            onClick={handleExportLog}
            className="btn-secondary w-full mt-3 text-sm py-2 text-dusk/60"
          >
            Экспорт лога (.txt)
          </button>
        </section>
      )}

      {/* ═══════════════ Сообщения об ошибке / отмене ═══════════════ */}
      {status === 'error' && (
        <section className="card mb-6 border-ember/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">⚠</span>
            <h2 className="section-title text-lg mb-0 text-ember">Ошибка</h2>
          </div>
          <p className="text-sm text-dusk/70 mb-4">
            Произошла ошибка при выполнении пайплайна. Подробности смотрите в логах шагов выше.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={handleNewRun} className="btn-primary py-3">
              Новый запуск
            </button>
            {currentPoem && (
              <button type="button" onClick={handleExportLog} className="btn-secondary py-3">
                Экспорт лога (.txt)
              </button>
            )}
          </div>
        </section>
      )}

      {status === 'cancelled' && (
        <section className="card mb-6 border-gold/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">⏹</span>
            <h2 className="section-title text-lg mb-0">Запуск отменён</h2>
          </div>
          <p className="text-sm text-dusk/70 mb-4">
            Пайплайн был остановлен пользователем.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={handleNewRun} className="btn-primary py-3">
              Новый запуск
            </button>
            {currentPoem && (
              <button type="button" onClick={handleExportLog} className="btn-secondary py-3">
                Экспорт лога (.txt)
              </button>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════ Описание шагов (только в idle) ═══════════════ */}
      {isIdle && (
        <section className="card mb-6">
          <h2 className="section-title mb-4 text-lg">Этапы пайплайна</h2>
          <div className="space-y-3">
            {PIPELINE_AGENTS.map((agent, idx) => (
              <div key={agent.name} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-dusk/10 flex items-center justify-center text-xs text-dusk/50 flex-shrink-0 font-medium">
                  {idx + 1}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-ink text-sm">{agent.label}</div>
                  <div className="text-xs text-dusk/50">{agent.description}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-gold/5 border border-gold/20 rounded-lg px-3 py-2">
            <p className="text-xs text-dusk/70 leading-relaxed">
              💡 Пайплайн имитирует реальный творческий процесс: от анализа темы до финальной
              проверки. Каждый шаг прозрачен — вы можете видеть промпты и ответы агентов.
            </p>
          </div>
        </section>
      )}

      {/* ═══════════════ История запусков ═══════════════ */}
      {history.length > 0 && (
        <section className="mb-6">
          <h2 className="section-title mb-4 text-lg">История запусков</h2>
          <div className="space-y-2">
            {history.map((run) => {
              const runDate = new Date(run.createdAt);
              const isExpanded = expandedHistoryId === run.id;

              return (
                <div key={run.id} className="card py-3">
                  <button
                    type="button"
                    onClick={() => handleShowHistoryLog(run.id!)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          run.status === 'completed'
                            ? 'bg-sage'
                            : run.status === 'error'
                              ? 'bg-ember'
                              : run.status === 'cancelled'
                                ? 'bg-gold'
                                : 'bg-dusk/30 animate-pulse'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-ink truncate">
                          {run.config.topic.slice(0, 50) || 'без темы'}
                        </p>
                        <p className="text-xs text-dusk/50">
                          {runDate.toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          · {run.config.style}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {run.finalScore && (
                        <span className="text-xs font-semibold text-sage">
                          {run.finalScore.styleScore}
                        </span>
                      )}
                      <span
                        className={`transition-transform duration-200 text-dusk/40 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      >
                        ▾
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-dusk/10 space-y-2">
                      {run.resultPoem && (
                        <div className="bg-parchment/60 rounded-lg p-3 border border-dusk/5">
                          <pre className="whitespace-pre-wrap text-xs font-serif text-ink leading-relaxed">
                            {run.resultPoem}
                          </pre>
                        </div>
                      )}
                      {run.finalScore && (
                        <div className="flex gap-4 text-xs text-dusk/60">
                          <span>
                            Размер:{' '}
                            <span
                              className={
                                run.finalScore.meterScore >= 60
                                  ? 'text-sage font-medium'
                                  : run.finalScore.meterScore >= 40
                                    ? 'text-gold font-medium'
                                    : 'text-ember font-medium'
                              }
                            >
                              {run.finalScore.meterScore}
                            </span>
                          </span>
                          <span>
                            Рифмы:{' '}
                            <span
                              className={
                                run.finalScore.rhymeScore >= 60
                                  ? 'text-sage font-medium'
                                  : run.finalScore.rhymeScore >= 40
                                    ? 'text-gold font-medium'
                                    : 'text-ember font-medium'
                              }
                            >
                              {run.finalScore.rhymeScore}
                            </span>
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-dusk/40">
                        Статус: {run.status === 'completed' ? 'завершён' : run.status === 'error' ? 'ошибка' : run.status === 'cancelled' ? 'отменён' : run.status}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
