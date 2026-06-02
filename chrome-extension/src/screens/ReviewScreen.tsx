import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { Exercise, ExerciseReview } from '../core/types';
import { LEVEL_NAMES } from '../core/types';
import { exerciseEngine } from '../core/exercise/engine';

// Тип для state, передаваемого из ExerciseScreen
interface ReviewLocationState {
  exercise: Exercise;
  userResponse: string;
  drillReview?: ExerciseReview; // Предварительно вычисленный для дрелей
  isDrill?: boolean;
}

export default function ReviewScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ReviewLocationState | null;

  const [review, setReview] = useState<ExerciseReview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const isDrill = state?.isDrill ?? false;

  // Получаем review (от LLM или мгновенно для дрелей)
  useEffect(() => {
    if (!state?.exercise || !state?.userResponse) return;

    const fetchReview = async () => {
      setIsLoading(true);
      setError('');

      try {
        let result: ExerciseReview;

        if (state.isDrill && state.drillReview) {
          // Дрель — review уже вычислен, используем напрямую
          result = state.drillReview;
        } else {
          // Обычное упражнение — вызов LLM
          result = await exerciseEngine.reviewResponse(
            state.exercise,
            state.userResponse,
          );
        }

        // Сохраняем попытку и обновляем профиль (XP, стрик, уровень)
        await exerciseEngine.saveAttemptAndUpdateProfile(
          state.exercise,
          state.userResponse,
          result,
        );

        setReview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка при проверке ответа');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReview();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Если нет данных — перенаправляем на главную
  if (!state?.exercise) {
    return (
      <div className="screen-container text-center py-20">
        <p className="text-dusk/60 mb-6">Нет данных о выполненном упражнении</p>
        <button className="btn-primary" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    );
  }

  // Состояние загрузки
  if (isLoading) {
    return (
      <div className="screen-container">
        <header className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-dusk/10 flex items-center justify-center text-dusk">
            ←
          </div>
          <h1 className="text-xl font-bold text-ink">Результат</h1>
        </header>

        <div className="card text-center py-16">
          <div className="text-4xl mb-4 animate-pulse">{isDrill ? '🎯' : '🔍'}</div>
          <p className="text-dusk/70 text-lg">
            {isDrill ? 'Проверяем ответ...' : 'Анализируем твой ответ...'}
          </p>
          {!isDrill && (
            <p className="text-dusk/40 text-sm mt-2">
              ИИ-наставник проверяет ритм, рифму и образность
            </p>
          )}
          <div className="mt-6">
            <div className="progress-bar">
              <div className="h-full rounded-full bg-gradient-to-r from-ember to-gold animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>

        {/* Показываем ответ пользователя пока ждём */}
        <div className="card mt-6 bg-dusk/5">
          <h3 className="text-sm font-medium text-dusk/60 mb-2">Твой ответ</h3>
          <div className="whitespace-pre-wrap text-dusk/80 font-serif leading-relaxed">
            {state.userResponse}
          </div>
        </div>
      </div>
    );
  }

  // Ошибка
  if (error) {
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
          <h1 className="text-xl font-bold text-ink">Результат</h1>
        </header>

        <div className="card bg-ember/10 text-ember text-center py-12">
          <div className="text-3xl mb-4">😕</div>
          <p className="mb-2">Не удалось проверить ответ</p>
          <p className="text-sm opacity-70">{error}</p>
        </div>

        {/* Всё равно показываем ответ */}
        <div className="card mt-6 bg-dusk/5">
          <h3 className="text-sm font-medium text-dusk/60 mb-2">Твой ответ</h3>
          <div className="whitespace-pre-wrap text-dusk/80 font-serif leading-relaxed">
            {state.userResponse}
          </div>
        </div>

        <button className="btn-primary w-full text-lg py-4 mt-6" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    );
  }

  // Нет review (не должно случиться, но для TypeScript)
  if (!review) {
    return (
      <div className="screen-container text-center py-20">
        <p className="text-dusk/60 mb-6">Результат не получен</p>
        <button className="btn-primary" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    );
  }

  const isCorrect = review.scores.overall >= 70;

  // Для обычных упражнений — метки для шкал
  const maxScore = 100;
  const scoreLabels: Record<string, string> = {
    rhythm: 'Ритм',
    rhyme: 'Рифма',
    imagery: 'Образность',
    originality: 'Оригинальность',
    overall: 'Общий балл',
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
        <h1 className="text-xl font-bold text-ink">Результат</h1>
      </header>

      {/* XP */}
      <div className="card text-center mb-6 bg-gradient-to-br from-gold/10 to-ember/10">
        <div className="text-4xl font-bold text-gold">+{review.xpEarned} XP</div>
        <div className="text-dusk/60 text-sm mt-1">
          {isDrill ? 'за дрель' : 'за выполнение упражнения'}
        </div>
        {review.levelUp && review.newLevel && (
          <div className="mt-3 text-ember font-bold">
            Повышение уровня! {LEVEL_NAMES[review.newLevel]}
          </div>
        )}
      </div>

      {/* Твой ответ */}
      <div className="card mb-6 bg-dusk/5">
        <h3 className="text-sm font-medium text-dusk/60 mb-2">Твой ответ</h3>
        <div className="whitespace-pre-wrap text-dusk/80 font-serif leading-relaxed">
          {state.userResponse}
        </div>
      </div>

      {/* ═══ Дрель: упрощённый результат без навыков ═══ */}
      {isDrill ? (
        <>
          {/* Верно / Неверно */}
          <div className="card mb-6 text-center">
            <div className="text-5xl mb-3">{isCorrect ? '🎯' : '😕'}</div>
            <div className={`text-2xl font-bold ${isCorrect ? 'text-sage' : 'text-ember'}`}>
              {isCorrect ? 'Верно!' : 'Неверно'}
            </div>
            {!isCorrect && state.exercise.drillData && (
              <div className="mt-3 text-sm text-dusk/60">
                Правильный ответ:{' '}
                <span className="font-bold text-ink">
                  {state.exercise.drillData.options[state.exercise.drillData.correctIndex]}
                </span>
              </div>
            )}
          </div>

          {/* Пояснение (strengths для верного, weaknesses для неверного) */}
          {review.strengths.length > 0 && (
            <div className="card mb-4">
              <h3 className="font-medium text-ink mb-3">Пояснение</h3>
              <ul className="space-y-2">
                {review.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-dusk/80">
                    <span className="text-sage mt-0.5">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.weaknesses.length > 0 && (
            <div className="card mb-4">
              <h3 className="font-medium text-ink mb-3">Разбор ошибки</h3>
              <ul className="space-y-2">
                {review.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-dusk/80">
                    <span className="text-ember mt-0.5">!</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.suggestions.length > 0 && (
            <div className="card mb-8">
              <h3 className="font-medium text-ink mb-3">Совет</h3>
              <ul className="space-y-2">
                {review.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-dusk/80">
                    <span className="text-gold mt-0.5">→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ═══ Обычное упражнение: полная оценка по навыкам ═══ */}

          {/* Баллы */}
          <div className="card mb-6">
            <h3 className="font-medium text-ink mb-4">Оценка по навыкам</h3>
            <div className="space-y-3">
              {Object.entries(review.scores).map(([key, value]) => (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-dusk/70">{scoreLabels[key] ?? key}</span>
                    <span className="font-medium text-ink">{value}/{maxScore}</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        key === 'overall'
                          ? 'bg-gradient-to-r from-ember to-gold'
                          : value >= 70
                            ? 'bg-sage'
                            : value >= 40
                              ? 'bg-gold'
                              : 'bg-ember'
                      }`}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Сильные стороны */}
          {review.strengths.length > 0 && (
            <div className="card mb-4">
              <h3 className="font-medium text-ink mb-3">Что получилось хорошо</h3>
              <ul className="space-y-2">
                {review.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-dusk/80">
                    <span className="text-sage mt-0.5">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Недочёты */}
          {review.weaknesses.length > 0 && (
            <div className="card mb-4">
              <h3 className="font-medium text-ink mb-3">На что обратить внимание</h3>
              <ul className="space-y-2">
                {review.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-dusk/80">
                    <span className="text-ember mt-0.5">!</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Советы */}
          {review.suggestions.length > 0 && (
            <div className="card mb-8">
              <h3 className="font-medium text-ink mb-3">Как улучшить</h3>
              <ul className="space-y-2">
                {review.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-dusk/80">
                    <span className="text-gold mt-0.5">→</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="flex gap-3">
        <button className="btn-secondary flex-1 text-lg py-4" onClick={() => navigate('/exercise')}>
          Ещё одно
        </button>
        <button className="btn-primary flex-1 text-lg py-4" onClick={() => navigate('/')}>
          На главную
        </button>
      </div>
    </div>
  );
}
