import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import type { Exercise, ExerciseType } from '../core/types';
import { EXERCISE_TYPE_INFO } from '../core/types';
import {
  getAllExercises,
  deleteExercise,
  updateExercise,
} from '../core/storage/repository';

const DRILL_TYPES: ExerciseType[] = [
  'syllable_count',
  'stress_pattern',
  'rhyme_match',
  'line_builder',
];

type FilterType = 'all' | 'drills' | 'exercises';

export default function LibraryScreen() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [filterByType, setFilterByType] = useState<ExerciseType | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadExercises = useCallback(async () => {
    setIsLoading(true);
    const all = await getAllExercises();
    setExercises(all);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  // Фильтрация
  const filtered = exercises.filter((e) => {
    // По категории
    if (filter === 'drills' && !DRILL_TYPES.includes(e.type)) return false;
    if (filter === 'exercises' && DRILL_TYPES.includes(e.type)) return false;
    // По конкретному типу
    if (filterByType !== 'all' && e.type !== filterByType) return false;
    return true;
  });

  // Все уникальные типы упражнений (из базы)
  const typesInDb = [...new Set(exercises.map((e) => e.type))];

  const handleDelete = async (id: string) => {
    await deleteExercise(id);
    setConfirmDeleteId(null);
    await loadExercises();
  };

  const handleStartEdit = (exercise: Exercise) => {
    setEditingId(exercise.id);
    // Для дрелей редактируем question + explanation, для обычных — instruction
    if (exercise.drillData) {
      setEditText(
        `Вопрос: ${exercise.drillData.question}\nВарианты:\n${exercise.drillData.options.map((o, i) => `  ${i + 1}. ${o}`).join('\n')}\nПравильный ответ: ${exercise.drillData.correctIndex + 1}\nПояснение: ${exercise.drillData.explanation}`,
      );
    } else {
      setEditText(exercise.instruction);
    }
  };

  const handleSaveEdit = async (id: string) => {
    const exercise = exercises.find((e) => e.id === id);
    if (!exercise) return;

    if (exercise.drillData) {
      // Парсим текстовый формат обратно в drillData — пока просто сохраняем instruction
      await updateExercise(id, { instruction: editText });
    } else {
      await updateExercise(id, { instruction: editText });
    }
    setEditingId(null);
    await loadExercises();
  };

  const handleRepeat = (exercise: Exercise) => {
    navigate('/exercise', {
      state: { exerciseType: exercise.type, presetExercise: exercise },
    });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
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
        <h1 className="text-xl font-bold text-ink">Библиотека упражнений</h1>
        <span className="ml-auto badge">{filtered.length}</span>
      </header>

      {/* Фильтры */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'all' as FilterType, label: 'Все' },
          { key: 'drills' as FilterType, label: 'Дрели' },
          { key: 'exercises' as FilterType, label: 'Творческие' },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setFilterByType('all'); }}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              filter === f.key
                ? 'bg-dusk text-parchment font-medium'
                : 'bg-dusk/10 text-dusk/60 hover:bg-dusk/20'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Фильтр по конкретному типу */}
      {typesInDb.length > 1 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilterByType('all')}
            className={`text-xs px-2 py-1 rounded-full transition-colors ${
              filterByType === 'all'
                ? 'bg-gold/20 text-gold font-medium'
                : 'bg-dusk/5 text-dusk/40 hover:bg-dusk/10'
            }`}
          >
            все типы
          </button>
          {typesInDb.map((type) => {
            const info = EXERCISE_TYPE_INFO[type];
            return (
              <button
                key={type}
                onClick={() => setFilterByType(type)}
                className={`text-xs px-2 py-1 rounded-full transition-colors flex items-center gap-1 ${
                  filterByType === type
                    ? 'bg-gold/20 text-gold font-medium'
                    : 'bg-dusk/5 text-dusk/40 hover:bg-dusk/10'
                }`}
              >
                {info?.icon} {info?.name ?? type}
              </button>
            );
          })}
        </div>
      )}

      {/* Загрузка */}
      {isLoading && (
        <div className="card text-center py-12">
          <div className="text-3xl mb-4 animate-pulse">📚</div>
          <p className="text-dusk/70">Загружаем библиотеку...</p>
        </div>
      )}

      {/* Пусто */}
      {!isLoading && filtered.length === 0 && (
        <div className="card text-center py-12">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-dusk/70 mb-2">
            {exercises.length === 0
              ? 'Библиотека пуста'
              : 'Нет упражнений по выбранному фильтру'}
          </p>
          <p className="text-dusk/40 text-sm mb-6">
            {exercises.length === 0
              ? 'Сгенерируйте упражнения через LLM — они сохранятся здесь автоматически'
              : 'Попробуйте изменить фильтр'}
          </p>
          <button
            className="btn-primary"
            onClick={() => navigate('/exercise')}
          >
            Создать упражнение
          </button>
        </div>
      )}

      {/* Список упражнений */}
      {!isLoading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((exercise) => {
            const info = EXERCISE_TYPE_INFO[exercise.type];
            const isDrill = exercise.drillData != null;
            const isEditing = editingId === exercise.id;
            const isConfirmDelete = confirmDeleteId === exercise.id;

            return (
              <div
                key={exercise.id}
                className={`card transition-all ${
                  isDrill ? 'border-l-2 border-l-sage' : 'border-l-2 border-l-ember'
                }`}
              >
                {/* Шапка карточки */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg">{info?.icon ?? '📝'}</span>
                    <span className="font-medium text-ink text-sm">
                      {info?.name ?? exercise.type}
                    </span>
                    <span className="badge text-xs">
                      {exercise.difficulty}/10
                    </span>
                    {isDrill && (
                      <span className="badge bg-sage/20 text-sage text-xs">дрель</span>
                    )}
                  </div>
                  <span className="text-xs text-dusk/40 whitespace-nowrap">
                    {formatDate(exercise.createdAt)}
                  </span>
                </div>

                {/* Редактирование */}
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="input-field min-h-[120px] text-sm font-serif"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn-primary text-sm py-2"
                        onClick={() => handleSaveEdit(exercise.id)}
                      >
                        Сохранить
                      </button>
                      <button
                        className="btn-secondary text-sm py-2"
                        onClick={() => setEditingId(null)}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Полное задание */}
                    {isDrill && exercise.drillData ? (
                      <div className="bg-dusk/5 rounded-lg p-3 mb-3">
                        <p className="text-sm text-dusk/80 font-serif leading-relaxed mb-2">
                          {exercise.drillData.question}
                        </p>
                        <div className="space-y-1 mb-2">
                          {exercise.drillData.options.map((opt, i) => (
                            <div
                              key={i}
                              className={`text-xs font-serif px-2 py-1 rounded ${
                                i === exercise.drillData!.correctIndex
                                  ? 'bg-sage/15 text-sage'
                                  : 'text-dusk/50'
                              }`}
                            >
                              {String.fromCharCode(1040 + i)}. {opt}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-dusk/40 italic">
                          {exercise.drillData.explanation}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-dusk/5 rounded-lg p-3 mb-3">
                        <p className="text-sm text-dusk/80 font-serif leading-relaxed whitespace-pre-wrap">
                          {exercise.instruction}
                        </p>
                        {exercise.successCriteria && Array.isArray(exercise.successCriteria) && exercise.successCriteria.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-dusk/10">
                            <p className="text-xs text-dusk/40 mb-1">Критерии успеха:</p>
                            <ul className="text-xs text-dusk/50 space-y-0.5">
                              {exercise.successCriteria.map((c, i) => (
                                <li key={i} className="flex items-start gap-1">
                                  <span className="text-gold/60">•</span> {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Подтверждение удаления */}
                    {isConfirmDelete ? (
                      <div className="flex items-center gap-2 py-2">
                        <span className="text-sm text-ember">Удалить?</span>
                        <button
                          className="text-xs px-3 py-1 rounded bg-ember text-parchment"
                          onClick={() => handleDelete(exercise.id)}
                        >
                          Да
                        </button>
                        <button
                          className="text-xs px-3 py-1 rounded bg-dusk/10 text-dusk"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Нет
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          className="text-xs px-3 py-1.5 rounded bg-gold/10 text-gold
                            hover:bg-gold/20 transition-colors font-medium"
                          onClick={() => handleRepeat(exercise)}
                        >
                          Повторить
                        </button>
                        <button
                          className="text-xs px-3 py-1.5 rounded bg-dusk/10 text-dusk/60
                            hover:bg-dusk/20 transition-colors"
                          onClick={() => handleStartEdit(exercise)}
                        >
                          Редактировать
                        </button>
                        <button
                          className="text-xs px-3 py-1.5 rounded bg-ember/10 text-ember
                            hover:bg-ember/20 transition-colors ml-auto"
                          onClick={() => setConfirmDeleteId(exercise.id)}
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Кнопка снизу — создать новое */}
      {!isLoading && filtered.length > 0 && (
        <div className="mt-6">
          <button
            className="btn-primary w-full"
            onClick={() => navigate('/exercise')}
          >
            Создать новое упражнение
          </button>
        </div>
      )}
    </div>
  );
}
