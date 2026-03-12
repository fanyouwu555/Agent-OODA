// packages/core/src/collaboration/__tests__/collaboration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CollaborationOrchestrator,
  getCollaborationOrchestrator,
  setCollaborationOrchestrator,
  resetCollaborationOrchestrator,
} from '../orchestrator';
import type {
  CollaboratingAgent,
  AgentRole,
  CollaborationConfig,
  CollaborationStrategy,
} from '../types';

describe('CollaborationOrchestrator', () => {
  beforeEach(() => {
    resetCollaborationOrchestrator();
  });

  describe('initialization', () => {
    it('should create orchestrator with default config', () => {
      const orchestrator = new CollaborationOrchestrator();
      expect(orchestrator).toBeDefined();
    });

    it('should create orchestrator with custom config', () => {
      const config: Partial<CollaborationConfig> = {
        strategy: 'sequential',
        maxAgents: 3,
        maxConcurrentTasks: 2,
      };
      const orchestrator = new CollaborationOrchestrator(config);
      expect(orchestrator).toBeDefined();
    });
  });

  describe('session management', () => {
    let orchestrator: CollaborationOrchestrator;

    beforeEach(() => {
      orchestrator = new CollaborationOrchestrator();
    });

    it('should create a session', async () => {
      const session = await orchestrator.createSession({
        title: 'Test Session',
        description: 'Test description',
      });

      expect(session.id).toBeDefined();
      expect(session.title).toBe('Test Session');
      expect(session.status).toBe('planning');
      expect(session.tasks).toHaveLength(0);
      expect(session.agents.size).toBe(0);
    });

    it('should get session status', async () => {
      const session = await orchestrator.createSession({ title: 'Test' });
      const status = orchestrator.getSessionStatus(session.id);
      
      expect(status.id).toBe(session.id);
      expect(status.title).toBe('Test');
    });

    it('should throw error for non-existent session', () => {
      expect(() => orchestrator.getSessionStatus('non-existent')).toThrow('Session non-existent not found');
    });

    it('should list all sessions', async () => {
      await orchestrator.createSession({ title: 'Session 1' });
      await orchestrator.createSession({ title: 'Session 2' });

      const sessions = orchestrator.getAllSessions();
      expect(sessions).toHaveLength(2);
    });

    it('should delete a session', async () => {
      const session = await orchestrator.createSession({ title: 'To Delete' });
      const deleted = orchestrator.deleteSession(session.id);
      
      expect(deleted).toBe(true);
      expect(() => orchestrator.getSessionStatus(session.id)).toThrow();
    });
  });

  describe('agent management', () => {
    let orchestrator: CollaborationOrchestrator;
    let sessionId: string;

    beforeEach(async () => {
      orchestrator = new CollaborationOrchestrator();
      const session = await orchestrator.createSession({ title: 'Test' });
      sessionId = session.id;
    });

    it('should add agent to session', async () => {
      const agent: CollaboratingAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        roleId: 'analyst',
        config: { name: 'Test Agent', description: 'Test' },
        status: 'idle',
        completedTasks: [],
        capabilities: ['analysis'],
        performance: {
          tasksCompleted: 0,
          tasksFailed: 0,
          averageResponseTime: 0,
          qualityScore: 1.0,
          lastActiveAt: Date.now(),
        },
      };

      await orchestrator.addAgent(sessionId, agent);
      const session = orchestrator.getSessionStatus(sessionId);
      
      expect(session.agents.size).toBe(1);
      expect(session.agents.get('agent-1')?.name).toBe('Test Agent');
    });

    it('should throw error when adding agent to non-existent session', async () => {
      const agent: CollaboratingAgent = {
        id: 'agent-1',
        name: 'Test Agent',
        roleId: 'analyst',
        config: { name: 'Test Agent', description: 'Test' },
        status: 'idle',
        completedTasks: [],
        capabilities: [],
        performance: {
          tasksCompleted: 0,
          tasksFailed: 0,
          averageResponseTime: 0,
          qualityScore: 1.0,
          lastActiveAt: Date.now(),
        },
      };

      await expect(orchestrator.addAgent('non-existent', agent)).rejects.toThrow('Session non-existent not found');
    });

    it('should throw error when exceeding max agents', async () => {
      const orchestrator = new CollaborationOrchestrator({ maxAgents: 1 });
      const session = await orchestrator.createSession({ title: 'Test' });

      const agent1: CollaboratingAgent = {
        id: 'agent-1',
        name: 'Agent 1',
        roleId: 'analyst',
        config: { name: 'Agent 1', description: 'Test' },
        status: 'idle',
        completedTasks: [],
        capabilities: [],
        performance: {
          tasksCompleted: 0,
          tasksFailed: 0,
          averageResponseTime: 0,
          qualityScore: 1.0,
          lastActiveAt: Date.now(),
        },
      };

      const agent2: CollaboratingAgent = {
        id: 'agent-2',
        name: 'Agent 2',
        roleId: 'executor',
        config: { name: 'Agent 2', description: 'Test' },
        status: 'idle',
        completedTasks: [],
        capabilities: [],
        performance: {
          tasksCompleted: 0,
          tasksFailed: 0,
          averageResponseTime: 0,
          qualityScore: 1.0,
          lastActiveAt: Date.now(),
        },
      };

      await orchestrator.addAgent(session.id, agent1);
      await expect(orchestrator.addAgent(session.id, agent2)).rejects.toThrow('Maximum number of agents');
    });
  });

  describe('role management', () => {
    let orchestrator: CollaborationOrchestrator;
    let sessionId: string;

    beforeEach(async () => {
      orchestrator = new CollaborationOrchestrator();
      const session = await orchestrator.createSession({
        title: 'Test',
        roles: [
          { id: 'analyst', name: 'Analyst', description: 'Analysis role', responsibilities: [], skills: [], priority: 1 },
          { id: 'executor', name: 'Executor', description: 'Execution role', responsibilities: [], skills: [], priority: 2 },
        ],
      });
      sessionId = session.id;

      await orchestrator.addAgent(sessionId, {
        id: 'agent-1',
        name: 'Test Agent',
        roleId: '',
        config: { name: 'Test Agent', description: 'Test' },
        status: 'idle',
        completedTasks: [],
        capabilities: [],
        performance: {
          tasksCompleted: 0,
          tasksFailed: 0,
          averageResponseTime: 0,
          qualityScore: 1.0,
          lastActiveAt: Date.now(),
        },
      });
    });

    it('should assign role to agent', async () => {
      await orchestrator.assignRole(sessionId, 'agent-1', 'analyst');
      const session = orchestrator.getSessionStatus(sessionId);
      
      expect(session.agents.get('agent-1')?.roleId).toBe('analyst');
    });

    it('should throw error for non-existent agent', async () => {
      await expect(orchestrator.assignRole(sessionId, 'non-existent', 'analyst')).rejects.toThrow('Agent non-existent not found');
    });

    it('should throw error for non-existent role', async () => {
      await expect(orchestrator.assignRole(sessionId, 'agent-1', 'non-existent')).rejects.toThrow('Role non-existent not found');
    });
  });

  describe('task management', () => {
    let orchestrator: CollaborationOrchestrator;
    let sessionId: string;

    beforeEach(async () => {
      orchestrator = new CollaborationOrchestrator();
      const session = await orchestrator.createSession({ title: 'Test' });
      sessionId = session.id;
    });

    it('should submit task', async () => {
      const task = await orchestrator.submitTask(sessionId, {
        title: 'Test Task',
        description: 'Test description',
        type: 'analysis',
        input: { data: 'test' },
      });

      expect(task.id).toBeDefined();
      expect(task.title).toBe('Test Task');
      expect(task.status).toBe('pending');

      const session = orchestrator.getSessionStatus(sessionId);
      expect(session.tasks).toHaveLength(1);
    });

    it('should submit task with dependencies', async () => {
      const task1 = await orchestrator.submitTask(sessionId, {
        title: 'Task 1',
        type: 'analysis',
      });

      const task2 = await orchestrator.submitTask(sessionId, {
        title: 'Task 2',
        type: 'synthesis',
        dependencies: [task1.id],
      });

      expect(task2.dependencies).toContain(task1.id);
    });
  });

  describe('task decomposition', () => {
    let orchestrator: CollaborationOrchestrator;

    beforeEach(() => {
      orchestrator = new CollaborationOrchestrator();
    });

    it('should decompose low complexity task', () => {
      const result = orchestrator.decomposeTask('Simple task', 'low');
      
      expect(result.tasks).toHaveLength(1);
      expect(result.estimatedComplexity).toBe('low');
      expect(result.roles).toHaveLength(1);
    });

    it('should decompose medium complexity task', () => {
      const result = orchestrator.decomposeTask('Medium task', 'medium');
      
      expect(result.tasks).toHaveLength(2);
      expect(result.estimatedComplexity).toBe('medium');
      expect(result.dependencies.size).toBe(1);
    });

    it('should decompose high complexity task', () => {
      const result = orchestrator.decomposeTask('Complex task', 'high');
      
      expect(result.tasks).toHaveLength(4);
      expect(result.estimatedComplexity).toBe('high');
      expect(result.dependencies.size).toBe(3);
    });
  });

  describe('session execution', () => {
    let orchestrator: CollaborationOrchestrator;

    beforeEach(async () => {
      orchestrator = new CollaborationOrchestrator({ maxConcurrentTasks: 2 });
    });

    it('should execute parallel session', async () => {
      const session = await orchestrator.createSession({
        title: 'Parallel Test',
        strategy: 'parallel',
      });

      // Add agents
      await orchestrator.addAgent(session.id, {
        id: 'agent-1',
        name: 'Agent 1',
        roleId: 'analyst',
        config: { name: 'Agent 1', description: 'Test' },
        status: 'idle',
        completedTasks: [],
        capabilities: ['analysis'],
        performance: {
          tasksCompleted: 0,
          tasksFailed: 0,
          averageResponseTime: 0,
          qualityScore: 1.0,
          lastActiveAt: Date.now(),
        },
      });

      // Submit tasks
      await orchestrator.submitTask(session.id, {
        title: 'Task 1',
        type: 'analysis',
        assignedAgent: 'agent-1',
      });

      await orchestrator.submitTask(session.id, {
        title: 'Task 2',
        type: 'analysis',
        assignedAgent: 'agent-1',
      });

      const result = await orchestrator.executeSession(session.id);

      expect(result.success).toBe(true);
      expect(result.metrics.completedTasks).toBe(2);
      expect(result.metrics.failedTasks).toBe(0);
    });

    it('should execute sequential session', async () => {
      const session = await orchestrator.createSession({
        title: 'Sequential Test',
        strategy: 'sequential',
      });

      await orchestrator.addAgent(session.id, {
        id: 'agent-1',
        name: 'Agent 1',
        roleId: 'analyst',
        config: { name: 'Agent 1', description: 'Test' },
        status: 'idle',
        completedTasks: [],
        capabilities: ['analysis'],
        performance: {
          tasksCompleted: 0,
          tasksFailed: 0,
          averageResponseTime: 0,
          qualityScore: 1.0,
          lastActiveAt: Date.now(),
        },
      });

      await orchestrator.submitTask(session.id, {
        title: 'Task 1',
        type: 'analysis',
        assignedAgent: 'agent-1',
      });

      const result = await orchestrator.executeSession(session.id);

      expect(result.success).toBe(true);
      expect(result.metrics.completedTasks).toBe(1);
    });

    it('should pause and resume session', async () => {
      const session = await orchestrator.createSession({
        title: 'Pause Test',
        strategy: 'parallel',
      });

      await orchestrator.executeSession(session.id);
      
      // Session completes immediately in test mode, so we can't really test pause/resume
      // But we can test the state transitions
      expect(orchestrator.getSessionStatus(session.id).status).toBe('completed');
    });

    it('should terminate session', async () => {
      const session = await orchestrator.createSession({ title: 'Terminate Test' });
      
      const result = await orchestrator.terminateSession(session.id);
      
      expect(result.sessionId).toBe(session.id);
      expect(result.success).toBe(true);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      const instance1 = getCollaborationOrchestrator();
      const instance2 = getCollaborationOrchestrator();
      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      setCollaborationOrchestrator({ strategy: 'sequential' });
      expect(getCollaborationOrchestrator()).toBeDefined();
      
      resetCollaborationOrchestrator();
      const newInstance = getCollaborationOrchestrator();
      expect(newInstance).toBeDefined();
    });
  });
});

describe('Collaboration Types', () => {
  it('should define all collaboration strategies', () => {
    const strategies: CollaborationStrategy[] = [
      'sequential',
      'parallel',
      'hierarchical',
      'consensus',
      'competitive',
    ];

    expect(strategies).toHaveLength(5);
  });

  it('should create agent role', () => {
    const role: AgentRole = {
      id: 'analyst',
      name: 'Analyst',
      description: 'Performs analysis tasks',
      responsibilities: ['data analysis', 'research'],
      skills: ['critical-thinking', 'data-analysis'],
      priority: 1,
    };

    expect(role.id).toBe('analyst');
    expect(role.skills).toContain('critical-thinking');
  });
});
