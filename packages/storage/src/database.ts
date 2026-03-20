import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT,
  title TEXT,
  summary TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  archived_at INTEGER
);

CREATE TABLE IF NOT EXISTS session_tags (
  session_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_metadata (
  session_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, key),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  args TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
  result TEXT,
  error TEXT,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS long_term_memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding TEXT,
  type TEXT NOT NULL CHECK(type IN ('fact', 'experience', 'skill', 'preference')),
  source TEXT NOT NULL,
  tags TEXT NOT NULL,
  related_ids TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  created_at INTEGER NOT NULL,
  last_accessed INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(message_id);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON long_term_memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_type ON long_term_memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON long_term_memories(last_accessed);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_title ON sessions(title);
CREATE INDEX IF NOT EXISTS idx_sessions_summary ON sessions(summary);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_name ON agent_configs(name);

CREATE TABLE IF NOT EXISTS permission_configs (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  config_type TEXT NOT NULL CHECK(config_type IN ('global', 'agent', 'group')),
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agent_configs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_permission_configs_agent ON permission_configs(agent_id);
CREATE INDEX IF NOT EXISTS idx_permission_configs_type ON permission_configs(config_type);
`;

export class DatabaseManager {
  private db: SqlJsDatabase | null = null;
  private SQL: SqlJsStatic | null = null;
  private dbPath: string;
  private initialized = false;
  private pendingWrites: Array<{ sql: string; params: any[] }> = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private autoSave: boolean = true;
  private flushIntervalMs: number = 5000;
  private maxPendingWrites: number = 100;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.db.run(INIT_SQL);
    
    // 迁移：为旧数据库添加新列
    try {
      const columns = this.db.exec("PRAGMA table_info(sessions)");
      if (columns.length > 0) {
        const columnNames = columns[0].values.map((col: any) => col[1]);
        if (!columnNames.includes('title')) {
          this.db.run('ALTER TABLE sessions ADD COLUMN title TEXT');
        }
        if (!columnNames.includes('summary')) {
          this.db.run('ALTER TABLE sessions ADD COLUMN summary TEXT');
        }
        if (!columnNames.includes('status')) {
          this.db.run("ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'active'");
        }
        if (!columnNames.includes('archived_at')) {
          this.db.run('ALTER TABLE sessions ADD COLUMN archived_at INTEGER');
        }
      }
    } catch (e) {
      console.log('[Storage] Migration check skipped:', (e as Error).message);
    }
    
    this.save();
    
    this.startFlushTimer();
    
    this.initialized = true;
    console.log(`[Storage] Database initialized at ${this.dbPath}`);
  }

  getDatabase(): SqlJsDatabase | null {
    return this.db;
  }

  save(): void {
    if (this.db && this.dbPath) {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    }
  }

  close(): void {
    this.stopFlushTimer();
    this.flush();
    this.save();
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[Storage] Database closed');
    }
  }

  run(sql: string, params: any[] = []): { changes: number } {
    if (!this.db) throw new Error('Database not initialized');
    
    if (this.autoSave) {
      this.pendingWrites.push({ sql, params });
      
      if (this.pendingWrites.length >= this.maxPendingWrites) {
        this.flushAsync();
      }
      return { changes: 0 };
    } else {
      this.db.run(sql, params);
      const changes = this.db.getRowsModified();
      return { changes };
    }
  }

  runImmediate(sql: string, params: any[] = []): { changes: number } {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(sql, params);
    this.save();
    const changes = this.db.getRowsModified();
    return { changes };
  }

  /** 同步刷新（保持兼容） */
  flush(): void {
    this.flushSync();
  }

  /** 异步刷新 - 不阻塞主线程 */
  async flushAsync(): Promise<void> {
    if (!this.db || this.pendingWrites.length === 0) return;
    
    const writes = [...this.pendingWrites];
    this.pendingWrites = [];
    
    // 使用 setImmediate 将写入操作推迟到下一个事件循环
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          this.db!.run('BEGIN TRANSACTION');
          
          for (const { sql, params } of writes) {
            this.db!.run(sql, params);
          }
          
          this.db!.run('COMMIT');
          this.save();
          resolve();
        } catch (error) {
          this.db!.run('ROLLBACK');
          console.error('[Storage] Batch write failed:', error);
          // 失败时将写回队列
          this.pendingWrites = [...writes, ...this.pendingWrites];
          reject(error);
        }
      });
    });
  }

  /** 同步刷新 */
  private flushSync(): void {
    if (!this.db || this.pendingWrites.length === 0) return;
    
    const writes = [...this.pendingWrites];
    this.pendingWrites = [];
    
    try {
      this.db.run('BEGIN TRANSACTION');
      
      for (const { sql, params } of writes) {
        this.db.run(sql, params);
      }
      
      this.db.run('COMMIT');
      this.save();
    } catch (error) {
      this.db.run('ROLLBACK');
      console.error('[Storage] Batch write failed:', error);
      this.pendingWrites = [...writes, ...this.pendingWrites];
      throw error;
    }
  }

  get(sql: string, params: any[] = []): any | undefined {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  }

  all(sql: string, params: any[] = []): any[] {
    if (!this.db) throw new Error('Database not initialized');
    const results: any[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
}
