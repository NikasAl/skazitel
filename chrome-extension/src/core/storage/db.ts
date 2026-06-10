import Dexie, { type Table } from 'dexie';
import type {
  UserProfile,
  Topic,
  Exercise,
  ExerciseAttempt,
  Poem,
  PipelineRun,
  PipelineStep,
} from '../types';

class SkazitelDB extends Dexie {
  profiles!: Table<UserProfile>;
  topics!: Table<Topic>;
  exercises!: Table<Exercise>;
  attempts!: Table<ExerciseAttempt>;
  poems!: Table<Poem>;
  pipelineRuns!: Table<PipelineRun>;
  pipelineSteps!: Table<PipelineStep>;

  constructor() {
    super('skazitel');

    this.version(1).stores({
      profiles: 'id, lastActiveDate',
      topics: 'id, isBuiltIn, createdAt',
      exercises: 'id, type, topicId, difficulty, createdAt',
      attempts: 'id, exerciseId, topicId, submittedAt',
      poems: 'id, topicId, isDraft, createdAt',
    });

    this.version(2).stores({
      profiles: 'id, lastActiveDate',
      topics: 'id, isBuiltIn, createdAt',
      exercises: 'id, type, topicId, difficulty, createdAt',
      attempts: 'id, exerciseId, topicId, submittedAt',
      poems: 'id, topicId, isDraft, createdAt',
      pipelineRuns: 'id, createdAt, status',
      pipelineSteps: 'id, runId, stepNumber, agentName, status',
    });
  }
}

export const db = new SkazitelDB();
