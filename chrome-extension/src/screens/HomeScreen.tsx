import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { db } from '../core/storage/db';
import {
  getRecentAttempts,
  getExerciseCountByTopic,
  addTopic,
  deleteTopic,
  setActiveTopicId,
  getActiveTopicId,
} from '../core/storage/repository';
import type { UserProfile, Topic, ExerciseAttempt } from '../core/types';
import { LEVEL_NAMES, LEVEL_XP_TABLE, EXERCISE_TYPE_INFO, EXERCISE_TYPES } from '../core/types';

export default function HomeScreen() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});
  const [activeTopicId, setActiveTopicIdState] = useState<string | undefined>(undefined);
  const [recentAttempts, setRecentAttempts] = useState<ExerciseAttempt[]>([]);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  const loadData = useCallback(async () => {
    const [p, t, attempts, activeId] = await Promise.all([
      db.profiles.toCollection().first(),
      db.topics.toArray(),
      getRecentAttempts(5),
      getActiveTopicId(),
    ]);
    setProfile(p ?? null);
    setTopics(t);
    setActiveTopicIdState(activeId);
    setRecentAttempts(attempts);

    // Динамический подсчёт упражнений по каждой теме
    const counts: Record<string, number> = {};
    for (const topic of t) {
      counts[topic.id] = await getExerciseCountByTopic(topic.id);
    }
    setTopicCounts(counts);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const xpProgress = profile
    ? ((profile.xp - (LEVEL_XP_TABLE[profile.level] ?? 0)) /
        ((LEVEL_XP_TABLE[profile.level + 1] ?? profile.xpToNextLevel) -
          (LEVEL_XP_TABLE[profile.level] ?? 0))) *
      100
    : 0;

  // Создание новой темы
  const handleAddTopic = async () => {
    const name = newTopicName.trim();
    if (!name) return;

    const topic = await addTopic({ name, isBuiltIn: false });
    setNewTopicName('');
    setShowAddTopic(false);

    // Если это первая тема — автоматически делаем её активной
    if (topics.length === 0) {
      await setActiveTopicId(topic.id);
    }

    await loadData();
  };

  // Удаление темы
  const handleDeleteTopic = async (topicId: string) => {
    await deleteTopic(topicId);

    // Если удалённая тема была активной — сбрасываем
    if (activeTopicId === topicId) {
      const remaining = topics.filter((t) => t.id !== topicId);
      const newActive = remaining[0]?.id;
      await setActiveTopicId(newActive);
    }

    await loadData();
  };

  // Выбор активной темы
  const handleSelectTopic = async (topicId: string) => {
    if (activeTopicId === topicId) return; // уже активна
    await setActiveTopicId(topicId);
    await loadData();
  };

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
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title mb-0">Мои темы</h2>
          <button
            onClick={() => setShowAddTopic(!showAddTopic)}
            className="text-sm text-ember hover:text-ember/80 transition-colors"
          >
            {showAddTopic ? 'Отмена' : '+ Добавить'}
          </button>
        </div>

        {/* Форма добавления новой темы */}
        {showAddTopic && (
          <div className="card mb-3 bg-dusk/5">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTopic()}
                placeholder="Название темы..."
                className="input-field flex-1 text-sm"
                autoFocus
              />
              <button
                onClick={handleAddTopic}
                disabled={!newTopicName.trim()}
                className="btn-primary px-4 text-sm disabled:opacity-40"
              >
                Создать
              </button>
            </div>
          </div>
        )}

        {topics.length === 0 && !showAddTopic ? (
          <div className="card text-center text-dusk/50 py-8">
            <p>Пока нет тем.</p>
            <button
              onClick={() => setShowAddTopic(true)}
              className="text-sm text-ember hover:text-ember/80 mt-2 underline"
            >
              Создать первую тему
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {topics.map((topic) => {
              const isActive = activeTopicId === topic.id;
              const count = topicCounts[topic.id] ?? 0;
              return (
                <div
                  key={topic.id}
                  className={`card flex items-center justify-between py-4 cursor-pointer transition-all ${
                    isActive
                      ? 'border-2 border-ember bg-ember/5'
                      : 'border-2 border-transparent hover:bg-dusk/5'
                  }`}
                  onClick={() => handleSelectTopic(topic.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Индикатор активной темы */}
                    <div
                      className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        isActive ? 'bg-ember' : 'bg-dusk/20'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-ink truncate">{topic.name}</div>
                      <div className="text-sm text-dusk/50">
                        {count === 0
                          ? 'нет упражнений'
                          : `${count} ${count === 1 ? 'упражнение' : count < 5 ? 'упражнения' : 'упражнений'}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isActive && (
                      <span className="badge bg-ember/20 text-ember text-xs">активна</span>
                    )}
                    {topic.isBuiltIn && <div className="badge">встроенная</div>}
                    {!topic.isBuiltIn && topics.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Удалить тему «${topic.name}» и все связанные упражнения?`)) {
                            handleDeleteTopic(topic.id);
                          }
                        }}
                        className="w-8 h-8 rounded-full hover:bg-ember/10 flex items-center
                          justify-center transition-colors text-dusk/40 hover:text-ember text-sm"
                        title="Удалить тему"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Подсказка */}
        {topics.length > 0 && (
          <p className="text-xs text-dusk/40 mt-2">
            Нажмите на тему, чтобы сделать её активной для генерации упражнений
          </p>
        )}
      </section>

      {/* Кнопка писательства */}
      <button
        className="btn-secondary w-full text-base py-3 mb-4 border-2 border-dashed border-dusk/20 hover:border-ember/40 hover:text-ember transition-colors"
        onClick={() => navigate('/writing')}
      >
        ✍️ Писательство — рабочий стол поэта
      </button>

      {/* Кнопка пайплайна */}
      <button
        className="btn-secondary w-full text-base py-3 mb-8 border-2 border-dashed border-gold/30 hover:border-gold/60 hover:text-gold transition-colors"
        onClick={() => navigate('/pipeline')}
      >
        🔬 Поэтический Пайплайн — исследовательский инструмент
      </button>

      {/* Навигация */}
      <nav className="mt-0 flex gap-3">
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
