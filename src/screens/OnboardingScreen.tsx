import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { db } from '../core/storage/db';
import { getSettings, saveSettings } from '../core/storage/settings';
import { LEVEL_XP_TABLE } from '../core/types';
import type { UserProfile } from '../core/types';

export default function OnboardingScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'welcome' | 'level' | 'topic'>('welcome');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(1);
  const [topic, setTopic] = useState('');

  const handleFinish = async () => {
    // Создаём профиль
    const profile: UserProfile = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      level: 1,
      xp: 0,
      xpToNextLevel: LEVEL_XP_TABLE[2],
      streak: 0,
      longestStreak: 0,
      lastActiveDate: new Date().toISOString().split('T')[0],
      difficultyPreference: difficulty,
      completedExercises: 0,
      successfulExercises: 0,
    };

    await db.profiles.add(profile);

    // Сохраняем тему
    if (topic.trim()) {
      await db.topics.add({
        id: crypto.randomUUID(),
        name: topic.trim(),
        isBuiltIn: false,
        createdAt: new Date().toISOString(),
        exerciseCount: 0,
      });
    }

    // Отмечаем онбординг
    const currentSettings = await getSettings();
    await saveSettings({
      ...currentSettings,
      isOnboarded: true,
      defaultDifficulty: difficulty,
    });

    navigate('/');
  };

  return (
    <div className="screen-container flex flex-col items-center justify-center min-h-screen">
      {/* Приветствие */}
      {step === 'welcome' && (
        <div className="card max-w-lg w-full text-center space-y-6">
          <div className="text-5xl mb-4">📖</div>
          <h1 className="text-3xl font-bold text-ink">Добро пожаловать в Сказитель</h1>
          <p className="text-dusk/70 leading-relaxed">
            Тренажёр стихосложения с ИИ-наставником. Развивай ритм, рифму, метафоры
            и другие навыки поэтического ремесла через геймификацию.
          </p>
          <div className="space-y-3 text-left text-sm text-dusk/60">
            <p>Все данные хранятся локально на твоём устройстве.</p>
            <p>Нейросети подключаются через твой API-ключ.</p>
          </div>
          <button className="btn-primary w-full" onClick={() => setStep('level')}>
            Начать путь
          </button>
        </div>
      )}

      {/* Выбор уровня */}
      {step === 'level' && (
        <div className="card max-w-lg w-full space-y-6">
          <h2 className="text-2xl font-bold text-ink text-center">Твой опыт в стихах</h2>
          <p className="text-dusk/60 text-center">
            Это поможет подобрать упражнения подходящей сложности.
          </p>
          <div className="space-y-3">
            {([
              { value: 1 as const, label: 'Начинающий', desc: 'Только начинаю знакомиться с поэзией' },
              { value: 2 as const, label: 'Средний', desc: 'Пишу стихи, хочу улучшить технику' },
              { value: 3 as const, label: 'Продвинутый', desc: 'Уверенно владею формой, хочу новых вызовов' },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDifficulty(opt.value)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  difficulty === opt.value
                    ? 'border-ember bg-ember/5'
                    : 'border-dusk/10 hover:border-dusk/30'
                }`}
              >
                <div className="font-medium text-ink">{opt.label}</div>
                <div className="text-sm text-dusk/60 mt-1">{opt.desc}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setStep('welcome')}>
              Назад
            </button>
            <button className="btn-primary flex-1" onClick={() => setStep('topic')}>
              Далее
            </button>
          </div>
        </div>
      )}

      {/* Ввод темы */}
      {step === 'topic' && (
        <div className="card max-w-lg w-full space-y-6">
          <h2 className="text-2xl font-bold text-ink text-center">О чём хочешь писать?</h2>
          <p className="text-dusk/60 text-center">
            Введи тему для первых упражнений. Можно изменить позже.
          </p>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Например: осенний город, первая любовь, путь..."
            className="input-field"
            autoFocus
          />
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => setStep('level')}>
              Назад
            </button>
            <button className="btn-primary flex-1" onClick={handleFinish}>
              Начать
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
