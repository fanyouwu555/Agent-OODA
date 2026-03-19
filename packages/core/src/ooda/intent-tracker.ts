// packages/core/src/ooda/intent-tracker.ts
// 意图识别追踪模块 - 追踪意图识别的准确率

import { getIntentRegistry, RecognitionResult } from './intent-registry.js';

export interface IntentRecord {
  id: string;
  input: string;
  recognizedIntent: string;
  confidence: number;
  timestamp: number;
  sessionId?: string;
}

export interface IntentCorrection {
  id: string;
  originalIntent: string;
  correctedIntent: string;
  correctionReason?: string;
  timestamp: number;
}

export interface IntentStats {
  intentType: string;
  totalRecognitions: number;
  corrections: number;
  accuracy: number;
  avgConfidence: number;
  examples: { input: string; corrected: boolean }[];
}

export class IntentTracker {
  private records: IntentRecord[] = [];
  private corrections: IntentCorrection[] = [];
  private idCounter: number = 0;

  generateId(): string {
    return `intent-${Date.now()}-${++this.idCounter}`;
  }

  recordRecognition(
    input: string,
    result: RecognitionResult,
    sessionId?: string
  ): string {
    const id = this.generateId();

    const record: IntentRecord = {
      id,
      input,
      recognizedIntent: result.intentType,
      confidence: result.confidence,
      timestamp: Date.now(),
      sessionId,
    };

    this.records.push(record);
    return id;
  }

  recordCorrection(
    recordId: string,
    correctedIntent: string,
    correctionReason?: string
  ): void {
    const record = this.records.find(r => r.id === recordId);
    if (!record) {
      console.warn(`[IntentTracker] Record not found: ${recordId}`);
      return;
    }

    const correction: IntentCorrection = {
      id: recordId,
      originalIntent: record.recognizedIntent,
      correctedIntent,
      correctionReason,
      timestamp: Date.now(),
    };

    this.corrections.push(correction);
  }

  getCorrectionCount(intentType?: string): number {
    if (intentType) {
      return this.corrections.filter(c => c.originalIntent === intentType).length;
    }
    return this.corrections.length;
  }

  getAccuracy(intentType?: string): number {
    const relevantRecords = intentType
      ? this.records.filter(r => r.recognizedIntent === intentType)
      : this.records;

    if (relevantRecords.length === 0) return 0;

    const correctedIds = new Set(this.corrections.map(c => c.id));
    const correctCount = relevantRecords.filter(r => !correctedIds.has(r.id)).length;

    return correctCount / relevantRecords.length;
  }

  getStats(): IntentStats[] {
    const grouped = new Map<string, IntentRecord[]>();

    for (const record of this.records) {
      const list = grouped.get(record.recognizedIntent) || [];
      list.push(record);
      grouped.set(record.recognizedIntent, list);
    }

    const correctedIds = new Set(this.corrections.map(c => c.id));

    const result: IntentStats[] = [];

    for (const [intentType, list] of grouped) {
      const corrections = this.corrections.filter(c => c.originalIntent === intentType);
      const correctCount = list.filter(r => !correctedIds.has(r.id)).length;

      result.push({
        intentType,
        totalRecognitions: list.length,
        corrections: corrections.length,
        accuracy: list.length > 0 ? correctCount / list.length : 0,
        avgConfidence: list.reduce((acc, r) => acc + r.confidence, 0) / list.length,
        examples: list.slice(-5).map(r => ({
          input: r.input.substring(0, 50),
          corrected: correctedIds.has(r.id),
        })),
      });
    }

    return result.sort((a, b) => b.totalRecognitions - a.totalRecognitions);
  }

  getConfusionMatrix(): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();

    for (const correction of this.corrections) {
      if (!matrix.has(correction.originalIntent)) {
        matrix.set(correction.originalIntent, new Map());
      }
      const row = matrix.get(correction.originalIntent)!;
      row.set(
        correction.correctedIntent,
        (row.get(correction.correctedIntent) || 0) + 1
      );
    }

    return matrix;
  }

  getRecentRecords(limit: number = 20): IntentRecord[] {
    return this.records.slice(-limit);
  }

  getRecentCorrections(limit: number = 10): IntentCorrection[] {
    return this.corrections.slice(-limit);
  }

  getMostConfusedIntents(limit: number = 5): { from: string; to: string; count: number }[] {
    const confusion: Map<string, Map<string, number>> = new Map();

    for (const correction of this.corrections) {
      const key = `${correction.originalIntent}→${correction.correctedIntent}`;
      const parts = key.split('→');

      if (!confusion.has(parts[0])) {
        confusion.set(parts[0], new Map());
      }
      const row = confusion.get(parts[0])!;
      row.set(parts[1], (row.get(parts[1]) || 0) + 1);
    }

    const result: { from: string; to: string; count: number }[] = [];

    for (const [from, row] of confusion) {
      for (const [to, count] of row) {
        result.push({ from, to, count });
      }
    }

    return result.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  reset(): void {
    this.records = [];
    this.corrections = [];
    this.idCounter = 0;
  }

  exportData(): { records: IntentRecord[]; corrections: IntentCorrection[] } {
    return {
      records: [...this.records],
      corrections: [...this.corrections],
    };
  }

  importData(data: { records: IntentRecord[]; corrections: IntentCorrection[] }): void {
    this.records = [...data.records];
    this.corrections = [...data.corrections];
    this.idCounter = Math.max(
      0,
      ...this.records.map(r => parseInt(r.id.split('-')[2] || '0')),
      ...this.corrections.map(c => parseInt(c.id.split('-')[2] || '0'))
    );
  }
}

// 全局意图追踪器实例
const globalTracker = new IntentTracker();

export function getIntentTracker(): IntentTracker {
  return globalTracker;
}

export function resetIntentTracker(): void {
  globalTracker.reset();
}
