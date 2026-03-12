// packages/core/src/collaboration/orchestrator.ts
import { randomUUID } from 'crypto';
import type {
  CollaborationSession,
  CollaboratingAgent,
  CollaborationTask,
  CollaborationResult,
  CollaborationMessage,
  AgentRole,
  TaskResult,
  CollaborationMetrics,
  AgentContribution,
  ConsensusResult,
  CollaborationConfig,
  TaskDecompositionResult,
  CollaborationOrchestrator as ICollaborationOrchestrator,
} from './types';

export class CollaborationOrchestrator implements ICollaborationOrchestrator {
  private sessions: Map<string, CollaborationSession> = new Map();
  private config: CollaborationConfig;

  constructor(config?: Partial<CollaborationConfig>) {
    this.config = {
      strategy: 'parallel',
      maxAgents: 5,
      maxConcurrentTasks: 3,
      timeout: 300000, // 5 minutes
      autoAssign: true,
      requireConsensus: false,
      consensusThreshold: 0.7,
      enableConflictResolution: true,
      ...config,
    };
  }

  async createSession(config: Partial<CollaborationSession>): Promise<CollaborationSession> {
    const session: CollaborationSession = {
      id: randomUUID(),
      title: config.title || 'Untitled Session',
      description: config.description || '',
      status: 'planning',
      roles: config.roles || [],
      tasks: [],
      agents: new Map(),
      messages: [],
      context: config.context || {},
      strategy: config.strategy || this.config.strategy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  async addAgent(sessionId: string, agent: CollaboratingAgent): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.agents.size >= this.config.maxAgents) {
      throw new Error(`Maximum number of agents (${this.config.maxAgents}) reached`);
    }

    session.agents.set(agent.id, {
      ...agent,
      status: 'idle',
      completedTasks: [],
      performance: {
        tasksCompleted: 0,
        tasksFailed: 0,
        averageResponseTime: 0,
        qualityScore: 1.0,
        lastActiveAt: Date.now(),
      },
    });

    session.updatedAt = Date.now();

    this.addMessage(sessionId, {
      type: 'coordination',
      from: 'system',
      content: `Agent ${agent.name} joined the session`,
    });
  }

  async assignRole(sessionId: string, agentId: string, roleId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const agent = session.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in session`);
    }

    const role = session.roles.find(r => r.id === roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found in session`);
    }

    agent.roleId = roleId;
    session.updatedAt = Date.now();

    this.addMessage(sessionId, {
      type: 'coordination',
      from: 'system',
      content: `Agent ${agent.name} assigned role: ${role.name}`,
    });
  }

  async submitTask(sessionId: string, task: Partial<CollaborationTask>): Promise<CollaborationTask> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const newTask: CollaborationTask = {
      id: randomUUID(),
      title: task.title || 'Untitled Task',
      description: task.description || '',
      type: task.type || 'custom',
      dependencies: task.dependencies || [],
      status: 'pending',
      input: task.input,
      metadata: task.metadata || {},
      createdAt: Date.now(),
      ...task,
    };

    // Auto-assign if enabled and role specified
    if (this.config.autoAssign && newTask.assignedRole && !newTask.assignedAgent) {
      const suitableAgent = this.findAgentForRole(session, newTask.assignedRole);
      if (suitableAgent) {
        newTask.assignedAgent = suitableAgent.id;
      }
    }

    session.tasks.push(newTask);
    session.updatedAt = Date.now();

    this.addMessage(sessionId, {
      type: 'coordination',
      from: 'system',
      content: `New task submitted: ${newTask.title}`,
      taskId: newTask.id,
    });

    return newTask;
  }

  async executeSession(sessionId: string): Promise<CollaborationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status === 'active') {
      throw new Error('Session is already active');
    }

    session.status = 'active';
    session.updatedAt = Date.now();

    const startTime = Date.now();

    try {
      // Execute based on strategy
      switch (session.strategy) {
        case 'sequential':
          await this.executeSequential(session);
          break;
        case 'parallel':
          await this.executeParallel(session);
          break;
        case 'hierarchical':
          await this.executeHierarchical(session);
          break;
        case 'consensus':
          await this.executeConsensus(session);
          break;
        case 'competitive':
          await this.executeCompetitive(session);
          break;
        default:
          await this.executeParallel(session);
      }

      session.status = 'completed';
      session.completedAt = Date.now();

      return this.buildResult(session, startTime);
    } catch (error) {
      session.status = 'failed';
      session.updatedAt = Date.now();
      throw error;
    }
  }

  async pauseSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'active') {
      throw new Error('Can only pause active sessions');
    }

    session.status = 'paused';
    session.updatedAt = Date.now();

    this.addMessage(sessionId, {
      type: 'coordination',
      from: 'system',
      content: 'Session paused',
    });
  }

  async resumeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.status !== 'paused') {
      throw new Error('Can only resume paused sessions');
    }

    session.status = 'active';
    session.updatedAt = Date.now();

    this.addMessage(sessionId, {
      type: 'coordination',
      from: 'system',
      content: 'Session resumed',
    });
  }

  async terminateSession(sessionId: string): Promise<CollaborationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const startTime = session.createdAt;
    session.status = 'completed';
    session.completedAt = Date.now();

    return this.buildResult(session, startTime);
  }

  getSessionStatus(sessionId: string): CollaborationSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  getAllSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  // Task decomposition helper
  decomposeTask(description: string, complexity: 'low' | 'medium' | 'high'): TaskDecompositionResult {
    const tasks: CollaborationTask[] = [];
    const dependencies = new Map<string, string[]>();

    switch (complexity) {
      case 'low':
        tasks.push(this.createTask('Analyze', 'analysis', description));
        break;
      case 'medium':
        const analysisTask = this.createTask('Analyze', 'analysis', description);
        const synthesisTask = this.createTask('Synthesize', 'synthesis', 'Combine analysis results');
        tasks.push(analysisTask, synthesisTask);
        dependencies.set(synthesisTask.id, [analysisTask.id]);
        break;
      case 'high':
        const researchTask = this.createTask('Research', 'analysis', 'Gather information');
        const analyzeTask = this.createTask('Analyze', 'analysis', 'Analyze findings');
        const executeTask = this.createTask('Execute', 'execution', 'Implement solution');
        const reviewTask = this.createTask('Review', 'review', 'Review and validate');
        tasks.push(researchTask, analyzeTask, executeTask, reviewTask);
        dependencies.set(analyzeTask.id, [researchTask.id]);
        dependencies.set(executeTask.id, [analyzeTask.id]);
        dependencies.set(reviewTask.id, [executeTask.id]);
        break;
    }

    const roles = this.suggestRoles(tasks);

    return {
      tasks,
      dependencies,
      estimatedComplexity: complexity,
      estimatedDuration: this.estimateDuration(tasks, complexity),
      roles,
    };
  }

  private async executeSequential(session: CollaborationSession): Promise<void> {
    // Sort tasks by dependencies
    const sortedTasks = this.topologicalSort(session.tasks);

    for (const task of sortedTasks) {
      if (task.status === 'pending') {
        await this.executeTask(session, task);
      }
    }
  }

  private async executeParallel(session: CollaborationSession): Promise<void> {
    const pendingTasks = session.tasks.filter(t => t.status === 'pending');
    const batches = this.createBatches(pendingTasks, this.config.maxConcurrentTasks);

    for (const batch of batches) {
      const executableTasks = batch.filter(task => this.areDependenciesMet(session, task));
      await Promise.all(executableTasks.map(task => this.executeTask(session, task)));
    }
  }

  private async executeHierarchical(session: CollaborationSession): Promise<void> {
    // Find coordinator role or assign one
    const coordinator = Array.from(session.agents.values())
      .find(a => a.roleId === 'coordinator') || Array.from(session.agents.values())[0];

    if (!coordinator) {
      throw new Error('No coordinator agent available');
    }

    // Coordinator assigns tasks
    for (const task of session.tasks) {
      if (task.status === 'pending') {
        if (!task.assignedAgent) {
          const agent = this.findBestAgentForTask(session, task);
          if (agent) {
            task.assignedAgent = agent.id;
          }
        }
        await this.executeTask(session, task);
      }
    }
  }

  private async executeConsensus(session: CollaborationSession): Promise<void> {
    // All agents work on the same task and vote
    const mainTask = session.tasks[0];
    if (!mainTask) return;

    const results: Map<string, TaskResult> = new Map();

    // Each agent provides their solution
    for (const [agentId, agent] of session.agents) {
      const result = await this.simulateAgentExecution(agent, mainTask);
      results.set(agentId, result);
    }

    // Vote on results
    const consensus = this.voteOnResults(results);

    if (consensus.reached) {
      mainTask.result = results.get(consensus.winner as string);
      mainTask.status = 'completed';
    } else {
      mainTask.status = 'failed';
      throw new Error('Consensus not reached');
    }
  }

  private async executeCompetitive(session: CollaborationSession): Promise<void> {
    // Agents compete to complete tasks
    const pendingTasks = session.tasks.filter(t => t.status === 'pending');

    for (const task of pendingTasks) {
      const promises = Array.from(session.agents.values()).map(async agent => {
        const startTime = Date.now();
        const result = await this.simulateAgentExecution(agent, task);
        const duration = Date.now() - startTime;
        return { agent, result, duration };
      });

      // Winner is the one with best result and fastest time
      const outcomes = await Promise.all(promises);
      const winner = outcomes.reduce((best, current) => {
        if (current.result.success && current.result.confidence > best.result.confidence) {
          return current;
        }
        if (current.result.success && !best.result.success) {
          return current;
        }
        return best;
      });

      task.result = winner.result;
      task.status = 'completed';
      task.assignedAgent = winner.agent.id;
    }
  }

  private async executeTask(session: CollaborationSession, task: CollaborationTask): Promise<void> {
    if (!task.assignedAgent) {
      const agent = this.findBestAgentForTask(session, task);
      if (agent) {
        task.assignedAgent = agent.id;
      }
    }

    const agent = task.assignedAgent ? session.agents.get(task.assignedAgent) : undefined;
    if (!agent) {
      throw new Error(`No agent available for task ${task.id}`);
    }

    task.status = 'in_progress';
    task.startedAt = Date.now();
    agent.status = 'working';
    agent.currentTask = task.id;

    this.addMessage(session.id, {
      type: 'task_assignment',
      from: 'system',
      to: agent.id,
      content: `Task assigned: ${task.title}`,
      taskId: task.id,
    });

    try {
      const result = await this.simulateAgentExecution(agent, task);
      
      task.result = result;
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = Date.now();
      task.output = result.data;

      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.completedTasks.push(task.id);
      agent.performance.tasksCompleted++;
      agent.performance.lastActiveAt = Date.now();

      this.addMessage(session.id, {
        type: 'task_result',
        from: agent.id,
        content: `Task completed: ${task.title}`,
        data: result,
        taskId: task.id,
      });
    } catch (error) {
      task.status = 'failed';
      agent.status = 'error';
      agent.performance.tasksFailed++;
      throw error;
    }
  }

  private async simulateAgentExecution(agent: CollaboratingAgent, task: CollaborationTask): Promise<TaskResult> {
    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));

    // Simulate result
    return {
      success: true,
      data: {
        agentId: agent.id,
        agentName: agent.name,
        taskId: task.id,
        output: `Result from ${agent.name} for task: ${task.title}`,
      },
      summary: `${agent.name} completed ${task.title}`,
      confidence: 0.7 + Math.random() * 0.3,
    };
  }

  private findAgentForRole(session: CollaborationSession, roleId: string): CollaboratingAgent | undefined {
    return Array.from(session.agents.values()).find(a => a.roleId === roleId);
  }

  private findBestAgentForTask(session: CollaborationSession, task: CollaborationTask): CollaboratingAgent | undefined {
    const availableAgents = Array.from(session.agents.values())
      .filter(a => a.status === 'idle');

    if (availableAgents.length === 0) {
      return Array.from(session.agents.values())[0];
    }

    // Score agents based on role match and performance
    const scored = availableAgents.map(agent => {
      let score = 0;
      
      // Role match
      if (task.assignedRole && agent.roleId === task.assignedRole) {
        score += 10;
      }

      // Performance
      score += agent.performance.qualityScore * 5;
      score += (agent.performance.tasksCompleted / (agent.performance.tasksCompleted + agent.performance.tasksFailed + 1)) * 3;

      return { agent, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.agent;
  }

  private areDependenciesMet(session: CollaborationSession, task: CollaborationTask): boolean {
    return task.dependencies.every(depId => {
      const depTask = session.tasks.find(t => t.id === depId);
      return depTask?.status === 'completed';
    });
  }

  private topologicalSort(tasks: CollaborationTask[]): CollaborationTask[] {
    const sorted: CollaborationTask[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (task: CollaborationTask) => {
      if (temp.has(task.id)) {
        throw new Error('Circular dependency detected');
      }
      if (visited.has(task.id)) {
        return;
      }

      temp.add(task.id);
      
      for (const depId of task.dependencies) {
        const depTask = tasks.find(t => t.id === depId);
        if (depTask) {
          visit(depTask);
        }
      }

      temp.delete(task.id);
      visited.add(task.id);
      sorted.push(task);
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        visit(task);
      }
    }

    return sorted;
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private voteOnResults(results: Map<string, TaskResult>): ConsensusResult {
    const votes = new Map<string, number>();
    
    for (const [agentId, result] of results) {
      if (result.success) {
        const key = JSON.stringify(result.data);
        votes.set(key, (votes.get(key) || 0) + result.confidence);
      }
    }

    let winner: string | undefined;
    let maxVotes = 0;
    let totalVotes = 0;

    for (const [key, count] of votes) {
      totalVotes += count;
      if (count > maxVotes) {
        maxVotes = count;
        winner = key;
      }
    }

    const threshold = this.config.consensusThreshold;
    const confidence = totalVotes > 0 ? maxVotes / totalVotes : 0;
    const reached = confidence >= threshold;

    return {
      reached,
      threshold,
      votes: results,
      winner,
      confidence,
    };
  }

  private buildResult(session: CollaborationSession, startTime: number): CollaborationResult {
    const completedTasks = session.tasks.filter(t => t.status === 'completed');
    const failedTasks = session.tasks.filter(t => t.status === 'failed');
    const taskResults = new Map<string, TaskResult>();
    const agentContributions = new Map<string, AgentContribution>();

    for (const task of completedTasks) {
      if (task.result) {
        taskResults.set(task.id, task.result);
      }
    }

    for (const [agentId, agent] of session.agents) {
      agentContributions.set(agentId, {
        agentId,
        agentName: agent.name,
        roleId: agent.roleId,
        tasksCompleted: agent.completedTasks.length,
        contributionScore: agent.performance.qualityScore * agent.completedTasks.length,
        keyInsights: [],
      });
    }

    const endTime = Date.now();

    return {
      sessionId: session.id,
      success: failedTasks.length === 0,
      output: {
        tasks: completedTasks.map(t => ({
          id: t.id,
          title: t.title,
          output: t.output,
        })),
      },
      summary: `Session completed with ${completedTasks.length} tasks completed, ${failedTasks.length} failed`,
      taskResults,
      agentContributions,
      metrics: {
        totalTasks: session.tasks.length,
        completedTasks: completedTasks.length,
        failedTasks: failedTasks.length,
        totalDuration: endTime - startTime,
        averageTaskDuration: completedTasks.length > 0 
          ? completedTasks.reduce((sum, t) => sum + ((t.completedAt || 0) - (t.startedAt || 0)), 0) / completedTasks.length 
          : 0,
        messageCount: session.messages.length,
        conflictCount: 0,
        consensusReached: session.strategy === 'consensus' ? failedTasks.length === 0 : true,
      },
      completedAt: endTime,
    };
  }

  private addMessage(sessionId: string, message: Partial<CollaborationMessage>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.messages.push({
      id: randomUUID(),
      type: message.type || 'coordination',
      from: message.from || 'system',
      to: message.to,
      content: message.content || '',
      data: message.data,
      timestamp: Date.now(),
      taskId: message.taskId,
    });
  }

  private createTask(name: string, type: CollaborationTask['type'], description: string): CollaborationTask {
    return {
      id: randomUUID(),
      title: name,
      description,
      type,
      dependencies: [],
      status: 'pending',
      input: {},
      metadata: {},
      createdAt: Date.now(),
    };
  }

  private suggestRoles(tasks: CollaborationTask[]): AgentRole[] {
    const roleMap = new Map<string, AgentRole>();

    for (const task of tasks) {
      let roleName: string;
      let skills: string[];

      switch (task.type) {
        case 'analysis':
          roleName = 'Analyst';
          skills = ['research', 'data-analysis', 'critical-thinking'];
          break;
        case 'synthesis':
          roleName = 'Synthesizer';
          skills = ['integration', 'summarization', 'pattern-recognition'];
          break;
        case 'execution':
          roleName = 'Executor';
          skills = ['implementation', 'coding', 'problem-solving'];
          break;
        case 'review':
          roleName = 'Reviewer';
          skills = ['validation', 'quality-assurance', 'attention-to-detail'];
          break;
        default:
          roleName = 'Generalist';
          skills = ['adaptability', 'general-knowledge'];
      }

      if (!roleMap.has(roleName)) {
        roleMap.set(roleName, {
          id: roleName.toLowerCase(),
          name: roleName,
          description: `Responsible for ${task.type} tasks`,
          responsibilities: [task.type],
          skills,
          priority: 1,
        });
      }
    }

    return Array.from(roleMap.values());
  }

  private estimateDuration(tasks: CollaborationTask[], complexity: string): number {
    const baseTime = 60000; // 1 minute per task
    const complexityMultiplier: Record<string, number> = {
      low: 1,
      medium: 2,
      high: 4,
    };
    return tasks.length * baseTime * (complexityMultiplier[complexity] || 1);
  }
}

// Singleton instance
let orchestrator: CollaborationOrchestrator | null = null;

export function getCollaborationOrchestrator(config?: Partial<CollaborationConfig>): CollaborationOrchestrator {
  if (!orchestrator) {
    orchestrator = new CollaborationOrchestrator(config);
  }
  return orchestrator;
}

export function setCollaborationOrchestrator(config?: Partial<CollaborationConfig>): void {
  orchestrator = new CollaborationOrchestrator(config);
}

export function resetCollaborationOrchestrator(): void {
  orchestrator = null;
}
