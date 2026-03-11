import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Observer } from '../../packages/core/src/ooda/observe';
import { Orienter } from '../../packages/core/src/ooda/orient';
import { Decider } from '../../packages/core/src/ooda/decide';
import { Actor } from '../../packages/core/src/ooda/act';
import { OODALoop } from '../../packages/core/src/ooda/loop';
import { AgentState, Observation, Orientation, Decision, ActionResult } from '../../packages/core/src/types';

vi.mock('../../packages/core/src/llm/service', () => ({
  getLLMService: () => ({
    generate: vi.fn().mockImplementation((prompt: string) => {
      if (prompt.includes('分析用户输入')) {
        return Promise.resolve(JSON.stringify({
          intentType: 'file_read',
          parameters: { path: '/test/file.txt' },
          confidence: 0.85,
          patterns: [{ type: 'file_operation', description: '文件读取模式', significance: 0.8 }],
          relationships: [],
          assumptions: ['用户提供了文件路径'],
          risks: ['文件可能不存在'],
        }));
      }
      if (prompt.includes('生成至少3个可选方案')) {
        return Promise.resolve(JSON.stringify({
          problemStatement: '读取指定文件内容',
          options: [
            {
              id: 'option_1',
              description: '直接读取文件',
              approach: '使用read_file工具',
              pros: ['简单直接', '执行快速'],
              cons: ['需要文件存在'],
              estimatedComplexity: 'low',
              estimatedImpact: 'medium',
              riskLevel: 'low',
              score: 0.85,
            },
            {
              id: 'option_2',
              description: '先检查文件存在再读取',
              approach: '先ls再read_file',
              pros: ['更安全'],
              cons: ['需要两步操作'],
              estimatedComplexity: 'medium',
              estimatedImpact: 'medium',
              riskLevel: 'low',
              score: 0.75,
            },
            {
              id: 'option_3',
              description: '使用搜索工具查找文件',
              approach: '使用glob搜索',
              pros: ['可以找到相似文件'],
              cons: ['可能返回多个结果'],
              estimatedComplexity: 'medium',
              estimatedImpact: 'low',
              riskLevel: 'medium',
              score: 0.6,
            },
          ],
          recommendedOption: 'option_1',
          reasoning: '用户明确指定了文件路径，直接读取最高效',
          risks: [],
          mitigationStrategies: [],
        }));
      }
      if (prompt.includes('分解任务')) {
        return Promise.resolve(JSON.stringify({
          subtasks: [
            {
              id: 'read_file',
              description: '读取文件内容',
              toolName: 'read_file',
              args: { path: '/test/file.txt' },
              dependencies: [],
            },
          ],
        }));
      }
      return Promise.resolve('{}');
    }),
  }),
}));

vi.mock('../../packages/core/src/memory', () => ({
  getMemory: () => ({
    getShortTerm: () => ({
      storeMessage: vi.fn(),
      getRecentMessages: vi.fn().mockReturnValue([]),
    }),
    getLongTerm: () => ({
      store: vi.fn(),
      search: vi.fn().mockReturnValue([]),
    }),
  }),
}));

vi.mock('../../packages/core/src/mcp/service', () => ({
  getMCPService: () => ({
    publishEvent: vi.fn(),
    publishError: vi.fn(),
  }),
}));

vi.mock('../../packages/core/src/permission', () => ({
  getPermissionManager: () => ({
    requestPermission: vi.fn().mockResolvedValue({ allowed: true, mode: 'auto', message: '' }),
  }),
  PermissionMode: { Auto: 'auto', Ask: 'ask', Deny: 'deny' },
}));

vi.mock('../../packages/tools/src/registry', () => ({
  ToolRegistry: class {
    get() {
      return {
        execute: vi.fn().mockResolvedValue({ content: 'file content' }),
      };
    }
  },
}));

vi.mock('../../packages/core/src/skill/registry', () => ({
  getSkillRegistry: () => ({
    execute: vi.fn().mockResolvedValue({ result: 'skill result' }),
  }),
}));

describe('OODA Observer', () => {
  let observer: Observer;

  beforeEach(() => {
    observer = new Observer();
  });

  describe('observe', () => {
    it('should return observation with correct structure', async () => {
      const state: AgentState = {
        originalInput: '读取文件 /test/file.txt',
        history: [{
          id: '1',
          role: 'user',
          content: '读取文件 /test/file.txt',
          timestamp: Date.now(),
        }],
        currentStep: 0,
        isComplete: false,
        metadata: {},
      };

      const observation = await observer.observe(state);

      expect(observation).toBeDefined();
      expect(observation.userInput).toBe('读取文件 /test/file.txt');
      expect(observation.toolResults).toBeDefined();
      expect(observation.context).toBeDefined();
      expect(observation.environment).toBeDefined();
      expect(observation.history).toBeDefined();
    });

    it('should detect anomalies in tool results', async () => {
      const state: AgentState = {
        originalInput: '测试',
        history: [
          { id: '1', role: 'user', content: '测试', timestamp: Date.now() },
          { 
            id: '2', 
            role: 'tool', 
            content: 'error', 
            timestamp: Date.now(), 
            parts: [{ 
              type: 'tool_result', 
              toolCallId: '1', 
              result: { toolName: 'test', result: 'error', isError: true, executionTime: 100 } 
            }] 
          },
        ],
        currentStep: 0,
        isComplete: false,
        metadata: {},
      };

      const observation = await observer.observe(state);

      expect(observation.anomalies).toBeDefined();
      expect(observation.anomalies?.length).toBeGreaterThan(0);
    });

    it('should recognize patterns in tool usage', async () => {
      const state: AgentState = {
        originalInput: '测试',
        history: [
          { id: '1', role: 'user', content: '测试', timestamp: Date.now() },
          { 
            id: '2', 
            role: 'tool', 
            content: 'result', 
            timestamp: Date.now(), 
            parts: [{ 
              type: 'tool_result', 
              toolCallId: '1', 
              result: { toolName: 'read_file', result: 'content', isError: false, executionTime: 100 } 
            }] 
          },
          { 
            id: '3', 
            role: 'tool', 
            content: 'result', 
            timestamp: Date.now(), 
            parts: [{ 
              type: 'tool_result', 
              toolCallId: '2', 
              result: { toolName: 'read_file', result: 'content', isError: false, executionTime: 100 } 
            }] 
          },
          { 
            id: '4', 
            role: 'tool', 
            content: 'result', 
            timestamp: Date.now(), 
            parts: [{ 
              type: 'tool_result', 
              toolCallId: '3', 
              result: { toolName: 'read_file', result: 'content', isError: false, executionTime: 100 } 
            }] 
          },
        ],
        currentStep: 0,
        isComplete: false,
        metadata: {},
      };

      const observation = await observer.observe(state);

      expect(observation.patterns).toBeDefined();
    });
  });
});

describe('OODA Orienter', () => {
  let orienter: Orienter;

  beforeEach(() => {
    orienter = new Orienter();
  });

  describe('orient', () => {
    it('should return orientation with correct structure', async () => {
      const observation: Observation = {
        userInput: '读取文件 /test/file.txt',
        toolResults: [],
        context: {
          relevantFacts: [],
          recentEvents: [],
          userPreferences: {},
        },
        environment: {
          currentTime: Date.now(),
          availableTools: ['read_file', 'write_file'],
          resourceUsage: { memory: 0.5, cpu: 0.3, network: 0.1 },
        },
        history: [],
      };

      const orientation = await orienter.orient(observation);

      expect(orientation).toBeDefined();
      expect(orientation.primaryIntent).toBeDefined();
      expect(orientation.constraints).toBeDefined();
      expect(orientation.knowledgeGaps).toBeDefined();
      expect(orientation.patterns).toBeDefined();
      expect(orientation.relationships).toBeDefined();
      expect(orientation.assumptions).toBeDefined();
      expect(orientation.risks).toBeDefined();
    });

    it('should analyze intent correctly', async () => {
      const observation: Observation = {
        userInput: '读取文件 /test/file.txt',
        toolResults: [],
        context: {
          relevantFacts: [],
          recentEvents: [],
          userPreferences: {},
        },
        environment: {
          currentTime: Date.now(),
          availableTools: ['read_file'],
          resourceUsage: { memory: 0.5, cpu: 0.3, network: 0.1 },
        },
        history: [],
      };

      const orientation = await orienter.orient(observation);

      expect(orientation.primaryIntent.type).toBeDefined();
      expect(orientation.primaryIntent.confidence).toBeGreaterThan(0);
    });

    it('should identify constraints based on resource usage', async () => {
      const observation: Observation = {
        userInput: '测试',
        toolResults: [],
        context: {
          relevantFacts: [],
          recentEvents: [],
          userPreferences: {},
        },
        environment: {
          currentTime: Date.now(),
          availableTools: [],
          resourceUsage: { memory: 0.9, cpu: 0.9, network: 0.1 },
        },
        history: [],
      };

      const orientation = await orienter.orient(observation);

      const resourceConstraints = orientation.constraints.filter(c => c.type === 'resource');
      expect(resourceConstraints.length).toBeGreaterThan(0);
    });
  });
});

describe('OODA Decider', () => {
  let decider: Decider;

  beforeEach(() => {
    decider = new Decider();
  });

  describe('decide', () => {
    it('should return decision with multiple options', async () => {
      const orientation: Orientation = {
        primaryIntent: {
          type: 'file_read',
          parameters: { path: '/test/file.txt' },
          confidence: 0.85,
        },
        relevantContext: {
          relevantFacts: [],
          recentEvents: [],
          userPreferences: {},
        },
        constraints: [],
        knowledgeGaps: [],
        patterns: [],
        relationships: [],
        assumptions: [],
        risks: [],
      };

      const decision = await decider.decide(orientation);

      expect(decision).toBeDefined();
      expect(decision.options).toBeDefined();
      expect(decision.options.length).toBeGreaterThanOrEqual(1);
      expect(decision.selectedOption).toBeDefined();
      expect(decision.plan).toBeDefined();
      expect(decision.nextAction).toBeDefined();
      expect(decision.reasoning).toBeDefined();
      expect(decision.riskAssessment).toBeDefined();
    });

    it('should select the recommended option', async () => {
      const orientation: Orientation = {
        primaryIntent: {
          type: 'file_read',
          parameters: { path: '/test/file.txt' },
          confidence: 0.85,
        },
        relevantContext: {
          relevantFacts: [],
          recentEvents: [],
          userPreferences: {},
        },
        constraints: [],
        knowledgeGaps: [],
        patterns: [],
        relationships: [],
        assumptions: [],
        risks: [],
      };

      const decision = await decider.decide(orientation);

      expect(decision.selectedOption).toBeDefined();
      expect(decision.selectedOption.score).toBeGreaterThanOrEqual(0);
    });

    it('should request clarification for high importance knowledge gaps', async () => {
      const orientation: Orientation = {
        primaryIntent: {
          type: 'file_read',
          parameters: {},
          confidence: 0.5,
        },
        relevantContext: {
          relevantFacts: [],
          recentEvents: [],
          userPreferences: {},
        },
        constraints: [],
        knowledgeGaps: [{
          topic: '文件路径',
          description: '需要知道要读取哪个文件',
          importance: 0.9,
          possibleSources: ['用户输入'],
        }],
        patterns: [],
        relationships: [],
        assumptions: [],
        risks: [],
      };

      const decision = await decider.decide(orientation);

      expect(decision.nextAction.type).toBe('clarification');
    });

    it('should include problem statement', async () => {
      const orientation: Orientation = {
        primaryIntent: {
          type: 'file_read',
          parameters: {},
          confidence: 0.8,
        },
        relevantContext: {
          relevantFacts: [],
          recentEvents: [],
          userPreferences: {},
        },
        constraints: [],
        knowledgeGaps: [],
        patterns: [],
        relationships: [],
        assumptions: [],
        risks: [],
      };

      const decision = await decider.decide(orientation);

      expect(decision.problemStatement).toBeDefined();
      expect(decision.problemStatement.length).toBeGreaterThan(0);
    });
  });
});

describe('OODA Actor', () => {
  let actor: Actor;

  beforeEach(() => {
    actor = new Actor();
  });

  describe('act', () => {
    it('should return ActionResult with feedback', async () => {
      const decision: Decision = {
        problemStatement: '测试',
        options: [{
          id: 'option_1',
          description: '测试选项',
          approach: '测试方法',
          pros: [],
          cons: [],
          estimatedComplexity: 'low',
          estimatedImpact: 'low',
          riskLevel: 'low',
          score: 0.8,
        }],
        selectedOption: {
          id: 'option_1',
          description: '测试选项',
          approach: '测试方法',
          pros: [],
          cons: [],
          estimatedComplexity: 'low',
          estimatedImpact: 'low',
          riskLevel: 'low',
          score: 0.8,
        },
        plan: {
          subtasks: [],
          dependencies: { nodes: [], edges: [] },
          currentStep: 0,
          estimatedSteps: 0,
        },
        nextAction: {
          type: 'response',
          content: '测试响应',
        },
        reasoning: '测试推理',
        riskAssessment: {
          identifiedRisks: [],
          mitigationStrategies: [],
          overallRiskLevel: 'low',
        },
      };

      const result = await actor.act(decision);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.result).toBeDefined();
      expect(result.sideEffects).toBeDefined();
      expect(result.feedback).toBeDefined();
    });

    it('should generate feedback for tool calls', async () => {
      const decision: Decision = {
        problemStatement: '测试',
        options: [{
          id: 'option_1',
          description: '测试选项',
          approach: '测试方法',
          pros: [],
          cons: [],
          estimatedComplexity: 'low',
          estimatedImpact: 'low',
          riskLevel: 'low',
          score: 0.8,
        }],
        selectedOption: {
          id: 'option_1',
          description: '测试选项',
          approach: '测试方法',
          pros: [],
          cons: [],
          estimatedComplexity: 'low',
          estimatedImpact: 'low',
          riskLevel: 'low',
          score: 0.8,
        },
        plan: {
          subtasks: [{
            id: 'task_1',
            description: '读取文件',
            toolName: 'read_file',
            args: { path: '/test/file.txt' },
            dependencies: [],
            status: 'pending',
          }],
          dependencies: { nodes: ['task_1'], edges: [] },
          currentStep: 0,
          estimatedSteps: 1,
        },
        nextAction: {
          type: 'tool_call',
          toolName: 'read_file',
          args: { path: '/test/file.txt' },
        },
        reasoning: '测试推理',
        riskAssessment: {
          identifiedRisks: [],
          mitigationStrategies: [],
          overallRiskLevel: 'low',
        },
      };

      const result = await actor.act(decision);

      expect(result.feedback).toBeDefined();
      expect(result.feedback.observations).toBeDefined();
    });

    it('should handle clarification action', async () => {
      const decision: Decision = {
        problemStatement: '测试',
        options: [],
        selectedOption: {
          id: 'clarify',
          description: '请求澄清',
          approach: '询问用户',
          pros: [],
          cons: [],
          estimatedComplexity: 'low',
          estimatedImpact: 'low',
          riskLevel: 'low',
          score: 0.5,
        },
        plan: {
          subtasks: [],
          dependencies: { nodes: [], edges: [] },
          currentStep: 0,
          estimatedSteps: 0,
        },
        nextAction: {
          type: 'clarification',
          clarificationQuestion: '请提供文件路径',
        },
        reasoning: '需要更多信息',
        riskAssessment: {
          identifiedRisks: [],
          mitigationStrategies: [],
          overallRiskLevel: 'low',
        },
      };

      const result = await actor.act(decision);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
    });
  });
});

describe('OODA Loop', () => {
  let loop: OODALoop;

  beforeEach(() => {
    loop = new OODALoop();
  });

  describe('run', () => {
    it('should execute complete OODA cycle', async () => {
      const result = await loop.run('读取文件 /test/file.txt');

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.steps).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should track performance metrics', async () => {
      const result = await loop.run('测试');

      expect(result.metadata.performanceMetrics).toBeDefined();
    });

    it('should call callback with events', async () => {
      const events: string[] = [];
      
      await loop.runWithCallback('测试', (event) => {
        events.push(event.phase);
      });

      expect(events).toContain('observe');
      expect(events).toContain('orient');
      expect(events).toContain('decide');
      expect(events).toContain('act');
      expect(events).toContain('complete');
    });

    it('should limit iterations', async () => {
      const result = await loop.run('测试');

      const iterations = result.metadata.totalIterations || result.metadata.iterations || 1;
      expect(iterations).toBeLessThanOrEqual(10);
    });
  });

  describe('feedback loop', () => {
    it('should extract learning insights', async () => {
      const result = await loop.run('读取文件 /test/file.txt');

      expect(result.metadata.learningInsights).toBeDefined();
    });
  });
});

describe('OODA Integration', () => {
  it('should pass data correctly between phases', async () => {
    const loop = new OODALoop();
    const phases: Record<string, boolean> = {};
    
    await loop.runWithCallback('读取文件 /test/file.txt', (event) => {
      phases[event.phase] = true;
    });

    expect(phases['observe']).toBe(true);
    expect(phases['orient']).toBe(true);
    expect(phases['decide']).toBe(true);
    expect(phases['act']).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    const loop = new OODALoop();
    
    const result = await loop.run('这是一个无效的请求');

    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
  });
});
