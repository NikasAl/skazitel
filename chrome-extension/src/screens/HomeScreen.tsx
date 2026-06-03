import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { db } from '../core/storage/db';
import { getRecentAttempts } from '../core/storage/repository';
import type { UserProfile, Topic, ExerciseAttempt } from '../core/types';
import { LEVEL_NAMES, LEVEL_XP_TABLE, EXERCISE_TYPE_INFO, EXERCISE_TYPES } from '../core/types';

export default function HomeScreen() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<ExerciseAttempt[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);

  useEffect(() => {
    db.profiles.toCollection().first().then((p) => setProfile(p ?? null));
    db.topics.toArray().then(setTopics);
    getRecentAttempts(5).then(setRecentAttempts);
  }, []);

  const xpProgress = profile
    ? ((profile.xp - (LEVEL_XP_TABLE[profile.level] ?? 0)) /
        ((LEVEL_XP_TABLE[profile.level + 1] ?? profile.xpToNextLevel) -
          (LEVEL_XP_TABLE[profile.level] ?? 0))) *
      100
    : 0;

  return (
    <div className="screen-container">
      {/* Шапка */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Сказитель</h1>
          <p className="text-dusk/60 text-sm">тренажёр стихосложения</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm text-dusk/60">Уровень {profile?.level ?? 1}</div>
            <div className="font-medium text-ink">
              {LEVEL_NAMES[profile?.level ?? 1]}
            </div>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-dusk/10 flex items-center justify-center
              hover:bg-dusk/20 transition-colors text-dusk"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Стрик и XP */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card text-center">
          <div className="text-3xl font-bold text-ember">{profile?.streak ?? 0}</div>
          <div className="text-sm text-dusk/60 mt-1">дней подряд</div>
          {profile && profile.streak >= 7 && (
            <div className="badge mt-2">+50% XP</div>
          )}
        </div>
        <div className="card">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-gold">{profile?.xp ?? 0}</span>
            <span className="text-sm text-dusk/60">XP</span>
          </div>
          <div className="progress-bar mt-2">
            <div className="progress-fill" style={{ width: `${Math.min(100, xpProgress)}%` }} />
          </div>
          <div className="text-xs text-dusk/50 mt-1">
            до {LEVEL_NAMES[Math.min((profile?.level ?? 1) + 1, 10)]}
          </div>
        </div>
      </div>

      {/* Новое задание — кнопка */}
      <button
        className="btn-primary w-full text-lg py-4 mb-8"
        onClick={() => setShowExercisePicker(!showExercisePicker)}
      >
        {showExercisePicker ? 'Скрыть типы' : 'Новое задание'}
      </button>

      {/* Выбор типа упражнения */}
      {showExercisePicker && (
        <section className="mb-8">
          <h2 className="section-title mb-4">Тип упражнения</h2>
          <div className="space-y-2">
            {EXERCISE_TYPES.map((type) => {
              const info = EXERCISE_TYPE_INFO[type];
              return (
                <button
                  key={type}
                  onClick={() => {
                    setShowExercisePicker(false);
                    navigate('/exercise', { state: { exerciseType: type } });
                  }}
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
            {/* Также быстрая кнопка «Случайное» */}
            <button
              onClick={() => {
                setShowExercisePicker(false);
                navigate('/exercise');
              }}
              className="card w-full text-center py-3 hover:bg-dusk/5 transition-colors text-dusk/60 text-sm"
            >
              Случайный тип
            </button>
          </div>
        </section>
      )}

      {/* Последние результаты */}
      {recentAttempts.length > 0 && (
        <section className="mb-8">
          <h2 className="section-title mb-4">Последние результаты</h2>
          <div className="space-y-2">
            {recentAttempts.map((attempt) => (
              <div key={attempt.id} className="card flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm text-dusk/60">
                    {new Date(attempt.submittedAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </div>
                  {attempt.review && (
                    <span className={`text-sm font-medium ${
                      attempt.review.scores.overall >= 70 ? 'text-sage' :
                      attempt.review.scores.overall >= 40 ? 'text-gold' :
                      'text-ember'
                    }`}>
                      {attempt.review.scores.overall}/100
                    </span>
                  )}
                </div>
                <span className="text-sm text-gold">+{attempt.review?.xpEarned ?? 0} XP</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Темы */}
      <section>
        <h2 className="section-title mb-4">Мои темы</h2>
        {topics.length === 0 ? (
          <div className="card text-center text-dusk/50 py-8">
            Пока нет тем. Добавьте тему в настройках или начните задание.
          </div>
        ) : (
          <div className="space-y-2">
            {topics.map((topic) => (
              <div key={topic.id} className="card flex items-center justify-between py-4">
                <div>
                  <div className="font-medium text-ink">{topic.name}</div>
                  <div className="text-sm text-dusk/50">
                    {topic.exerciseCount} упражнений
                  </div>
                </div>
                {topic.isBuiltIn && <div className="badge">встроенная</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Навигация */}
      <nav className="mt-8 flex gap-3">
        <button className="btn-secondary flex-1" onClick={() => navigate('/library')}>
          Библиотека
        </button>
        <button className="btn-secondary flex-1" onClick={() => navigate('/poems')}>
          Мои стихи
        </button>
        <button className="btn-secondary flex-1" onClick={() => navigate('/settings')}>
          Настройки
        </button>
      </nav>
    </div>
  );
}
