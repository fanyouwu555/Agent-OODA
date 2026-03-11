import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createStorage } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

describe('SQLite Storage', () => {
  const dbPath = './test-data/test-' + Date.now() + '.db';
  let storage: Awaited<ReturnType<typeof createStorage>>;
  let testCounter = 0;

  beforeAll(async () => {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    storage = await createStorage(dbPath);
  });

  afterAll(() => {
    storage.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  beforeEach(() => {
    testCounter++;
  });

  const uniqueId = (prefix: string) => `${prefix}-${testCounter}-${Date.now()}`;

  describe('SessionRepository', () => {
    it('should create a session', () => {
      const session = storage.sessions.create({ id: uniqueId('session') });
      expect(session.id).toBeDefined();
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    it('should find a session by id', () => {
      const id = uniqueId('session-find');
      storage.sessions.create({ id });
      const session = storage.sessions.findById(id);
      expect(session).not.toBeNull();
      expect(session?.id).toBe(id);
    });

    it('should find all sessions', () => {
      storage.sessions.create({ id: uniqueId('session-all-1') });
      storage.sessions.create({ id: uniqueId('session-all-2') });
      const sessions = storage.sessions.findAll();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should update a session', () => {
      const id = uniqueId('session-update');
      storage.sessions.create({ id });
      const updated = storage.sessions.update(id, {
        metadata: { key: 'value' }
      });
      expect(updated).toBe(true);
      
      const session = storage.sessions.findById(id);
      expect(session?.metadata).toEqual({ key: 'value' });
    });

    it('should delete a session', () => {
      const id = uniqueId('session-delete');
      storage.sessions.create({ id });
      const deleted = storage.sessions.delete(id);
      expect(deleted).toBe(true);
      
      const session = storage.sessions.findById(id);
      expect(session).toBeNull();
    });
  });

  describe('MessageRepository', () => {
    it('should create a message', () => {
      const sessionId = uniqueId('msg-session');
      storage.sessions.create({ id: sessionId });
      const message = storage.messages.create({
        id: uniqueId('msg'),
        sessionId,
        role: 'user',
        content: 'Hello',
        timestamp: Date.now()
      });
      expect(message.id).toBeDefined();
      expect(message.content).toBe('Hello');
    });

    it('should find messages by session id', () => {
      const sessionId = uniqueId('msg-find-session');
      storage.sessions.create({ id: sessionId });
      storage.messages.create({
        id: uniqueId('msg-find-1'),
        sessionId,
        role: 'user',
        content: 'Hello',
        timestamp: Date.now()
      });
      storage.messages.create({
        id: uniqueId('msg-find-2'),
        sessionId,
        role: 'assistant',
        content: 'Hi there!',
        timestamp: Date.now()
      });
      
      const messages = storage.messages.findBySessionId(sessionId);
      expect(messages.length).toBeGreaterThanOrEqual(2);
    });

    it('should delete messages by session id', () => {
      const sessionId = uniqueId('msg-del-session');
      storage.sessions.create({ id: sessionId });
      storage.messages.create({
        id: uniqueId('msg-del'),
        sessionId,
        role: 'user',
        content: 'Temp',
        timestamp: Date.now()
      });
      
      const deleted = storage.messages.deleteBySessionId(sessionId);
      expect(deleted).toBe(true);
    });
  });

  describe('ToolCallRepository', () => {
    it('should create a tool call', () => {
      const sessionId = uniqueId('tool-session');
      const messageId = uniqueId('tool-msg');
      storage.sessions.create({ id: sessionId });
      storage.messages.create({
        id: messageId,
        sessionId,
        role: 'assistant',
        content: 'Test',
        timestamp: Date.now()
      });
      
      const toolCall = storage.toolCalls.create({
        id: uniqueId('tool'),
        messageId,
        toolName: 'readFile',
        args: { path: '/test.txt' },
        status: 'success',
        startTime: Date.now()
      });
      expect(toolCall.id).toBeDefined();
      expect(toolCall.toolName).toBe('readFile');
    });

    it('should find tool calls by message id', () => {
      const sessionId = uniqueId('tool-find-session');
      const messageId = uniqueId('tool-find-msg');
      const toolId = uniqueId('tool-find');
      storage.sessions.create({ id: sessionId });
      storage.messages.create({
        id: messageId,
        sessionId,
        role: 'assistant',
        content: 'Test',
        timestamp: Date.now()
      });
      storage.toolCalls.create({
        id: toolId,
        messageId,
        toolName: 'readFile',
        args: {},
        status: 'success',
        startTime: Date.now()
      });
      
      const toolCalls = storage.toolCalls.findByMessageId(messageId);
      expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should update a tool call', () => {
      const sessionId = uniqueId('tool-upd-session');
      const messageId = uniqueId('tool-upd-msg');
      const toolId = uniqueId('tool-upd');
      storage.sessions.create({ id: sessionId });
      storage.messages.create({
        id: messageId,
        sessionId,
        role: 'assistant',
        content: 'Test',
        timestamp: Date.now()
      });
      storage.toolCalls.create({
        id: toolId,
        messageId,
        toolName: 'readFile',
        args: {},
        status: 'running',
        startTime: Date.now()
      });
      
      const updated = storage.toolCalls.update(toolId, {
        status: 'error',
        error: 'File not found'
      });
      expect(updated).toBe(true);
    });
  });

  describe('MemoryRepository', () => {
    it('should store a memory', () => {
      const id = storage.memories.store({
        content: 'User prefers TypeScript ' + Date.now(),
        type: 'preference',
        source: 'user-input',
        tags: ['typescript', 'preference'],
        relatedIds: [],
        importance: 0.8
      });
      expect(id).toMatch(/^memory-/);
    });

    it('should retrieve a memory', () => {
      const id = storage.memories.store({
        content: 'Test memory content ' + Date.now(),
        type: 'fact',
        source: 'test',
        tags: ['test'],
        relatedIds: [],
        importance: 0.5
      });
      
      const memory = storage.memories.retrieve(id);
      expect(memory).not.toBeNull();
      expect(memory?.content).toContain('Test memory content');
    });

    it('should search memories', () => {
      storage.memories.store({
        content: 'Important fact about Python ' + Date.now(),
        type: 'fact',
        source: 'test',
        tags: ['python'],
        relatedIds: [],
        importance: 0.9
      });
      
      const results = storage.memories.search('Python');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should find memories by type', () => {
      storage.memories.store({
        content: 'Another preference ' + Date.now(),
        type: 'preference',
        source: 'test',
        tags: [],
        relatedIds: [],
        importance: 0.7
      });
      
      const preferences = storage.memories.findByType('preference');
      expect(preferences.length).toBeGreaterThanOrEqual(1);
    });

    it('should delete least important memory', () => {
      storage.memories.store({
        content: 'Least important ' + Date.now(),
        type: 'fact',
        source: 'test',
        tags: [],
        relatedIds: [],
        importance: 0.1
      });
      
      const deleted = storage.memories.deleteLeastImportant();
      expect(deleted).toBe(true);
    });

    it('should return memory size', () => {
      const size = storage.memories.size();
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });
});
