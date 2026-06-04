import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import type { Exercise, ExerciseType } from '../core/types';
import { EXERCISE_TYPE_INFO, EXERCISE_TYPES } from '../core/types';
import { exerciseEngine } from '../core/exercise/engine';
import { getTopics, getProfile } from '../core/storage/repository';

// Типы упражнений-дрелей (с выбором из вариантов)
const DRILL_TYPES: ExerciseType[] = ['syllable_count', 'stress_pattern', 'rhyme_match', 'line_builder'];

// ==================== Разбивка по слогам ====================

/** Русские гласные буквы (каждая = один слог) */
const RU_VOWELS = new Set('аеёиоуыэюяАЕЁИОУЫЭЮЯ');

/**
 * Разбивает слово на слоги, вставляя разделитель '·' между ними.
 * Правило: каждая гласная буква начинает новый слог.
 * Пример: "золотой" → "зо·ло·то́й", "вечерний" → "ве·че·рен·ний"
 */
function splitWordToSyllables(word: string): string {
  // Убираем пунктуацию по краям
  const trimmed = word.replace(/^[^а-яА-ЯёЁa-zA-Z]+|[^а-яА-ЯёЁa-zA-Z]+$/g, '');
  if (!trimmed) return word;

  const prefix = word.slice(0, word.length - trimmed.length);
  const suffix = word.slice(word.length - (word.length - trimmed.length - prefix.length));

  if (trimmed.length <= 1) return word;

  const chars = [...trimmed];
  const syllables: string[] = [];
  let current = chars[0];

  for (let i = 1; i < chars.length; i++) {
    const ch = chars[i];
    const prev = chars[i - 1];
    // Гласная + согласная/й = продолжаем текущий слог
    // Гласная + гласная = новая гласная начинает новый слог
    if (RU_VOWELS.has(ch) && (RU_VOWELS.has(prev) || prev === 'й' || prev === 'Й')) {
      syllables.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) syllables.push(current);

  return prefix + syllables.join('·') + suffix;
}

/** Форматирует строку: разбивает слова на слоги и подсчитывает их */
function formatLineWithSyllables(line: string): { formatted: string; count: number } {
  const words = line.split(/(\s+)/);
  let totalSyllables = 0;
  const formatted = words.map(w => {
    if (/^\s+$/.test(w)) return w;
    const syllableWord = splitWordToSyllables(w);
    // Считаем гласные в очищенном слове
    const clean = w.replace(/[^а-яА-ЯёЁ]/g, '');
    const count = [...clean].filter(c => RU_VOWELS.has(c)).length;
    totalSyllables += count;
    return syllableWord;
  }).join('');
  return { formatted, count: totalSyllables };
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

  // Разбивка по слогам для текущего ответа
  const syllableData = useMemo(() => {
    if (!response.trim()) return null;
    const lines = response.split('\n');
    return lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return { formatted: '', count: 0, isEmpty: true };
      const result = formatLineWithSyllables(trimmed);
      return { ...result, isEmpty: false };
    });
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
      const topics = await getTopics();
      const topic = topics[0];
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

              {/* Панель разбивки по слогам */}
              {syllableData && (
                <div className="card mt-3 bg-dusk/5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-dusk/60">Разбивка по слогам</h3>
                    <button
                      className="text-xs text-dusk/40 hover:text-dusk/60 transition-colors"
                      onClick={() => {
                        if (!exercise?.instruction) return;
                        // Копируем разбивку в буфер
                        const text = syllableData
                          .filter(d => !d.isEmpty)
                          .map(d => `${d.formatted} (${d.count})`)
                          .join('\n');
                        navigator.clipboard?.writeText(text);
                      }}
                      title="Скопировать разбивку"
                    >
                      копировать
                    </button>
                  </div>
                  <div className="space-y-1">
                    {syllableData.map((line, i) =>
                      line.isEmpty ? (
                        <div key={i} className="h-3" />
                      ) : (
                        <div key={i} className="flex items-baseline gap-2">
                          <span className="text-xs text-dusk/30 w-5 text-right flex-shrink-0 font-mono">
                            {line.count}
                          </span>
                          <span className="font-serif text-sm text-dusk/70 leading-relaxed tracking-wide">
                            {line.formatted}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                  {syllableData.some(d => !d.isEmpty && d.count > 0) && (
                    <div className="mt-2 pt-2 border-t border-dusk/10 flex gap-4 text-xs text-dusk/40">
                      <span>
                        Строк: {syllableData.filter(d => !d.isEmpty).length}
                      </span>
                      <span>
                        Слогов: {syllableData.reduce((s, d) => s + d.count, 0)}
                      </span>
                      {syllableData.filter(d => !d.isEmpty).length > 0 && (
                        <span>
                          В среднем:{' '}
                          {Math.round(
                            syllableData.reduce((s, d) => s + d.count, 0) /
                            syllableData.filter(d => !d.isEmpty).length,
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
