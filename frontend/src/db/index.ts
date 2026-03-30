import Dexie, { type Table } from 'dexie';

export interface StreamOffset {
  targetId: string;
  offset: number;
}

export interface AnalysisItem {
  id?: number;
  targetId: string;
  content: string;
  timestamp: number;
}

export interface UserPreference {
  key: string;
  value: unknown;
}

class LogzordDB extends Dexie {
  offsets!: Table<StreamOffset, string>;
  analysisItems!: Table<AnalysisItem, number>;
  preferences!: Table<UserPreference, string>;

  constructor() {
    super('logzord');
    this.version(1).stores({
      offsets: 'targetId, offset',
      analysisItems: '++id, targetId, timestamp',
      preferences: 'key',
    });
  }
}

export const db = new LogzordDB();
