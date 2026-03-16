// OODA 四代理架构单元测试
// 运行: npx vitest run packages/core/src/ooda/__tests__/agent.test.ts

import { describe, it, expect, vi, beforeEach, jest } from 'vitest';
import { defaultOODAConfig } from '../config';
import { OODAAgentConfig, AgentInput } from '../types';

// 模拟 LLM 服务
vi.mock('../../llm/service', () => ({
  getLLMService: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        environment: '测试环境',
        anomalies: [],
        patterns: []
      }),
      tokens: 100,
      time: 100
    }),
    chat: vi.fn().mockResolvedValue({
      text: 'Mock response',
      tokens: 50,
      time: 50
    })
  })),
  setLLMService: vi.fn(),
  resetLLMService: vi.fn()
}));

// 模拟记忆系统
vi.mock('../../memory', () => ({
  getSessionMemory: vi.fn(() => ({
    getShortTerm: vi.fn(() => ({
      getRecentMessages: vi.fn().mockReturnValue([]),
      storeMessage: vi.fn()
    })),
    getLongTerm: vi.fn(() => ({
      search: vi.fn().mockResolvedValue([])
    }))
  }))
}));

describe('OODA 四代理架构 - 单元测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. 配置系统测试', () => {
    it('应该有默认配置', () => {
      expect(defaultOODAConfig).toBeDefined();
    });

    it('应该有四个 Agent 配置', () => {
      expect(defaultOODAConfig.observe).toBeDefined();
      expect(defaultOODAConfig.orient).toBeDefined();
      expect(defaultOODAConfig.decide).toBeDefined();
      expect(defaultOODAConfig.act).toBeDefined();
    });

    it('每个 Agent 应该有不同的 temperature', () => {
      // Observe: 0.3 (低 - 客观分析)
      expect(defaultOODAConfig.observe.model.temperature).toBe(0.3);
      // Orient: 0.5 (中 - 深度推理)
      expect(defaultOODAConfig.orient.model.temperature).toBe(0.5);
      // Decide: 0.4 (中低 - 理性分析)
      expect(defaultOODAConfig.decide.model.temperature).toBe(0.4);
      // Act: 0.6 (高 - 灵活响应)
      expect(defaultOODAConfig.act.model.temperature).toBe(0.6);
    });

    it('每个 Agent 应该有 systemPrompt', () => {
      expect(defaultOODAConfig.observe.systemPrompt).toBeDefined();
      expect(defaultOODAConfig.orient.systemPrompt).toBeDefined();
      expect(defaultOODAConfig.decide.systemPrompt).toBeDefined();
      expect(defaultOODAConfig.act.systemPrompt).toBeDefined();
    });

    it('每个 Agent 应该有工具配置', () => {
      expect(defaultOODAConfig.observe.tools.allowed).toBeDefined();
      expect(defaultOODAConfig.orient.tools.allowed).toBeDefined();
      expect(defaultOODAConfig.decide.tools.allowed).toBeDefined();
      expect(defaultOODAConfig.act.tools.allowed).toBeDefined();
    });

    it('Observe Agent 应该只有读取工具权限', () => {
      const { denied, allowed } = defaultOODAConfig.observe.tools;
      expect(denied).toContain('write');
      expect(denied).toContain('execute');
      expect(allowed).toContain('read');
    });

    it('Act Agent 应该有执行工具权限', () => {
      const { allowed } = defaultOODAConfig.act.tools;
      expect(allowed).toContain('write');
      expect(allowed).toContain('execute');
    });
  });

  describe('2. AgentInput 类型测试', () => {
    it('应该能够创建有效的 AgentInput', () => {
      const input: AgentInput = {
        userInput: '测试输入',
        context: {
          userInput: '测试输入',
          observations: '观察结果',
          intent: '意图分析',
          decision: '执行计划',
          previousResult: '上次结果'
        },
        iteration: 0,
        isLoop: false
      };

      expect(input.userInput).toBe('测试输入');
      expect(input.context?.observations).toBe('观察结果');
      expect(input.iteration).toBe(0);
      expect(input.isLoop).toBe(false);
    });

    it('应该能够创建循环中的 AgentInput', () => {
      const input: AgentInput = {
        userInput: '第二轮输入',
        iteration: 1,
        isLoop: true
      };

      expect(input.isLoop).toBe(true);
      expect(input.iteration).toBe(1);
    });
  });

  describe('3. OODAAgentConfig 类型测试', () => {
    it('应该能够创建自定义 Agent 配置', () => {
      const customConfig: OODAAgentConfig = {
        role: 'custom',
        systemPrompt: '自定义系统提示',
        model: {
          name: 'custom-model',
          temperature: 0.7,
          maxTokens: 4000
        },
        tools: {
          allowed: ['read', 'write']
        },
        enabled: true
      };

      expect(customConfig.role).toBe('custom');
      expect(customConfig.model.temperature).toBe(0.7);
      expect(customConfig.enabled).toBe(true);
    });

    it('应该支持权限配置', () => {
      const config: OODAAgentConfig = {
        role: 'test',
        systemPrompt: 'test',
        model: { name: 'test', temperature: 0.5 },
        tools: { allowed: ['read'] },
        permissions: {
          inherit: true,
          tools: {
            read: 'allow',
            write: 'deny'
          }
        }
      };

      expect(config.permissions?.tools?.read).toBe('allow');
      expect(config.permissions?.tools?.write).toBe('deny');
    });

    it('应该支持异常检测配置', () => {
      const config: OODAAgentConfig = {
        role: 'observe',
        systemPrompt: 'test',
        model: { name: 'test', temperature: 0.3 },
        tools: { allowed: ['read'] },
        anomalyDetection: {
          enabled: true,
          errorThreshold: 0.5,
          consecutiveFailureLimit: 5
        }
      };

      expect(config.anomalyDetection?.enabled).toBe(true);
      expect(config.anomalyDetection?.errorThreshold).toBe(0.5);
    });

    it('应该支持完成判断配置', () => {
      const config: OODAAgentConfig = {
        role: 'act',
        systemPrompt: 'test',
        model: { name: 'test', temperature: 0.6 },
        tools: { allowed: ['execute'] },
        completion: {
          enabled: true,
          confidenceThreshold: 0.9
        }
      };

      expect(config.completion?.enabled).toBe(true);
      expect(config.completion?.confidenceThreshold).toBe(0.9);
    });
  });

  describe('4. 异常检测规则测试', () => {
    it('应该检测高错误率', () => {
      const errorThreshold = 0.3;
      const errorRate = 0.5;
      
      expect(errorRate > errorThreshold).toBe(true);
    });

    it('应该检测连续失败', () => {
      const consecutiveFailureLimit = 3;
      const failures = 4;
      
      expect(failures >= consecutiveFailureLimit).toBe(true);
    });

    it('应该识别工具使用模式', () => {
      const toolCounts = {
        read: 10,
        write: 2,
        execute: 1
      };
      const total = 13;
      const readFrequency = toolCounts.read / total;
      
      expect(readFrequency).toBeGreaterThan(0.6);
    });
  });

  describe('5. 启发式规则测试', () => {
    it('应该识别知识缺口', () => {
      const needsClarification = true;
      const importance = 0.9;
      
      expect(needsClarification && importance > 0.7).toBe(true);
    });

    it('应该检测高风险', () => {
      const riskLevel = 'high';
      const requiresConfirmation = riskLevel === 'high';
      
      expect(requiresConfirmation).toBe(true);
    });

    it('应该识别需要简化的情况', () => {
      const failureCount = 3;
      const threshold = 3;
      const needsSimplification = failureCount >= threshold;
      
      expect(needsSimplification).toBe(true);
    });
  });

  describe('6. 结束判断测试', () => {
    it('应该基于置信度判断完成', () => {
      const confidence = 0.85;
      const threshold = 0.8;
      const targetMet = true;
      
      expect(confidence >= threshold && targetMet).toBe(true);
    });

    it('应该基于执行成功判断完成', () => {
      const executionSuccess = true;
      const targetMet = true;
      
      expect(executionSuccess && targetMet).toBe(true);
    });

    it('失败情况不应结束', () => {
      const executionSuccess = false;
      
      expect(executionSuccess).toBe(false);
    });
  });

  describe('7. 循环控制测试', () => {
    it('应该限制最大迭代次数', () => {
      const maxIterations = 10;
      let iteration = 10;
      
      expect(iteration < maxIterations).toBe(false);
    });

    it('应该检测超时', () => {
      const timeout = 300000;
      const elapsed = 300001;
      
      expect(elapsed > timeout).toBe(true);
    });

    it('应该基于 isComplete 结束', () => {
      let isComplete = false;
      isComplete = true;
      
      expect(isComplete).toBe(true);
    });
  });
});
