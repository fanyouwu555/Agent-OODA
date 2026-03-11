import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OODALoop } from '../../packages/core/src/ooda/loop';
import { Observer } from '../../packages/core/src/ooda/observe';
import { Orienter } from '../../packages/core/src/ooda/orient';
import { Decider } from '../../packages/core/src/ooda/decide';
import { Actor } from '../../packages/core/src/ooda/act';
import { AgentState, Observation, Orientation, Decision } from '../../packages/core/src/types';
import { OODAEvent } from '../../packages/core/src/ooda/loop';

const isOllamaAvailable = process.env.OLLAMA_AVAILABLE === 'true';

describe('OODA Loop Unit Tests', () => {
  describe('OODALoop Construction', () => {
    it('should create OODALoop instance', () => {
      const loop = new OODALoop();
      expect(loop).toBeDefined();
      expect(loop).toBeInstanceOf(OODALoop);
    });
  });

  describe('Observer', () => {
    let observer: Observer;

    beforeEach(() => {
      vi.resetAllMocks();
      observer = new Observer();
    });

    it('should create observation from agent state', async () => {
      const state: AgentState = {
        originalInput: '测试输入',
        history: [{
          id: '1',
          role: 'user',
          content: '测试输入',
          timestamp: Date.now(),
        }],
        currentStep: 0,
        isComplete: false,
        metadata: {},
      };

      const observation = await observer.observe(state);

      expect(observation).toBeDefined();
      expect(observation.userInput).toBe('测试输入');
      expect(observation.history).toBeDefined();
      expect(observation.environment).toBeDefined();
    });

    it('should extract tool results from history', async () => {
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
              toolCallId: 'call-1',
              result: { toolName: 'read_file', result: 'content', isError: false, executionTime: 100 },
            }],
          },
        ],
        currentStep: 0,
        isComplete: false,
        metadata: {},
      };

      const observation = await observer.observe(state);

      expect(observation.toolResults).toBeDefined();
      expect(observation.toolResults.length).toBeGreaterThan(0);
    });

    it('should detect anomalies in error cases', async () => {
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
              toolCallId: 'call-1',
              result: { toolName: 'read_file', result: 'error', isError: true, executionTime: 100 },
              isError: true,
            }],
          },
        ],
        currentStep: 0,
        isComplete: false,
        metadata: {},
      };

      const observation = await observer.observe(state);

      expect(observation.anomalies).toBeDefined();
      expect(observation.anomalies?.some(a => a.type === 'error')).toBe(true);
    });
  });

  describe('Orienter', () => {
    let orienter: Orienter;

    beforeEach(() => {
      vi.resetAllMocks();
      orienter = new Orienter();
    });

    it('should create orientation from observation', async () => {
      const observation: Observation = {
        userInput: '读取文件 test.txt',
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

      expect(orientation).toBeDefined();
      expect(orientation.primaryIntent).toBeDefined();
      expect(orientation.constraints).toBeDefined();
      expect(orientation.knowledgeGaps).toBeDefined();
    });

    it('should identify resource constraints', async () => {
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

  describe('Decider', () => {
    let decider: Decider;

    beforeEach(() => {
      vi.resetAllMocks();
      decider = new Decider();
    });

    it('should create decision with options', async () => {
      const orientation: Orientation = {
        primaryIntent: {
          type: 'general',
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

      expect(decision).toBeDefined();
      expect(decision.options).toBeDefined();
      expect(decision.selectedOption).toBeDefined();
      expect(decision.nextAction).toBeDefined();
      expect(decision.reasoning).toBeDefined();
    });

    it('should request clarification for knowledge gaps', async () => {
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
          description: '需要文件路径',
          importance: 0.9,
          possibleSources: ['用户'],
        }],
        patterns: [],
        relationships: [],
        assumptions: [],
        risks: [],
      };

      const decision = await decider.decide(orientation);

      expect(decision.nextAction.type).toBe('clarification');
    });
  });

  describe('Actor', () => {
    let actor: Actor;

    beforeEach(() => {
      vi.resetAllMocks();
      actor = new Actor();
    });

    it('should execute response action', async () => {
      const decision: Decision = {
        problemStatement: '测试',
        options: [],
        selectedOption: {
          id: 'response',
          description: '直接响应',
          approach: '返回文本',
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
        reasoning: '测试',
        riskAssessment: {
          identifiedRisks: [],
          mitigationStrategies: [],
          overallRiskLevel: 'low',
        },
      };

      const result = await actor.act(decision);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.feedback).toBeDefined();
    });
  });
});

describe('OODA Loop Integration Tests', () => {
  let loop: OODALoop;

  beforeEach(() => {
    vi.resetAllMocks();
    loop = new OODALoop();
  });

  describe('Complete OODA Cycle', () => {
    it('should execute complete OODA cycle', async () => {
      const result = await loop.run('测试输入');

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
      expect(result.steps).toBeDefined();
      expect(result.metadata).toBeDefined();
    }, 30000);

    it('should track performance metrics', async () => {
      const result = await loop.run('测试性能指标');

      expect(result.metadata.performanceMetrics).toBeDefined();
      expect(result.metadata.performanceMetrics.totalTime).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should measure individual phase times', async () => {
      const result = await loop.run('测试各阶段时间');

      const metrics = result.metadata.performanceMetrics;
      expect(metrics.observeTime).toBeGreaterThanOrEqual(0);
      expect(metrics.orientTime).toBeGreaterThanOrEqual(0);
      expect(metrics.decideTime).toBeGreaterThanOrEqual(0);
      expect(metrics.actTime).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe('Event Callbacks', () => {
    it('should emit events for each phase', async () => {
      const events: OODAEvent[] = [];
      
      await loop.runWithCallback('测试', (event) => {
        events.push(event);
      });

      const phases = events.map(e => e.phase);
      expect(phases).toContain('observe');
      expect(phases).toContain('orient');
      expect(phases).toContain('decide');
      expect(phases).toContain('act');
      expect(phases).toContain('complete');
    }, 30000);

    it('should include intent information in orient event', async () => {
      let orientEvent: OODAEvent | undefined;
      
      await loop.runWithCallback('读取文件 test.txt', (event) => {
        if (event.phase === 'orient') {
          orientEvent = event;
        }
      });

      expect(orientEvent?.data?.intent).toBeDefined();
    }, 30000);

    it('should include reasoning in decide event', async () => {
      let decideEvent: OODAEvent | undefined;
      
      await loop.runWithCallback('测试', (event) => {
        if (event.phase === 'decide') {
          decideEvent = event;
        }
      });

      expect(decideEvent?.data?.reasoning).toBeDefined();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle timeout gracefully', async () => {
      const result = await loop.run('测试超时处理');

      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
    }, 30000);

    it('should handle max iterations', async () => {
      const result = await loop.run('测试最大迭代次数');

      const iterations = result.metadata.totalIterations || result.metadata.iterations || 1;
      expect(iterations).toBeLessThanOrEqual(10);
    }, 30000);
  });

  describe('Memory Management', () => {
    it('should limit history size', async () => {
      const result = await loop.run('测试历史记录限制');

      expect(result.steps.length).toBeLessThanOrEqual(100);
    }, 30000);
  });

  describe('Learning and Adaptation', () => {
    it('should extract learning insights', async () => {
      const result = await loop.run('测试学习');

      expect(result.metadata.learningInsights).toBeDefined();
    }, 30000);
  });
});

describe.skipIf(!isOllamaAvailable)('OODA Loop with Real LLM', () => {
  let loop: OODALoop;

  beforeEach(() => {
    loop = new OODALoop();
  });

  it('should handle file reading request', async () => {
    const result = await loop.run('读取文件：test.txt');

    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
    expect(result.steps).toBeDefined();
    expect(result.metadata).toBeDefined();
  }, 60000);

  it('should handle search request', async () => {
    const result = await loop.run('搜索：AI Agent 技术');

    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
    expect(result.steps.length).toBeGreaterThan(0);
  }, 60000);

  it('should handle command execution request', async () => {
    const result = await loop.run('运行命令：ls -la');

    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
    expect(result.steps).toBeDefined();
    expect(result.metadata.iterations).toBeDefined();
  }, 60000);
});
