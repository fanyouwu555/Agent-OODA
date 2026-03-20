import type { DatabaseManager } from '../database.js';

export interface AgentConfigRecord {
  id: string;
  name: string;
  config: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAgentConfigInput {
  id: string;
  name: string;
  config: Record<string, unknown>;
}

export class AgentConfigRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  create(input: CreateAgentConfigInput): AgentConfigRecord {
    const now = Date.now();
    const configJson = JSON.stringify(input.config);

    this.db.runImmediate(
      'INSERT INTO agent_configs (id, name, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [input.id, input.name, configJson, now, now]
    );

    return {
      id: input.id,
      name: input.name,
      config: configJson,
      createdAt: now,
      updatedAt: now,
    };
  }

  findById(id: string): AgentConfigRecord | null {
    const row = this.db.get('SELECT * FROM agent_configs WHERE id = ?', [id]) as {
      id: string;
      name: string;
      config: string;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      config: row.config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findByName(name: string): AgentConfigRecord | null {
    const row = this.db.get('SELECT * FROM agent_configs WHERE name = ?', [name]) as {
      id: string;
      name: string;
      config: string;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      config: row.config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findAll(): AgentConfigRecord[] {
    const rows = this.db.all('SELECT * FROM agent_configs ORDER BY created_at DESC') as Array<{
      id: string;
      name: string;
      config: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      config: row.config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  update(id: string, config: Partial<Record<string, unknown>>): boolean {
    const existing = this.findById(id);
    if (!existing) return false;

    const updatedConfig = { ...JSON.parse(existing.config), ...config };
    const configJson = JSON.stringify(updatedConfig);

    this.db.run(
      'UPDATE agent_configs SET config = ?, updated_at = ? WHERE id = ?',
      [configJson, Date.now(), id]
    );

    return true;
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM agent_configs WHERE id = ?', [id]);
    return result.changes > 0;
  }

  exists(name: string): boolean {
    const row = this.db.get('SELECT 1 FROM agent_configs WHERE name = ?', [name]);
    return row !== undefined;
  }

  count(): number {
    const row = this.db.get('SELECT COUNT(*) as count FROM agent_configs') as { count: number } | undefined;
    return row?.count || 0;
  }
}
