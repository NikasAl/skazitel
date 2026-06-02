import Dexie, { type Table } from 'dexie';
import type {
  UserProfile,
  Topic,
  Exercise,
  ExerciseAttempt,
  Poem,
} from '../types';

class SkazitelDB extends Dexie {
  profiles!: Table<UserProfile>;
  topics!: Table<Topic>;
  exercises!: Table<Exercise>;
  attempts!: Table<ExerciseAttempt>;
  poems!: Table<Poem>;

  constructor() {
    super('skazitel');

    this.version(1).stores({
      profiles: 'id, lastActiveDate',
      topics: 'id, isBuiltIn, createdAt',
      exercises: 'id, type, topicId, difficulty, createdAt',
      attempts: 'id, exerciseId, topicId, submittedAt',
      poems: 'id, topicId, isDraft, createdAt',
    });
  }
}

export const db = new SkazitelDB();
