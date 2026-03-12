import type { DatabaseManager } from '@ooda-agent/storage';
import type { 
  Pattern, 
  PatternInput, 
  PatternAction, 
  PatternStats, 
  FlowType,
  IPatternRepository 
} from './types';

interface PatternRow {
  id: string;
  request_type: string;
  input_pattern: string;
  input_features: string;
  successful_actions: string;
  model_used: string;
  success_rate: number;
  usage_count: number;
  created_at: number;
  last_used_at: number;
  metadata: string;
}

export class PatternRepository implements IPatternRepository {
  private db: DatabaseManager;
  private initialized = false;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  initialize(): void {
    if (this.initialized) return;
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        request_type TEXT NOT NULL,
        input_pattern TEXT NOT NULL,
        input_features TEXT NOT NULL,
        successful_actions TEXT NOT NULL,
        model_used TEXT NOT NULL,
        success_rate REAL DEFAULT 1.0,
        usage_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        metadata TEXT
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_request_type ON patterns(request_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_success_rate ON patterns(success_rate DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_usage_count ON patterns(usage_count DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_patterns_last_used ON patterns(last_used_at DESC)`);
    
    this.initialized = true;
  }

  store(input: PatternInput): string {
    this.initialize();
    
    const id = `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    this.db.run(
      `INSERT INTO patterns (
        id, request_type, input_pattern, input_features, successful_actions,
        model_used, success_rate, usage_count, created_at, last_used_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.requestType,
        input.inputPattern,
        JSON.stringify(input.inputFeatures),
        JSON.stringify(input.successfulActions),
        input.modelUsed,
        1.0,
        0,
        now,
        now,
        JSON.stringify(input.metadata || {}),
      ]
    );
    
    return id;
  }

  findById(id: string): Pattern | null {
    this.initialize();
    
    const row = this.db.get('SELECT * FROM patterns WHERE id = ?', [id]) as PatternRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  findByRequestType(type: FlowType, limit: number = 10): Pattern[] {
    this.initialize();
    
    const rows = this.db.all(
      `SELECT * FROM patterns 
       WHERE request_type = ? 
       ORDER BY success_rate DESC, usage_count DESC, last_used_at DESC 
       LIMIT ?`,
      [type, limit]
    ) as PatternRow[];
    
    return rows.map(row => this.mapRow(row));
  }

  findSimilar(inputPattern: string, requestType?: FlowType, limit: number = 5): Pattern[] {
    this.initialize();
    
    let sql = `SELECT * FROM patterns WHERE input_pattern LIKE ?`;
    const params: unknown[] = [`%${inputPattern.slice(0, 100)}%`];
    
    if (requestType) {
      sql += ` AND request_type = ?`;
      params.push(requestType);
    }
    
    sql += ` ORDER BY success_rate DESC, usage_count DESC LIMIT ?`;
    params.push(limit);
    
    const rows = this.db.all(sql, params) as PatternRow[];
    return rows.map(row => this.mapRow(row));
  }

  updateUsage(id: string, success: boolean): boolean {
    this.initialize();
    
    const row = this.db.get(
      'SELECT usage_count, success_rate FROM patterns WHERE id = ?',
      [id]
    ) as { usage_count: number; success_rate: number } | undefined;
    
    if (!row) return false;
    
    const newUsageCount = row.usage_count + 1;
    const totalSuccesses = row.success_rate * row.usage_count;
    const newSuccessRate = success 
      ? (totalSuccesses + 1) / newUsageCount 
      : totalSuccesses / newUsageCount;
    
    this.db.run(
      `UPDATE patterns 
       SET usage_count = ?, success_rate = ?, last_used_at = ? 
       WHERE id = ?`,
      [newUsageCount, newSuccessRate, Date.now(), id]
    );
    
    return true;
  }

  delete(id: string): boolean {
    this.initialize();
    
    this.db.run('DELETE FROM patterns WHERE id = ?', [id]);
    return true;
  }

  cleanup(maxAge: number, maxPatterns: number): number {
    this.initialize();
    
    const cutoffTime = Date.now() - maxAge;
    let deletedCount = 0;
    
    const oldPatterns = this.db.all(
      'SELECT id FROM patterns WHERE created_at < ? AND success_rate < 0.5',
      [cutoffTime]
    ) as { id: string }[];
    
    for (const p of oldPatterns) {
      this.db.run('DELETE FROM patterns WHERE id = ?', [p.id]);
      deletedCount++;
    }
    
    const countRow = this.db.get('SELECT COUNT(*) as count FROM patterns') as { count: number } | undefined;
    const totalPatterns = countRow?.count || 0;
    
    if (totalPatterns > maxPatterns) {
      const excessPatterns = this.db.all(
        `SELECT id FROM patterns 
         ORDER BY success_rate ASC, usage_count ASC, last_used_at ASC 
         LIMIT ?`,
        [totalPatterns - maxPatterns]
      ) as { id: string }[];
      
      for (const p of excessPatterns) {
        this.db.run('DELETE FROM patterns WHERE id = ?', [p.id]);
        deletedCount++;
      }
    }
    
    return deletedCount;
  }

  getStats(): PatternStats {
    this.initialize();
    
    const statsRow = this.db.get(`
      SELECT 
        COUNT(*) as total_patterns,
        AVG(success_rate) as avg_success_rate,
        SUM(usage_count) as total_usage,
        COUNT(DISTINCT request_type) as unique_types
      FROM patterns
    `) as {
      total_patterns: number;
      avg_success_rate: number;
      total_usage: number;
      unique_types: number;
    } | undefined;
    
    const topTypes = this.db.all(`
      SELECT request_type as type, COUNT(*) as count
      FROM patterns
      GROUP BY request_type
      ORDER BY count DESC
      LIMIT 5
    `) as Array<{ type: string; count: number }>;
    
    const topModels = this.db.all(`
      SELECT model_used as model, COUNT(*) as count
      FROM patterns
      GROUP BY model_used
      ORDER BY count DESC
      LIMIT 5
    `) as Array<{ model: string; count: number }>;
    
    return {
      totalPatterns: statsRow?.total_patterns || 0,
      averageSuccessRate: statsRow?.avg_success_rate || 0,
      totalUsage: statsRow?.total_usage || 1,
      uniqueRequestTypes: statsRow?.unique_types || 1,
      topRequestTypes: topTypes,
      topModels: topModels,
    };
  }

  private mapRow(row: PatternRow): Pattern {
    return {
      id: row.id,
      requestType: row.request_type as FlowType,
      inputPattern: row.input_pattern,
      inputFeatures: JSON.parse(row.input_features),
      successfulActions: JSON.parse(row.successful_actions) as PatternAction[],
      modelUsed: row.model_used,
      successRate: row.success_rate,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }
}

let patternRepository: PatternRepository | null = null;

export function getPatternRepository(db?: DatabaseManager): PatternRepository {
  if (!patternRepository && db) {
    patternRepository = new PatternRepository(db);
  }
  if (!patternRepository) {
    throw new Error('PatternRepository not initialized. Call getPatternRepository with a DatabaseManager first.');
  }
  return patternRepository;
}

export function setPatternRepository(repo: PatternRepository): void {
  patternRepository = repo;
}
