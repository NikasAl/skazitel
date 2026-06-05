import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { db } from '../core/storage/db';
import type { Poem, ExerciseAttempt, Exercise, ExerciseType } from '../core/types';
import { EXERCISE_TYPE_INFO } from '../core/types';

// Творческие типы упражнений (дрели не показываем — это короткие ответы)
const CREATIVE_TYPES = new Set<string>([
  'rhythm', 'rhyme', 'metaphor', 'constraint',
  'deconstruction', 'phonetics', 'prose_to_poetry', 'anti_cliche',
]);

/** Объединённая запись для отображения */
interface PoemEntry {
  id: string;
  title: string;
  content: string;
  date: string;
  isDraft: boolean;
  source: 'poem' | 'exercise';
  exerciseType?: string;
  score?: number;
}

export default function PoemsScreen() {
  const navigate = useNavigate();
  const [poems, setPoems] = useState<Poem[]>([]);
  const [attempts, setAttempts] = useState<ExerciseAttempt[]>([]);
  const [exercises, setExercises] = useState<Record<string, Exercise>>({});

  useEffect(() => {
    Promise.all([
      db.poems.orderBy('createdAt').reverse().toArray(),
      db.attempts.orderBy('submittedAt').reverse().toArray(),
    ]).then(([p, a]) => {
      setPoems(p);
      setAttempts(a);
      // Загружаем упражнения для получения типа
      const ids = [...new Set(a.map((at) => at.exerciseId))];
      Promise.all(ids.map((id) => db.exercises.get(id))).then((exs) => {
        const map: Record<string, Exercise> = {};
        for (const ex of exs) {
          if (ex) map[ex.id] = ex;
        }
        setExercises(map);
      });
    });
  }, []);

  // Объединяем стихи из таблицы poems и из творческих попыток
  const entries = useMemo(() => {
    const seen = new Set<string>();
    const result: PoemEntry[] = [];

    // Сначала стихи из таблицы poems
    for (const poem of poems) {
      seen.add(poem.id);
      result.push({
        id: poem.id,
        title: poem.title || 'Без названия',
        content: poem.content,
        date: poem.createdAt,
        isDraft: poem.isDraft,
        source: 'poem',
      });
    }

    // Затем творческие попытки, которых нет в poems (для обратной совместимости)
    for (const attempt of attempts) {
      if (seen.has(attempt.id)) continue;
      if (!attempt.userResponse?.trim()) continue;

      const exercise = exercises[attempt.exerciseId];
      // Пропускаем дрели и попытки без типа упражнения
      if (!exercise || !CREATIVE_TYPES.has(exercise.type)) continue;

      result.push({
        id: attempt.id,
        title: exercise.type ? (EXERCISE_TYPE_INFO[exercise.type as ExerciseType]?.name ?? 'Упражнение') : 'Упражнение',
        content: attempt.userResponse.trim(),
        date: attempt.submittedAt,
        isDraft: attempt.review ? attempt.review.scores.overall < 40 : true,
        source: 'exercise',
        exerciseType: exercise.type,
        score: attempt.review?.scores.overall,
      });
    }

    // Сортируем по дате (новые сверху)
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return result;
  }, [poems, attempts, exercises]);

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
        <h1 className="text-xl font-bold text-ink">Мои стихи</h1>
      </header>

      {entries.length === 0 ? (
        <div className="card text-center text-dusk/50 py-12">
          <div className="text-4xl mb-4">📝</div>
          <p>Здесь будут стихи, которые ты напишешь</p>
          <p className="text-sm mt-2">Выполняй упражнения, чтобы сохранять свои работы</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-ink">{entry.title}</h3>
                <div className="flex items-center gap-2">
                  {entry.isDraft && <div className="badge">черновик</div>}
                  {entry.score !== undefined && (
                    <span className={`text-sm font-medium ${
                      entry.score >= 70 ? 'text-sage' :
                      entry.score >= 40 ? 'text-gold' :
                      'text-ember'
                    }`}>
                      {entry.score}/100
                    </span>
                  )}
                </div>
              </div>
              <div className="whitespace-pre-wrap text-dusk/70 font-serif leading-relaxed">
                {entry.content.length > 300
                  ? entry.content.substring(0, 300) + '...'
                  : entry.content}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-dusk/40">
                  {new Date(entry.date).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                {entry.source === 'exercise' && entry.exerciseType && (
                  <span className="text-xs text-dusk/30">
                    · {EXERCISE_TYPE_INFO[entry.exerciseType as ExerciseType]?.icon} {EXERCISE_TYPE_INFO[entry.exerciseType as ExerciseType]?.name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
