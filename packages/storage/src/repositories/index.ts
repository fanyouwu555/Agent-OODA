import type { DatabaseManager } from '../database.js';
import type { SessionRecord, MessageRecord, ToolCallRecord, MemoryRecord, CreateMemoryInput, UserRecord } from '../types.js';

interface SessionRow {
  id: string;
  created_at: number;
  updated_at: number | null;
  metadata: string | null;
  title: string | null;
  summary: string | null;
  status: string | null;
  archived_at: number | null;
}



interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
}

interface ToolCallRow {
  id: string;
  message_id: string;
  tool_name: string;
  args: string;
  status: string;
  result: string | null;
  error: string | null;
  start_time: number;
  end_time: number | null;
}

interface MemoryRow {
  id: string;
  content: string;
  embedding: string | null;
  type: string;
  source: string;
  tags: string;
  related_ids: string;
  importance: number;
  created_at: number;
  last_accessed: number;
}

export class SessionRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  create(input: { id: string; metadata?: Record<string, unknown>; title?: string }): SessionRecord {
    const now = Date.now();
    this.db.runImmediate(
      'INSERT INTO sessions (id, created_at, updated_at, metadata, title, status) VALUES (?, ?, ?, ?, ?, ?)',
      [input.id, now, now, input.metadata ? JSON.stringify(input.metadata) : null, input.title || null, 'active']
    );
    return { id: input.id, createdAt: now, updatedAt: now, metadata: input.metadata, title: input.title, status: 'active' };
  }

  findById(id: string): SessionRecord | null {
    const row = this.db.get('SELECT * FROM sessions WHERE id = ?', [id]) as SessionRow | undefined;
    if (row) {
      return {
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        title: row.title || undefined,
        summary: row.summary || undefined,
        status: (row.status as 'active' | 'archived') || undefined,
        archivedAt: row.archived_at ?? undefined,
      };
    }
    return null;
  }

  findAll(): SessionRecord[] {
    const rows = this.db.all('SELECT * FROM sessions ORDER BY created_at DESC') as SessionRow[];
    return rows.map((row: SessionRow) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      title: row.title || undefined,
      summary: row.summary || undefined,
      status: (row.status as 'active' | 'archived') || undefined,
      archivedAt: row.archived_at ?? undefined,
    }));
  }

  update(id: string, data: Partial<SessionRecord>): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(data.metadata));
    }
    if (data.title !== undefined) {
      fields.push('title = ?');
      values.push(data.title);
    }
    if (data.summary !== undefined) {
      fields.push('summary = ?');
      values.push(data.summary);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.archivedAt !== undefined) {
      fields.push('archived_at = ?');
      values.push(Date.now());
    }

    if (fields.length === 0) return false;

    fields.push('updated_at = ?');
    values.push(Date.now());

    this.db.run(
      `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );
    return true;
  }

  delete(id: string): boolean {
    this.db.run('DELETE FROM sessions WHERE id = ?', [id]);
    return true;
  }

  archive(id: string): boolean {
    const now = Date.now();
    this.db.run(
      'UPDATE sessions SET status = ?, archived_at = ? WHERE id = ?',
      ['archived', now, id]
    );
    return true;
  }

  restore(id: string): boolean {
    this.db.run(
      'UPDATE sessions SET status = ?, archived_at = NULL WHERE id = ?',
      ['active', id]
    );
    return true;
  }

  search(query: string, limit: number = 10): SessionRecord[] {
    const rows = this.db.all(
      'SELECT * FROM sessions WHERE title LIKE ? OR summary LIKE ? ORDER BY created_at DESC LIMIT ?',
      [`%${query}%`, `%${query}%`, limit]
    ) as SessionRow[];
    return rows.map((row: SessionRow) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      title: row.title || undefined,
      summary: row.summary || undefined,
      status: (row.status as 'active' | 'archived') || undefined,
      archivedAt: row.archived_at ?? undefined,
    }));
  }

  findByStatus(status: 'active' | 'archived'): SessionRecord[] {
    const rows = this.db.all(
      'SELECT * FROM sessions WHERE status = ? ORDER BY created_at DESC',
      [status]
    ) as SessionRow[];
    return rows.map((row: SessionRow) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      title: row.title || undefined,
      summary: row.summary || undefined,
      status: (row.status as 'active' | 'archived') || undefined,
      archivedAt: row.archived_at ?? undefined,
    }));
  }

  count(): number {
    const row = this.db.get('SELECT COUNT(*) as count FROM sessions') as { count: number } | undefined;
    return row?.count || 0;
  }

  deleteAll(): number {
    const result = this.db.run('DELETE FROM sessions');
    return result.changes || 0;
  }

  deleteByStatus(status: 'active' | 'archived'): number {
    const result = this.db.run('DELETE FROM sessions WHERE status = ?', [status]);
    return result.changes || 0;
  }

  deleteOlderThan(days: number): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = this.db.run('DELETE FROM sessions WHERE created_at < ?', [cutoff]);
    return result.changes || 0;
  }

  deleteArchivedOlderThan(days: number): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const result = this.db.run('DELETE FROM sessions WHERE status = ? AND archived_at < ?', ['archived', cutoff]);
    return result.changes || 0;
  }

  findAllWithMessageCount(status?: 'active' | 'archived'): Array<SessionRecord & { messageCount: number; lastMessageAt: number | null; firstMessageContent?: string }> {
    let sql = `
      SELECT 
        s.*,
        COUNT(m.id) as message_count,
        MAX(m.timestamp) as last_message_at,
        (SELECT content FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY timestamp ASC LIMIT 1) as first_message_content
      FROM sessions s
      LEFT JOIN messages m ON s.id = m.session_id
    `;
    
    const params: unknown[] = [];
    if (status) {
      sql += ' WHERE s.status = ?';
      params.push(status);
    }
    
    sql += ' GROUP BY s.id ORDER BY s.created_at DESC';
    
    const rows = this.db.all(sql, params) as (SessionRow & { message_count: number; last_message_at: number | null; first_message_content: string | null })[];
    
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      title: row.title || undefined,
      summary: row.summary || undefined,
      status: (row.status as 'active' | 'archived') || undefined,
      archivedAt: row.archived_at ?? undefined,
      messageCount: row.message_count,
      lastMessageAt: row.last_message_at,
      firstMessageContent: row.first_message_content || undefined,
    }));
  }
}

export class MessageRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  create(input: { id: string; sessionId: string; role: string; content: string; timestamp: number }): MessageRecord {
    this.db.run(
      'INSERT INTO messages (id, session_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)',
      [input.id, input.sessionId, input.role, input.content, input.timestamp]
    );
    return {
      id: input.id,
      sessionId: input.sessionId,
      role: input.role as MessageRecord['role'],
      content: input.content,
      timestamp: input.timestamp,
    };
  }

  findById(id: string): MessageRecord | null {
    const row = this.db.get('SELECT * FROM messages WHERE id = ?', [id]) as MessageRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  findBySessionId(sessionId: string, limit?: number): MessageRecord[] {
    let sql = 'SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC';
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    const rows = this.db.all(sql, [sessionId]) as MessageRow[];
    return rows.map((row: MessageRow) => this.mapRow(row));
  }

  deleteBySessionId(sessionId: string): boolean {
    this.db.run('DELETE FROM messages WHERE session_id = ?', [sessionId]);
    return true;
  }

  deleteAll(): number {
    const result = this.db.run('DELETE FROM messages');
    return result.changes || 0;
  }

  count(): number {
    const row = this.db.get('SELECT COUNT(*) as count FROM messages') as { count: number } | undefined;
    return row?.count || 0;
  }

  private mapRow(row: MessageRow): MessageRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role as MessageRecord['role'],
      content: row.content,
      timestamp: row.timestamp,
    };
  }
}

export class ToolCallRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  create(input: {
    id: string;
    messageId: string;
    toolName: string;
    args: Record<string, unknown>;
    status: string;
    result?: unknown;
    error?: string;
    startTime: number;
    endTime?: number;
  }): ToolCallRecord {
    this.db.run(
      'INSERT INTO tool_calls (id, message_id, tool_name, args, status, result, error, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        input.id,
        input.messageId,
        input.toolName,
        JSON.stringify(input.args),
        input.status,
        input.result ? JSON.stringify(input.result) : null,
        input.error || null,
        input.startTime,
        input.endTime || null,
      ]
    );
    return {
      id: input.id,
      messageId: input.messageId,
      toolName: input.toolName,
      args: input.args,
      status: input.status as ToolCallRecord['status'],
      result: input.result,
      error: input.error,
      startTime: input.startTime,
      endTime: input.endTime,
    };
  }

  findById(id: string): ToolCallRecord | null {
    const row = this.db.get('SELECT * FROM tool_calls WHERE id = ?', [id]) as ToolCallRow | undefined;
    if (!row) return null;
    return this.mapRow(row);
  }

  findByMessageId(messageId: string): ToolCallRecord[] {
    const rows = this.db.all('SELECT * FROM tool_calls WHERE message_id = ? ORDER BY start_time ASC', [messageId]) as ToolCallRow[];
    return rows.map((row: ToolCallRow) => this.mapRow(row));
  }

  update(id: string, data: Partial<ToolCallRecord>): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }
    if (data.result !== undefined) {
      fields.push('result = ?');
      values.push(data.result ? JSON.stringify(data.result) : null);
    }
    if (data.error !== undefined) {
      fields.push('error = ?');
      values.push(data.error);
    }
    if (data.endTime !== undefined) {
      fields.push('end_time = ?');
      values.push(data.endTime);
    }

    if (fields.length === 0) return false;

    this.db.run(
      `UPDATE tool_calls SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );
    return true;
  }

  deleteAll(): number {
    const result = this.db.run('DELETE FROM tool_calls');
    return result.changes || 0;
  }

  count(): number {
    const row = this.db.get('SELECT COUNT(*) as count FROM tool_calls') as { count: number } | undefined;
    return row?.count || 0;
  }

  private mapRow(row: ToolCallRow): ToolCallRecord {
    return {
      id: row.id,
      messageId: row.message_id,
      toolName: row.tool_name,
      args: JSON.parse(row.args),
      status: row.status as ToolCallRecord['status'],
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error || undefined,
      startTime: row.start_time,
      endTime: row.end_time || undefined,
    };
  }
}

export class MemoryRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  store(input: CreateMemoryInput): string {
    const id = `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    this.db.run(
      'INSERT INTO long_term_memories (id, content, embedding, type, source, tags, related_ids, importance, created_at, last_accessed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        input.content,
        input.embedding ? JSON.stringify(input.embedding) : null,
        input.type,
        input.source,
        JSON.stringify(input.tags || []),
        JSON.stringify(input.relatedIds || []),
        input.importance,
        now,
        now,
      ]
    );
    return id;
  }

  retrieve(id: string): MemoryRecord | null {
    const row = this.db.get('SELECT * FROM long_term_memories WHERE id = ?', [id]) as MemoryRow | undefined;
    if (!row) return null;

    this.db.run('UPDATE long_term_memories SET last_accessed = ? WHERE id = ?', [Date.now(), id]);

    return this.mapRow(row);
  }

  search(query: string, limit: number = 5): MemoryRecord[] {
    const rows = this.db.all(
      'SELECT * FROM long_term_memories WHERE content LIKE ? ORDER BY importance DESC, last_accessed DESC LIMIT ?',
      [`%${query}%`, limit]
    ) as MemoryRow[];
    return rows.map((row: MemoryRow) => this.mapRow(row));
  }

  findByType(type: MemoryRecord['type']): MemoryRecord[] {
    const rows = this.db.all(
      'SELECT * FROM long_term_memories WHERE type = ? ORDER BY importance DESC',
      [type]
    ) as MemoryRow[];
    return rows.map((row: MemoryRow) => this.mapRow(row));
  }

  findAll(limit?: number): MemoryRecord[] {
    let sql = 'SELECT * FROM long_term_memories ORDER BY importance DESC, last_accessed DESC';
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    const rows = this.db.all(sql) as MemoryRow[];
    return rows.map((row: MemoryRow) => this.mapRow(row));
  }

  update(id: string, data: Partial<MemoryRecord>): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.content !== undefined) {
      fields.push('content = ?');
      values.push(data.content);
    }
    if (data.importance !== undefined) {
      fields.push('importance = ?');
      values.push(data.importance);
    }
    if (data.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(data.tags));
    }

    if (fields.length === 0) return false;

    fields.push('last_accessed = ?');
    values.push(Date.now());

    this.db.run(
      `UPDATE long_term_memories SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );
    return true;
  }

  delete(id: string): boolean {
    this.db.run('DELETE FROM long_term_memories WHERE id = ?', [id]);
    return true;
  }

  deleteLeastImportant(): boolean {
    const row = this.db.get(
      'SELECT id FROM long_term_memories ORDER BY importance ASC, last_accessed ASC LIMIT 1'
    ) as { id: string } | undefined;
    if (row) {
      this.db.run('DELETE FROM long_term_memories WHERE id = ?', [row.id]);
      return true;
    }
    return false;
  }

  size(): number {
    const row = this.db.get('SELECT COUNT(*) as count FROM long_term_memories') as { count: number } | undefined;
    return row?.count || 0;
  }

  private mapRow(row: MemoryRow): MemoryRecord {
    return {
      id: row.id,
      content: row.content,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      type: row.type as MemoryRecord['type'],
      source: row.source,
      tags: JSON.parse(row.tags),
      relatedIds: JSON.parse(row.related_ids),
      importance: row.importance,
      createdAt: row.created_at,
      lastAccessed: row.last_accessed,
    };
  }
}

export { UserRepository } from './user.js';
