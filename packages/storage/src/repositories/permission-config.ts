import type { DatabaseManager } from '../database.js';

export interface PermissionConfigRecord {
  id: string;
  agentId: string | null;
  configType: 'global' | 'agent' | 'group';
  config: string;
  createdAt: number;
  updatedAt: number;
}

export class PermissionConfigRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  saveGlobal(config: Record<string, unknown>): boolean {
    const id = 'global';
    const configJson = JSON.stringify(config);
    const now = Date.now();

    const existing = this.db.get(
      "SELECT id FROM permission_configs WHERE id = ?",
      [id]
    );

    if (existing) {
      this.db.run(
        'UPDATE permission_configs SET config = ?, updated_at = ? WHERE id = ?',
        [configJson, now, id]
      );
    } else {
      this.db.run(
        'INSERT INTO permission_configs (id, config_type, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [id, 'global', configJson, now, now]
      );
    }

    return true;
  }

  getGlobal(): Record<string, unknown> | null {
    const row = this.db.get(
      "SELECT config FROM permission_configs WHERE id = 'global'"
    ) as { config: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.config);
  }

  saveAgent(agentId: string, config: Record<string, unknown>): boolean {
    const id = `agent_${agentId}`;
    const configJson = JSON.stringify(config);
    const now = Date.now();

    const existing = this.db.get(
      'SELECT id FROM permission_configs WHERE agent_id = ?',
      [agentId]
    );

    if (existing) {
      this.db.run(
        'UPDATE permission_configs SET config = ?, updated_at = ? WHERE agent_id = ?',
        [configJson, now, agentId]
      );
    } else {
      this.db.run(
        'INSERT INTO permission_configs (id, agent_id, config_type, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, agentId, 'agent', configJson, now, now]
      );
    }

    return true;
  }

  getAgent(agentId: string): Record<string, unknown> | null {
    const row = this.db.get(
      'SELECT config FROM permission_configs WHERE agent_id = ? AND config_type = ?',
      [agentId, 'agent']
    ) as { config: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.config);
  }

  saveGroup(groupName: string, config: Record<string, unknown>): boolean {
    const id = `group_${groupName}`;
    const configJson = JSON.stringify(config);
    const now = Date.now();

    const existing = this.db.get(
      'SELECT id FROM permission_configs WHERE id = ?',
      [id]
    );

    if (existing) {
      this.db.run(
        'UPDATE permission_configs SET config = ?, updated_at = ? WHERE id = ?',
        [configJson, now, id]
      );
    } else {
      this.db.run(
        'INSERT INTO permission_configs (id, config_type, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, 'group', configJson, now, now]
      );
    }

    return true;
  }

  getGroup(groupName: string): Record<string, unknown> | null {
    const row = this.db.get(
      'SELECT config FROM permission_configs WHERE id = ? AND config_type = ?',
      [`group_${groupName}`, 'group']
    ) as { config: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.config);
  }

  findAll(): PermissionConfigRecord[] {
    const rows = this.db.all('SELECT * FROM permission_configs ORDER BY created_at DESC') as Array<{
      id: string;
      agent_id: string | null;
      config_type: string;
      config: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      configType: row.config_type as 'global' | 'agent' | 'group',
      config: row.config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  findByAgentId(agentId: string): PermissionConfigRecord | null {
    const row = this.db.get(
      'SELECT * FROM permission_configs WHERE agent_id = ?',
      [agentId]
    ) as {
      id: string;
      agent_id: string | null;
      config_type: string;
      config: string;
      created_at: number;
      updated_at: number;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      agentId: row.agent_id,
      configType: row.config_type as 'global' | 'agent' | 'group',
      config: row.config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  delete(id: string): boolean {
    const result = this.db.run('DELETE FROM permission_configs WHERE id = ?', [id]);
    return result.changes > 0;
  }

  deleteByAgentId(agentId: string): boolean {
    const result = this.db.run('DELETE FROM permission_configs WHERE agent_id = ?', [agentId]);
    return result.changes > 0;
  }

  count(): number {
    const row = this.db.get('SELECT COUNT(*) as count FROM permission_configs') as { count: number } | undefined;
    return row?.count || 0;
  }
}
