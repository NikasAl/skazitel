import { useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import type { Exercise, ExerciseType } from '../core/types';
import { EXERCISE_TYPE_INFO, EXERCISE_TYPES } from '../core/types';
import { exerciseEngine } from '../core/exercise/engine';
import { getTopics, getProfile } from '../core/storage/repository';

// Типы упражнений-дрелей (с выбором из вариантов)
const DRILL_TYPES: ExerciseType[] = ['syllable_count', 'stress_pattern', 'rhyme_match', 'line_builder'];

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
