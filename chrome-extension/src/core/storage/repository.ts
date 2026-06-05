import { db } from './db';
import type {
  UserProfile,
  Topic,
  Exercise,
  ExerciseAttempt,
  Poem,
  ExportBundle,
} from '../types';
import { getSettings, saveSettings } from './settings';

// ==================== Профиль ====================

/** Получить текущий профиль пользователя */
export async function getProfile(): Promise<UserProfile | undefined> {
  return db.profiles.toCollection().first();
}

/** Обновить поля профиля */
export async function updateProfile(updates: Partial<UserProfile>): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;
  await db.profiles.update(profile.id, updates);
}

/** Создать новый профиль */
export async function createProfile(profile: UserProfile): Promise<void> {
  await db.profiles.add(profile);
}

// ==================== Темы ====================

/** Получить все темы */
export async function getTopics(): Promise<Topic[]> {
  return db.topics.toArray();
}

/** Добавить новую тему (генерирует id, createdAt, exerciseCount) */
export async function addTopic(topic: Omit<Topic, 'id' | 'createdAt' | 'exerciseCount'>): Promise<Topic> {
  const newTopic: Topic = {
    id: crypto.randomUUID(),
    name: topic.name,
    isBuiltIn: topic.isBuiltIn ?? false,
    createdAt: new Date().toISOString(),
    exerciseCount: 0,
  };
  await db.topics.add(newTopic);
  return newTopic;
}

/** Удалить тему и все связанные упражнения/попытки */
export async function deleteTopic(id: string): Promise<void> {
  await db.topics.delete(id);
  // Удаляем также связанные упражнения и попытки
  await db.exercises.where('topicId').equals(id).delete();
  await db.attempts.where('topicId').equals(id).delete();
}

/** Увеличить счётчик упражнений в теме */
export async function incrementTopicExerciseCount(topicId: string): Promise<void> {
  const topic = await db.topics.get(topicId);
  if (topic) {
    await db.topics.update(topicId, { exerciseCount: topic.exerciseCount + 1 });
  }
}

// ==================== Упражнения ====================

/** Получить упражнение по id */
export async function getExercise(id: string): Promise<Exercise | undefined> {
  return db.exercises.get(id);
}

/** Добавить новое упражнение (генерирует id, createdAt) */
export async function addExercise(exercise: Omit<Exercise, 'id' | 'createdAt'>): Promise<Exercise> {
  const newExercise: Exercise = {
    ...exercise,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await db.exercises.add(newExercise);
  return newExercise;
}

/** Получить все упражнения по теме */
export async function getExercisesByTopic(topicId: string): Promise<Exercise[]> {
  return db.exercises.where('topicId').equals(topicId).toArray();
}

/** Получить количество упражнений по теме (точный подсчёт из БД) */
export async function getExerciseCountByTopic(topicId: string): Promise<number> {
  return db.exercises.where('topicId').equals(topicId).count();
}

/** Обновить активную тему в настройках */
export async function setActiveTopicId(topicId: string | undefined): Promise<void> {
  const { getSettings, saveSettings } = await import('./settings');
  const settings = await getSettings();
  await saveSettings({ ...settings, activeTopicId: topicId });
}

/** Получить идентификатор активной темы */
export async function getActiveTopicId(): Promise<string | undefined> {
  const { getSettings } = await import('./settings');
  const settings = await getSettings();
  return settings.activeTopicId;
}

/** Получить все упражнения (сначала свежие) */
export async function getAllExercises(): Promise<Exercise[]> {
  return db.exercises.orderBy('createdAt').reverse().toArray();
}

/** Получить все упражнения по типу */
export async function getExercisesByType(type: string): Promise<Exercise[]> {
  return db.exercises.where('type').equals(type).toArray();
}

/** Удалить упражнение и связанные попытки */
export async function deleteExercise(id: string): Promise<void> {
  await db.attempts.where('exerciseId').equals(id).delete();
  await db.exercises.delete(id);
}

/** Удалить попытку */
export async function deleteAttempt(id: string): Promise<void> {
  await db.attempts.delete(id);
}

/** Обновить упражнение */
export async function updateExercise(id: string, updates: Partial<Exercise>): Promise<void> {
  await db.exercises.update(id, updates);
}

// ==================== Попытки ====================

/** Добавить новую попытку (генерирует id, submittedAt) */
export async function addAttempt(attempt: Omit<ExerciseAttempt, 'id' | 'submittedAt'>): Promise<ExerciseAttempt> {
  const newAttempt: ExerciseAttempt = {
    ...attempt,
    id: crypto.randomUUID(),
    submittedAt: new Date().toISOString(),
  };
  await db.attempts.add(newAttempt);
  return newAttempt;
}

/** Получить все попытки по теме */
export async function getAttemptsByTopic(topicId: string): Promise<ExerciseAttempt[]> {
  return db.attempts.where('topicId').equals(topicId).toArray();
}

/** Получить последние N попыток (по всем темам) */
export async function getRecentAttempts(limit: number = 3): Promise<ExerciseAttempt[]> {
  return db.attempts.orderBy('submittedAt').reverse().limit(limit).toArray();
}

/** Получить последние N попыток по конкретной теме */
export async function getRecentAttemptsByTopic(topicId: string, limit: number = 3): Promise<ExerciseAttempt[]> {
  return db.attempts
    .where('topicId')
    .equals(topicId)
    .reverse()
    .sortBy('submittedAt')
    .then((arr) => arr.slice(0, limit));
}

// ==================== Стихи ====================

/** Получить все стихи (сначала свежие) */
export async function getPoems(): Promise<Poem[]> {
  return db.poems.orderBy('createdAt').reverse().toArray();
}

/** Добавить новый стих (генерирует id, createdAt, updatedAt) */
export async function addPoem(poem: Omit<Poem, 'id' | 'createdAt' | 'updatedAt'>): Promise<Poem> {
  const newPoem: Poem = {
    ...poem,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.poems.add(newPoem);
  return newPoem;
}

/** Обновить стих (автоматически обновляет updatedAt) */
export async function updatePoem(id: string, updates: Partial<Poem>): Promise<void> {
  await db.poems.update(id, { ...updates, updatedAt: new Date().toISOString() });
}

/** Удалить стих */
export async function deletePoem(id: string): Promise<void> {
  await db.poems.delete(id);
}

// ==================== Экспорт / Импорт ====================

/** Собрать все данные в единый бэкап (без API-ключей) */
export async function exportAllData(): Promise<ExportBundle> {
  const profile = await getProfile();
  const settings = await getSettings();
  const topics = await getTopics();
  const exercises = await db.exercises.toArray();
  const attempts = await db.attempts.toArray();
  const poems = await getPoems();

  return {
    version: '0.1.0',
    exportedAt: new Date().toISOString(),
    profile: profile ?? {
      id: '',
      createdAt: '',
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      streak: 0,
      longestStreak: 0,
      lastActiveDate: '',
      difficultyPreference: 1,
      completedExercises: 0,
      successfulExercises: 0,
    },
    settings: { ...settings, apiProvider: null }, // API-ключи никогда не попадают в бэкап
    topics,
    exercises,
    attempts,
    poems,
  };
}

/** Импортировать данные из бэкапа (заменяет текущие данные) */
export async function importData(bundle: ExportBundle): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  try {
    // Очищаем существующие данные
    await db.profiles.clear();
    await db.topics.clear();
    await db.exercises.clear();
    await db.attempts.clear();
    await db.poems.clear();

    // Импортируем профиль
    if (bundle.profile && bundle.profile.id) {
      await db.profiles.add(bundle.profile);
      imported++;
    }

    // Импортируем настройки (кроме провайдера — API-ключ нужно ввести заново)
    if (bundle.settings) {
      const currentSettings = await getSettings();
      await saveSettings({
        ...currentSettings,
        defaultDifficulty: bundle.settings.defaultDifficulty,
        dailyGoal: bundle.settings.dailyGoal,
        isOnboarded: true, // Если есть бэкап — пользователь уже проходил онбординг
      });
    }

    // Импортируем темы
    if (bundle.topics?.length) {
      await db.topics.bulkAdd(bundle.topics);
      imported += bundle.topics.length;
    }

    // Импортируем упражнения
    if (bundle.exercises?.length) {
      await db.exercises.bulkAdd(bundle.exercises);
      imported += bundle.exercises.length;
    }

    // Импортируем попытки
    if (bundle.attempts?.length) {
      await db.attempts.bulkAdd(bundle.attempts);
      imported += bundle.attempts.length;
    }

    // Импортируем стихи
    if (bundle.poems?.length) {
      await db.poems.bulkAdd(bundle.poems);
      imported += bundle.poems.length;
    }
  } catch (e) {
    errors.push(`Ошибка импорта: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { imported, errors };
}
