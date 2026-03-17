// packages/storage/src/repositories/user.ts
import type { DatabaseManager } from '../database.js';

export interface UserRecord {
  id: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  createdAt: number;
  updatedAt: number;
}

export class UserRepository {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  create(input: { email: string; password: string; role?: 'user' | 'admin' }): UserRecord {
    const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const role = input.role || 'user';
    
    this.db.runImmediate(
      'INSERT INTO users (id, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, input.email, input.password, role, now, now]
    );
    
    return { id, email: input.email, password: input.password, role, createdAt: now, updatedAt: now };
  }

  findByEmail(email: string): UserRecord | null {
    const row = this.db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!row) return null;
    
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      role: row.role as 'user' | 'admin',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  findById(id: string): UserRecord | null {
    const row = this.db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (!row) return null;
    
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      role: row.role as 'user' | 'admin',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  update(id: string, data: Partial<{ email: string; password: string; role: 'user' | 'admin' }>): boolean {
    const fields: string[] = [];
    const values: unknown[] = [];
    
    if (data.email !== undefined) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.password !== undefined) {
      fields.push('password = ?');
      values.push(data.password);
    }
    if (data.role !== undefined) {
      fields.push('role = ?');
      values.push(data.role);
    }
    
    if (fields.length === 0) return false;
    
    fields.push('updated_at = ?');
    values.push(Date.now());
    
    this.db.run(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      [...values, id]
    );
    
    return true;
  }

  delete(id: string): boolean {
    this.db.run('DELETE FROM users WHERE id = ?', [id]);
    return true;
  }

  count(): number {
    const row = this.db.get('SELECT COUNT(*) as count FROM users');
    return row?.count || 0;
  }

  findAll(): UserRecord[] {
    const rows = this.db.all('SELECT * FROM users ORDER BY created_at DESC');
    return rows.map(row => ({
      id: row.id,
      email: row.email,
      password: row.password,
      role: row.role as 'user' | 'admin',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }
}