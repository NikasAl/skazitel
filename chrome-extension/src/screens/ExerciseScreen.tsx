import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import type { Exercise, ExerciseType } from '../core/types';
import { EXERCISE_TYPE_INFO, EXERCISE_TYPES } from '../core/types';
import { exerciseEngine } from '../core/exercise/engine';
import { getTopics, getProfile, getActiveTopicId } from '../core/storage/repository';

// Типы упражнений-дрелей (с выбором из вариантов)
const DRILL_TYPES: ExerciseType[] = ['syllable_count', 'stress_pattern', 'rhyme_match', 'line_builder'];

// ==================== Разбивка по слогам + анализ размера ====================

/** Русские гласные буквы (каждая = один слог) */
const RU_VOWELS = new Set('аеёиоуыэюяАЕЁИОУЫЭЮЯ');

/** Сонорные — могут быть в конце слога */
const SONORANTS = new Set('мнлрйМНЛРЙ');

/** Результат разбивки одного слога */
interface Syllable {
  text: string;       // текст слога (буквы)
  vowel: string;     // гласная буква слога
  isStressed: boolean; // ударный ли (по заглавной гласной)
  index: number;     // номер слога в слове (0-based)
}

/** Результат разбивки одного слова */
interface WordSyllables {
  prefix: string;    // пунктуация до слова
  suffix: string;    // пунктуация после слова
  syllables: Syllable[];
}

/** Результат разбивки строки + анализ */
interface LineAnalysis {
  words: WordSyllables[];
  syllableCount: number;
  stressPattern: boolean[];  // true = ударный
  isEmpty: boolean;
  meter?: string;      // определённый размер
  meterConfidence?: number;  // уверенность 0-1
}

/** Результат полного анализа текста */
interface TextAnalysis {
  lines: LineAnalysis[];
  overallMeter?: string;
  overallConfidence?: number;
}

/**
 * Правильная разбивка русского слова на слоги.
 * Правило: каждый слог содержит ровно одну гласную.
 * Согласные до гласной → в этот слог.
 * Согласные после гласной → к следующему слогу (кроме сонорных на конце слова).
 * Пример: "золотой" → ["зо", "ло", "то", "й"], "вечерний" → ["ве", "че", "рен", "ний"]
 */
function splitWordToSyllables(word: string): WordSyllables {
  // Выделяем префикс/суффикс (пунктуация)
  const match = word.match(/^([^а-яА-ЯёЁ]*)([а-яА-ЯёЁ]+)([^а-яА-ЯёЁ]*)$/);
  if (!match) return { prefix: word, suffix: '', syllables: [] };

  const prefix = match[1];
  const core = match[2];
  const suffix = match[3];
  const chars = [...core];

  if (chars.length === 0) return { prefix, suffix, syllables: [] };

  // Находим индексы всех гласных
  const vowelIndices: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (RU_VOWELS.has(chars[i])) vowelIndices.push(i);
  }

  if (vowelIndices.length === 0) return { prefix, suffix, syllables: [{ text: core, vowel: '', isStressed: false, index: 0 }] };

  const syllables: Syllable[] = [];

  for (let s = 0; s < vowelIndices.length; s++) {
    const vIdx = vowelIndices[s];
    const vowelChar = chars[vIdx];

    // Определяем начало слога: после предыдущей гласной (+ сонорные после неё)
    let start = vIdx;
    if (s > 0) {
      start = vowelIndices[s - 1] + 1;
      // Сонорные после предыдущей гласной уходят в текущий слог
      // но только если перед текущей гласной есть согласные
      const consonantsBefore = vIdx - start;
      let sonorantCarry = 0;
      for (let k = start; k < vIdx; k++) {
        if (SONORANTS.has(chars[k])) sonorantCarry++;
        else break;
      }
      // Если все согласные — сонорные и их <= 1, оставляем в текущем
      // Иначе переносим сонорные к текущей гласной
      if (sonorantCarry < consonantsBefore) {
        start += sonorantCarry;
      }
    }

    // Определяем конец слога: до следующей гласной (+ сонорные)
    let end = s < vowelIndices.length - 1
      ? vowelIndices[s + 1]
      : chars.length;

    // Сонорные/й после гласной уходят в текущий слог (если до следующей гласной есть ещё согласные)
    if (s < vowelIndices.length - 1 && end > vIdx + 1) {
      let sonorantTail = 0;
      for (let k = vIdx + 1; k < end; k++) {
        if (SONORANTS.has(chars[k]) || chars[k] === 'й' || chars[k] === 'Й') sonorantTail++;
        else break;
      }
      // Если после сонорных есть ещё согласные — оставляем сонорные в текущем
      if (end - vIdx - 1 > sonorantTail) {
        end = vIdx + 1 + sonorantTail;
      }
    }

    const syllableText = chars.slice(start, end).join('');
    const isStressed = vowelChar !== vowelChar.toLowerCase(); // заглавная гласная = ударный

    syllables.push({
      text: syllableText,
      vowel: vowelChar,
      isStressed,
      index: s,
    });
  }

  return { prefix, suffix, syllables };
}

/** Разбивает строку на слова и слоги */
function analyzeLine(line: string): LineAnalysis {
  const trimmed = line.trim();
  if (!trimmed) return { words: [], syllableCount: 0, stressPattern: [], isEmpty: true };

  // Разбиваем на слова, сохраняя пробелы
  const tokens = trimmed.split(/(\s+)/);
  const words: WordSyllables[] = [];
  const stressPattern: boolean[] = [];

  for (const token of tokens) {
    if (/^\s+$/.test(token)) continue;
    const ws = splitWordToSyllables(token);
    words.push(ws);
    for (const syl of ws.syllables) {
      stressPattern.push(syl.isStressed);
    }
  }

  const syllableCount = words.reduce((s, w) => s + w.syllables.length, 0);
  const analysis = { words, syllableCount, stressPattern, isEmpty: false };

  // Определяем размер
  const meterResult = detectMeter(stressPattern);
  return { ...analysis, ...meterResult };
}

/** Схемы стихотворных размеров */
interface MeterPattern {
  name: string;
  short: string;   // аббревиатура
  pattern: number[]; // 0=безударный, 1=ударный, -1=любой
  description: string;
}

const METER_PATTERNS: MeterPattern[] = [
  { name: 'Хорей', short: 'Х', pattern: [1, 0, 1, 0], description: 'ТА-та-ТА-та' },
  { name: 'Ямб', short: 'Я', pattern: [0, 1, 0, 1], description: 'та-ТА-та-ТА' },
  { name: 'Дактиль', short: 'Д', pattern: [1, 0, 0, 1, 0, 0], description: 'ТА-та-та-ТА-та-та' },
  { name: 'Амфибрахий', short: 'Ам', pattern: [0, 1, 0, 0, 1, 0], description: 'та-ТА-та-та-ТА-та' },
  { name: 'Анапест', short: 'Ан', pattern: [0, 0, 1, 0, 0, 1], description: 'та-та-ТА-та-ta-ТА' },
  { name: 'Пеон I', short: 'П1', pattern: [1, 0, 0, 0], description: 'ТА-та-та-та' },
  { name: 'Пеон II', short: 'П2', pattern: [0, 1, 0, 0], description: 'та-ТА-та-та' },
  { name: 'Пеон III', short: 'П3', pattern: [0, 0, 1, 0], description: 'та-та-ТА-та' },
  { name: 'Пеон IV', short: 'П4', pattern: [0, 0, 0, 1], description: 'та-та-та-ТА' },
];

/** Определяет ближайший стихотворный размер по схеме ударений */
function detectMeter(stressPattern: boolean[]): { meter?: string; meterConfidence?: number } {
  if (stressPattern.length < 3) return {};

  let bestMeter = '';
  let bestConfidence = 0;

  for (const meter of METER_PATTERNS) {
    const score = matchPattern(stressPattern, meter.pattern);
    if (score > bestConfidence) {
      bestConfidence = score;
      bestMeter = meter.name;
    }
  }

  return bestConfidence >= 0.3 ? { meter: bestMeter, meterConfidence: Math.round(bestConfidence * 100) / 100 } : {};
}

/** Считает совпадение схемы ударений с паттерном */
function matchPattern(stress: boolean[], pattern: number[]): number {
  if (stress.length < pattern.length) return 0;

  let matches = 0;
  let checks = 0;

  // Проверяем все возможные начальные позиции (для разных стоп)
  for (let offset = 0; offset < Math.min(stress.length, pattern.length); offset++) {
    let m = 0;
    let c = 0;
    for (let i = 0; i < stress.length && (offset + i < pattern.length || i < stress.length); i++) {
      const pIdx = (offset + i) % pattern.length;
      const p = pattern[pIdx];
      if (p === -1) continue;
      c++;
      if ((p === 1 && stress[i]) || (p === 0 && !stress[i])) m++;
    }
    if (c > checks) {
      checks = c;
      matches = m;
    }
  }

  return checks > 0 ? matches / checks : 0;
}

/** Полный анализ текста */
function analyzeText(text: string): TextAnalysis {
  const lines = text.split('\n');
  const result = lines.map(l => analyzeLine(l));

  // Определяем общий размер по совпадению строк
  const nonEmpty = result.filter(l => !l.isEmpty && l.meter);
  if (nonEmpty.length >= 2) {
    // Считаем частоту каждого размера
    const freq: Record<string, number> = {};
    let totalConf = 0;
    for (const l of nonEmpty) {
      if (l.meter) {
        freq[l.meter] = (freq[l.meter] || 0) + 1;
        totalConf += l.meterConfidence || 0;
      }
    }
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= nonEmpty.length * 0.5) {
      return {
        lines: result,
        overallMeter: top[0],
        overallConfidence: Math.round((totalConf / nonEmpty.length) * 100) / 100,
      };
    }
  }

  return { lines: result };
}

// Тип для state, передаваемого из HomeScreen или LibraryScreen
interface ExerciseLocationState {
  exerciseType?: ExerciseType;
  presetExercise?: Exercise; // Предустановленное упражнение из библиотеки
}

export default function ExerciseScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as ExerciseLocationState | null;

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [response, setResponse] = useState('');
  const [showHints, setShowHints] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedType, setSelectedType] = useState<ExerciseType | null>(
    locationState?.exerciseType ?? null,
  );
  // Для дрелей — индекс выбранного варианта
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  // Показывает, что упражнение сгенерировано LLM (а не встроенное)
  const [usedBuiltin, setUsedBuiltin] = useState(true);

  const isDrill = exercise?.drillData != null;

  // Полный анализ текста (слоги, ударения, размер)
  const textAnalysis = useMemo(() => {
    if (!response.trim()) return null;
    return analyzeText(response);
  }, [response]);

  // Если передано предустановленное упражнение — показываем сразу, иначе генерируем
  useEffect(() => {
    if (locationState?.presetExercise) {
      setExercise(locationState.presetExercise);
      setSelectedType(locationState.presetExercise.type);
      setUsedBuiltin(false);
    } else if (selectedType) {
      handleGenerateExercise(selectedType);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerateExercise = async (type: ExerciseType) => {
    setIsGenerating(true);
    setError('');
    setExercise(null);
    setSelectedOption(null);
    setResponse('');
    setShowHints(false);
    setSelectedType(type);

    try {
      const [topics, activeId] = await Promise.all([
        getTopics(),
        getActiveTopicId(),
      ]);
      // Используем активную тему, либо первую в списке
      const topic = activeId ? topics.find((t) => t.id === activeId) : topics[0];
      const topicId = topic?.id ?? 'no-topic';
      const topicName = topic?.name ?? 'свободная тема';

      const profile = await getProfile();
      const difficulty = profile?.difficultyPreference ?? 1;

      const result = await exerciseEngine.generateExercise(type, topicId, topicName, difficulty);
      setExercise(result.exercise);
      setUsedBuiltin(result.usedBuiltin);

      // Если использовался фоллбэк при наличии API — уведомляем пользователя
      if (result.usedBuiltin) {
        setError('Не удалось сгенерировать через LLM — показано встроенное задание. Откройте DevTools (F12) для деталей в консоли [Skazitel:engine].');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации упражнения');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setExercise(null);
    setResponse('');
    setShowHints(false);
    setSelectedOption(null);
    setSelectedType(null);
  };

  // Для обычных упражнений — отправка текста на LLM-проверку
  const handleTextSubmit = () => {
    if (!response.trim() || !exercise) return;
    setIsSubmitting(true);
    navigate('/review', {
      state: { exercise, userResponse: response },
    });
    setTimeout(() => setIsSubmitting(false), 2000);
  };

  // Для дрелей — мгновенная проверка по correctIndex
  const handleDrillSubmit = () => {
    if (selectedOption === null || !exercise || !exercise.drillData) return;
    setIsSubmitting(true);

    const { review } = exerciseEngine.checkDrillAnswer(exercise, selectedOption);
    // Для дрелей передаём ответ как индекс + текст выбранного варианта
    navigate('/review', {
      state: {
        exercise,
        userResponse: exercise.drillData.options[selectedOption],
        drillReview: review, // Предварительно вычисленный review
        isDrill: true,
      },
    });
    setTimeout(() => setIsSubmitting(false), 2000);
  };

  return (
    <div className="screen-container">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-full bg-dusk/10 flex items-center justify-center
            hover:bg-dusk/20 transition-colors text-dusk"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-ink">
          {isDrill ? 'Дрель' : 'Упражнение'}
        </h1>
      </header>

      {/* Ошибка */}
      {error && (
        <div className="card mb-4 bg-ember/10 text-ember">
          <p className="text-sm">{error}</p>
          <div className="flex gap-3 mt-2">
            <button className="text-xs underline" onClick={() => setError('')}>
              Скрыть
            </button>
            <button
              className="text-xs underline"
              onClick={() => {
                // Собираем логи из консоли для отладки
                const debugInfo = [
                  'Тип упражнения:', selectedType,
                  'usedBuiltin:', usedBuiltin,
                  'exercise.id:', exercise?.id,
                  'exercise.drillData:', exercise?.drillData ? 'есть' : 'нет',
                  '',
                  'Для полной диагностики откройте DevTools → Console и поищите [Skazitel:engine]',
                ].join('\n');
                navigator.clipboard?.writeText(debugInfo);
                alert('Отладочная информация скопирована в буфер обмена.\n\nОткройте DevTools (F12) → Console и поищите [Skazitel:engine] для деталей.');
              }}
            >
              Копировать отладку
            </button>
          </div>
        </div>
      )}

      {/* Загрузка */}
      {isGenerating && (
        <div className="card text-center py-12">
          <div className="text-3xl mb-4 animate-pulse">{isDrill ? '🎯' : '📝'}</div>
          <p className="text-dusk/70">
            {isDrill ? 'Подбираем задание...' : 'Генерируем упражнение...'}
          </p>
        </div>
      )}

      {/* Выбор типа упражнения */}
      {!isGenerating && !exercise && (
        <div className="space-y-6">
          {/* Дрели */}
          <div>
            <h2 className="section-title">Базовые навыки</h2>
            <p className="text-sm text-dusk/50 mb-3">Короткие упражнения для тренировки отдельных навыков</p>
            <div className="space-y-2">
              {DRILL_TYPES.map((type) => {
                const info = EXERCISE_TYPE_INFO[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleGenerateExercise(type)}
                    className="card w-full text-left py-3 hover:bg-dusk/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{info.icon}</span>
                      <div>
                        <div className="font-medium text-ink text-sm">{info.name}</div>
                        <div className="text-xs text-dusk/50">{info.description}</div>
                      </div>
                      <span className="ml-auto text-xs text-dusk/30">быстро</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Разделитель */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-dusk/10" />
            <span className="text-xs text-dusk/30">Полные упражнения</span>
            <div className="flex-1 h-px bg-dusk/10" />
          </div>

          {/* Основные упражнения */}
          <div>
            <h2 className="section-title mb-3">Творческие задания</h2>
            <div className="space-y-2">
              {EXERCISE_TYPES.filter(t => !DRILL_TYPES.includes(t)).map((type) => {
                const info = EXERCISE_TYPE_INFO[type];
                return (
                  <button
                    key={type}
                    onClick={() => handleGenerateExercise(type)}
                    className="card w-full text-left py-3 hover:bg-dusk/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{info.icon}</span>
                      <div>
                        <div className="font-medium text-ink text-sm">{info.name}</div>
                        <div className="text-xs text-dusk/50">{info.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Упражнение загружено */}
      {!isGenerating && exercise && (
        <div className="space-y-6">
          {/* Тип и сложность */}
          <div className="flex items-center gap-2">
            <span className="badge">
              {EXERCISE_TYPE_INFO[exercise.type].icon}{' '}
              {EXERCISE_TYPE_INFO[exercise.type].name}
            </span>
            <span className="badge">Сложность: {exercise.difficulty}/10</span>
            {isDrill && <span className="badge bg-sage/20 text-sage">дрель</span>}
            {!usedBuiltin && <span className="badge bg-gold/20 text-gold">LLM</span>}
            {usedBuiltin && !isDrill && <span className="badge bg-dusk/10 text-dusk/50">офлайн</span>}
            {usedBuiltin && isDrill && <span className="badge bg-dusk/10 text-dusk/50">шаблон</span>}
          </div>

          {/* Вопрос дрели (крупно) */}
          {isDrill && exercise.drillData && (
            <div className="card bg-gradient-to-br from-dusk/5 to-parchment">
              <div className="whitespace-pre-wrap text-dusk text-lg font-serif leading-relaxed">
                {exercise.drillData.question}
              </div>
            </div>
          )}

          {/* Инструкция (для не-дрелей) */}
          {!isDrill && (
            <div className="card">
              <h3 className="font-medium text-ink mb-3">Задание</h3>
              <div className="whitespace-pre-wrap text-dusk/80 leading-relaxed">
                {exercise.instruction}
              </div>
            </div>
          )}

          {/* Примеры */}
          {exercise.examples.length > 0 && (
            <div className="card bg-dusk/5">
              <h3 className="text-sm font-medium text-dusk/60 mb-2">Пример</h3>
              {exercise.examples.map((ex, i) => (
                <p key={i} className="text-dusk/70 italic">{ex}</p>
              ))}
            </div>
          )}

          {/* Варианты ответа для дрелей */}
          {isDrill && exercise.drillData && (
            <div className="space-y-2">
              {exercise.drillData.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedOption(i)}
                  className={`card w-full text-left py-3 px-4 transition-all ${
                    selectedOption === i
                      ? 'border-2 border-ember bg-ember/5'
                      : 'border-2 border-transparent hover:bg-dusk/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedOption === i
                          ? 'border-ember bg-ember'
                          : 'border-dusk/30'
                      }`}
                    >
                      {selectedOption === i && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <span className="text-dusk font-serif text-lg">{option}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Поле ввода текста (для не-дрелей) */}
          {!isDrill && (
            <div>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Твой ответ..."
                className="input-field min-h-[200px] font-serif text-lg leading-relaxed resize-y"
                autoFocus
              />
              <div className="flex justify-between mt-2 text-sm text-dusk/40">
                <span>{response.split('\n').filter(Boolean).length} строк</span>
                <span>{response.split(/\s+/).filter(Boolean).length} слов</span>
              </div>

              {/* Панель анализа: слоги, ударения, размер */}
              {textAnalysis && (
                <div className="card mt-3 bg-dusk/5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-dusk/60">Анализ ритмики</h3>
                    <button
                      className="text-xs text-dusk/40 hover:text-dusk/60 transition-colors"
                      onClick={() => {
                        const text = textAnalysis.lines
                          .filter(l => !l.isEmpty)
                          .map(l => {
                            const sylText = l.words.map(w =>
                              w.prefix + w.syllables.map(s => s.text).join('·') + w.suffix
                            ).join(' ');
                            return `${sylText} (${l.syllableCount})${l.meter ? ' [' + l.meter + ']' : ''}`;
                          })
                          .join('\n');
                        navigator.clipboard?.writeText(text);
                      }}
                      title="Скопировать анализ"
                    >
                      копировать
                    </button>
                  </div>

                  {/* Общий размер */}
                  {textAnalysis.overallMeter && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-gold/10 border border-gold/20">
                      <div className="flex items-center gap-2">
                        <span className="text-gold font-bold">{textAnalysis.overallMeter}</span>
                        <span className="text-xs text-gold/60">
                          (уверенность {Math.round((textAnalysis.overallConfidence || 0) * 100)}%)
                        </span>
                      </div>
                      <p className="text-xs text-dusk/50 mt-1">
                        Для точности выделяйте ударный слог ЗАГЛАВНОЙ буквой гласной: «мОРОЗ и сОЛнце»
                      </p>
                    </div>
                  )}

                  {/* Построчный анализ */}
                  <div className="space-y-1.5">
                    {textAnalysis.lines.map((line, i) =>
                      line.isEmpty ? (
                        <div key={i} className="h-2" />
                      ) : (
                        <div key={i} className="flex items-baseline gap-2">
                          {/* Количество слогов */}
                          <span className="text-xs text-dusk/30 w-5 text-right flex-shrink-0 font-mono">
                            {line.syllableCount}
                          </span>
                          {/* Слова с разбивкой и цветом */}
                          <span className="font-serif text-sm leading-relaxed">
                            {line.words.map((w, wi) => (
                              <span key={wi}>
                                {w.prefix}
                                {w.syllables.map((syl, si) => (
                                  <span
                                    key={si}
                                    className={
                                      syl.isStressed
                                        ? 'bg-ember/20 text-ember rounded px-px font-bold'
                                        : 'bg-dusk/10 text-dusk/60 rounded px-px'
                                    }
                                    title={syl.isStressed ? 'ударный' : 'безударный'}
                                  >
                                    {syl.text}
                                  </span>
                                ))}
                                {w.suffix}
                                {wi < line.words.length - 1 ? ' ' : ''}
                              </span>
                            ))}
                          </span>
                          {/* Размер строки */}
                          {line.meter && (
                            <span className="text-xs text-gold/60 flex-shrink-0 font-mono">
                              {line.meter}
                            </span>
                          )}
                        </div>
                      ),
                    )}
                  </div>

                  {/* Схема ударений для всех строк */}
                  {textAnalysis.lines.some(l => !l.isEmpty && l.stressPattern.length > 0) && (
                    <div className="mt-3 pt-2 border-t border-dusk/10">
                      <p className="text-xs text-dusk/40 mb-1">Схема ударений:</p>
                      <div className="space-y-0.5">
                        {textAnalysis.lines.map((line, i) =>
                          line.isEmpty ? null : (
                            <div key={i} className="flex gap-1 items-center">
                              {line.stressPattern.map((isStressed, si) => (
                                <span
                                  key={si}
                                  className={`w-5 h-5 rounded text-center text-xs leading-5 font-mono ${
                                    isStressed
                                      ? 'bg-ember/20 text-ember font-bold'
                                      : 'bg-dusk/10 text-dusk/30'
                                  }`}
                                >
                                  {isStressed ? 'ТА' : 'та'}
                                </span>
                              ))}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Итого */}
                  {textAnalysis.lines.some(d => !d.isEmpty && d.syllableCount > 0) && (
                    <div className="mt-2 pt-2 border-t border-dusk/10 flex gap-4 text-xs text-dusk/40">
                      <span>
                        Строк: {textAnalysis.lines.filter(d => !d.isEmpty).length}
                      </span>
                      <span>
                        Слогов: {textAnalysis.lines.reduce((s, d) => s + d.syllableCount, 0)}
                      </span>
                      {textAnalysis.lines.filter(d => !d.isEmpty).length > 0 && (
                        <span>
                          В среднем:{' '}
                          {Math.round(
                            textAnalysis.lines.reduce((s, d) => s + d.syllableCount, 0) /
                            textAnalysis.lines.filter(d => !d.isEmpty).length,
                          )}{' '}
                          слогов/строку
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Подсказки */}
          {exercise.hints.length > 0 && (
            <div>
              <button
                onClick={() => setShowHints(!showHints)}
                className="text-sm text-ember hover:text-ember/80 transition-colors"
              >
                {showHints ? 'Скрыть подсказки' : 'Показать подсказки'}
              </button>
              {showHints && (
                <ul className="mt-2 space-y-1">
                  {exercise.hints.map((hint, i) => (
                    <li key={i} className="text-sm text-dusk/60 pl-4 border-l-2 border-gold/30">
                      {hint}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Кнопки */}
          <div className="flex gap-3">
            <button
              className="btn-secondary flex-shrink-0"
              onClick={handleReset}
            >
              Другое
            </button>
            <button
              className="btn-primary flex-1 text-lg py-4"
              onClick={isDrill ? handleDrillSubmit : handleTextSubmit}
              disabled={isDrill ? (selectedOption === null || isSubmitting) : (!response.trim() || isSubmitting)}
            >
              {isSubmitting
                ? 'Проверяем...'
                : isDrill
                  ? 'Ответить'
                  : 'Проверить'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
