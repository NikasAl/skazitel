import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../core/storage/db';
import { deletePoem, deleteAttempt } from '../core/storage/repository';
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
  /** Есть ли у стиха критика от ИИ */
  hasCritic?: boolean;
  /** Текст отчёта критика */
  criticReport?: string;
  /** Это черновик из Писательства? */
  isWritingDraft?: boolean;
}

export default function PoemsScreen() {
  const navigate = useNavigate();
  const [poems, setPoems] = useState<Poem[]>([]);
  const [attempts, setAttempts] = useState<ExerciseAttempt[]>([]);
  const [exercises, setExercises] = useState<Record<string, Exercise>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** ID раскрытых карточек (полный текст) */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const [p, a] = await Promise.all([
      db.poems.orderBy('createdAt').reverse().toArray(),
      db.attempts.orderBy('submittedAt').reverse().toArray(),
    ]);
    setPoems(p);
    setAttempts(a);
    // Загружаем упражнения для получения типа
    const ids = [...new Set(a.map((at) => at.exerciseId))];
    const exs = await Promise.all(ids.map((id) => db.exercises.get(id)));
    const map: Record<string, Exercise> = {};
    for (const ex of exs) {
      if (ex) map[ex.id] = ex;
    }
    setExercises(map);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (entry: PoemEntry) => {
    if (entry.source === 'poem') {
      await deletePoem(entry.id);
    } else {
      await deleteAttempt(entry.id);
    }
    setConfirmDeleteId(null);
    await loadData();
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
        hasCritic: !!poem.criticReport,
        criticReport: poem.criticReport,
        isWritingDraft: poem.status === 'draft',
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
          <p className="text-sm mt-2">Выполняй упражнения или используй раздел «Писательство»</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            const isLong = entry.content.length > 300;

            return (
              <div key={entry.id} className="card group relative">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-ink flex items-center gap-2">
                    {entry.title}
                    {entry.hasCritic && (
                      <span className="text-xs" title="Есть отчёт критика">🔍</span>
                    )}
                    {entry.isWritingDraft && (
                      <span className="text-xs" title="Черновик из Писательства">✍️</span>
                    )}
                  </h3>
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
                    {/* Кнопка редактирования для черновиков из Писательства */}
                    {entry.isWritingDraft && (
                      <button
                        onClick={() => navigate('/writing', { state: { poemId: entry.id } })}
                        className="text-xs px-2 py-0.5 rounded bg-dusk/10 text-dusk
                          hover:bg-ember/10 hover:text-ember transition-colors"
                        title="Открыть в редакторе"
                      >
                        Редактировать
                      </button>
                    )}
                    {/* Кнопка удаления */}
                    {confirmDeleteId === entry.id ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-ember">Удалить?</span>
                        <button
                          onClick={() => handleDelete(entry)}
                          className="text-xs px-2 py-0.5 rounded bg-ember text-parchment hover:bg-ember/80 transition-colors"
                        >
                          Да
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs px-2 py-0.5 rounded bg-dusk/20 text-dusk hover:bg-dusk/30 transition-colors"
                        >
                          Нет
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        className="w-7 h-7 rounded-full opacity-0 group-hover:opacity-100
                          hover:bg-ember/10 flex items-center justify-center
                          transition-all text-dusk/40 hover:text-ember text-sm"
                        title="Удалить"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>

                {/* Текст стихотворения */}
                <div className="whitespace-pre-wrap text-dusk/70 font-serif leading-relaxed">
                  {isExpanded || !isLong
                    ? entry.content
                    : entry.content.substring(0, 300) + '...'}
                </div>

                {/* Кнопка раскрыть/свернуть */}
                {isLong && (
                  <button
                    onClick={() => toggleExpanded(entry.id)}
                    className="text-xs text-ember/70 hover:text-ember mt-1 transition-colors"
                  >
                    {isExpanded ? 'Свернуть ∧' : 'Читать далее ∨'}
                  </button>
                )}

                {/* Сохранённый отчёт критика */}
                {isExpanded && entry.criticReport && (
                  <div className="mt-3 p-3 bg-ink/5 rounded-lg border border-ink/10">
                    <div className="text-xs font-medium text-dusk/60 mb-2 flex items-center gap-1">
                      🔍 Отчёт критика
                    </div>
                    <div
                      className="text-sm text-ink/80 leading-relaxed prose-sm"
                      dangerouslySetInnerHTML={{
                        __html: entry.criticReport
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\n/g, '<br/>'),
                      }}
                    />
                  </div>
                )}

                {/* Метаданные */}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
