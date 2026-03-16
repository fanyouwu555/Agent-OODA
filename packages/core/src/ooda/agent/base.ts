// packages/core/src/ooda/agent/base.ts
// OODA Agent 基类 - 为四个代理提供通用的 LLM 调用、权限检查、工具执行能力

import { OODAAgentConfig, AgentInput, AgentOutput } from '../types';
import { LLMService } from '../../llm/service';
import { getUnifiedToolRegistry } from '../../tool/registry';
import type { UnifiedToolRegistry } from '../../tool/interface';
import { getSkillRegistry } from '../../skill/registry';
import type { SkillRegistry } from '../../skill/interface';
import { getEnhancedPermissionManager } from '../../permission/enhanced-manager';
import type { EnhancedPermissionManager } from '../../permission/enhanced';
import { PermissionMode } from '../../permission';
import { getSessionMemory } from '../../memory';

export interface AgentDependencies {
  llmService: LLMService;
  toolRegistry?: UnifiedToolRegistry;
  skillRegistry?: SkillRegistry;
  permissionManager?: EnhancedPermissionManager;
}

export abstract class BaseOODAAgent {
  protected config: OODAAgentConfig;
  protected sessionId: string;
  protected llmService: LLMService;
  protected toolRegistry: UnifiedToolRegistry;
  protected skillRegistry: SkillRegistry;
  protected permissionManager: EnhancedPermissionManager;
  protected sessionMemory: ReturnType<typeof getSessionMemory>;

  constructor(
    config: OODAAgentConfig,
    sessionId: string,
    dependencies: AgentDependencies
  ) {
    this.config = config;
    this.sessionId = sessionId;
    this.llmService = dependencies.llmService;
    this.toolRegistry = dependencies.toolRegistry || getUnifiedToolRegistry();
    this.skillRegistry = dependencies.skillRegistry || getSkillRegistry();
    this.permissionManager = dependencies.permissionManager || getEnhancedPermissionManager();
    this.sessionMemory = getSessionMemory(sessionId);
  }

  abstract execute(input: AgentInput): Promise<AgentOutput>;

  protected async callLLM(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      onToken?: (token: string) => void;
    }
  ): Promise<{ text: string; tokens: number; time: number }> {
    const modelConfig = this.config.model;
    const response = await this.llmService.generate(userPrompt, {
      systemPrompt,
      temperature: options?.temperature ?? modelConfig.temperature,
      maxTokens: options?.maxTokens ?? modelConfig.maxTokens,
    });

    return {
      text: response.text,
      tokens: response.tokens,
      time: response.time,
    };
  }

  protected buildSystemPrompt(): string {
    return this.config.systemPrompt;
  }

  protected buildUserPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`## 用户输入\n${input.userInput}`);

    if (input.context) {
      if (input.context.observations) {
        parts.push(`## 环境观察\n${input.context.observations}`);
      }
      if (input.context.intent) {
        parts.push(`## 意图分析\n${input.context.intent}`);
      }
      if (input.context.decision) {
        parts.push(`## 执行计划\n${input.context.decision}`);
      }
      if (input.context.previousResult) {
        parts.push(`## 上次执行结果\n${input.context.previousResult}`);
      }
      if (input.context.historySummary) {
        parts.push(`## 历史摘要\n${input.context.historySummary}`);
      }
    }

    if (input.isLoop) {
      parts.push(`\n## 当前状态\n这是第 ${input.iteration + 1} 次迭代，请基于以上上下文继续分析。`);
    }

    return parts.join('\n\n');
  }

  protected checkPermission(toolName: string): PermissionMode {
    const agentName = this.config.role;
    const result = this.permissionManager.checkPermissionSync(toolName, agentName);
    return result.mode;
  }

  protected async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const permission = this.checkPermission(toolName);

    if (permission === PermissionMode.DENY) {
      throw new Error(`Permission denied for tool: ${toolName}`);
    }

    const executionContext = {
      workingDirectory: process.cwd(),
      sessionId: this.sessionId,
      maxExecutionTime: 60000,
      resources: {
        memory: 512,
        cpu: 50,
      },
    };

    return this.toolRegistry.execute(toolName, args, executionContext);
  }

  protected getAllowedTools(): string[] {
    return this.config.tools?.allowed || [];
  }

  protected getAllowedSkills(): string[] {
    return this.config.skills?.allowed || [];
  }
}
