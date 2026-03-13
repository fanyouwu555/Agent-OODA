// packages/core/src/ooda/observe.ts
import { AgentState, Observation, ToolResult, EnvironmentState, ResourceUsage, Anomaly, Pattern } from '../types';
import { getSessionMemory, SessionMemory } from '../memory';

interface ToolResultData {
  toolName?: string;
  result?: unknown;
  isError?: boolean;
  executionTime?: number;
}

interface ObserverState {
  lastStoredCount: number;
}

class ObserverStateManager {
  private states: Map<string, ObserverState> = new Map();
  
  getState(sessionId: string): ObserverState {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, {
        lastStoredCount: 0,
      });
    }
    return this.states.get(sessionId)!;
  }
  
  resetState(sessionId: string): void {
    this.states.set(sessionId, {
      lastStoredCount: 0,
    });
  }
  
  initLastStoredCount(sessionId: string, count: number): void {
    const state = this.getState(sessionId);
    state.lastStoredCount = count;
  }
  
  clearState(sessionId: string): void {
    this.states.delete(sessionId);
  }
}

const observerStateManager = new ObserverStateManager();

export function resetObserverState(sessionId: string): void {
  observerStateManager.resetState(sessionId);
}

export function initObserverLastStoredCount(sessionId: string, count: number): void {
  observerStateManager.initLastStoredCount(sessionId, count);
}

export class Observer {
  private sessionId: string;
  private sessionMemory: SessionMemory;
  private state: ObserverState;
  
  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sessionMemory = getSessionMemory(sessionId);
    this.state = observerStateManager.getState(sessionId);
  }
  
  async observe(state: AgentState): Promise<Observation> {
    await this.storeToMemory(state);
    
    const toolResults = this.extractToolResults(state);
    const anomalies = this.detectAnomalies(state, toolResults);
    const patterns = this.recognizePatterns(state, toolResults);
    
    const allHistory = this.sessionMemory.getShortTerm().getRecentMessages(100);
    
    return {
      userInput: state.originalInput,
      toolResults,
      context: await this.buildContext(state),
      environment: await this.getEnvironmentState(),
      history: allHistory.length > 0 ? allHistory : state.history,
      anomalies,
      patterns,
    };
  }

  private async storeToMemory(state: AgentState): Promise<void> {
    const newMessages = state.history.slice(this.state.lastStoredCount);
    
    for (const message of newMessages) {
      this.sessionMemory.getShortTerm().storeMessage(message);
    }
    
    this.state.lastStoredCount = state.history.length;
    
    if (state.history.length > 0) {
      const lastMessage = state.history[state.history.length - 1];
      if (lastMessage.role === 'tool' && lastMessage.parts) {
        for (const part of lastMessage.parts) {
          if (part.type === 'tool_result' && !part.isError) {
            const resultData = part.result as ToolResultData;
            await this.sessionMemory.storeExperience(
              JSON.stringify(part.result),
              ['tool', resultData.toolName || 'unknown'],
              0.7
            );
          }
        }
      }
    }
  }

  private extractToolResults(state: AgentState): ToolResult[] {
    const results: ToolResult[] = [];
    
    for (let i = state.history.length - 1; i >= 0; i--) {
      const message = state.history[i];
      if (message.role === 'tool' && message.parts) {
        for (const part of message.parts) {
          if (part.type === 'tool_result') {
            const resultData = part.result as ToolResultData;
            results.push({
              toolName: resultData.toolName || 'unknown',
              result: resultData.result,
              isError: resultData.isError || false,
              executionTime: resultData.executionTime || 0,
            });
          }
        }
      }
      if (results.length >= 10) break;
    }
    
    return results.reverse();
  }

  private detectAnomalies(state: AgentState, toolResults: ToolResult[]): Anomaly[] {
    const anomalies: Anomaly[] = [];
    
    const errorResults = toolResults.filter(r => r.isError);
    if (errorResults.length > 0) {
      const errorRate = errorResults.length / Math.max(toolResults.length, 1);
      anomalies.push({
        type: 'error',
        description: `检测到 ${errorResults.length} 个工具执行错误`,
        severity: errorRate > 0.5 ? 'high' : errorRate > 0.2 ? 'medium' : 'low',
        context: `错误工具: ${errorResults.map(r => r.toolName).join(', ')}`,
      });
    }
    
    const executionTimes = toolResults.map(r => r.executionTime).filter(t => t > 0);
    if (executionTimes.length > 0) {
      const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
      const slowExecutions = toolResults.filter(r => r.executionTime > avgTime * 3);
      if (slowExecutions.length > 0) {
        anomalies.push({
          type: 'warning',
          description: `检测到 ${slowExecutions.length} 个执行时间过长的操作`,
          severity: 'medium',
          context: `慢操作: ${slowExecutions.map(r => r.toolName).join(', ')}`,
        });
      }
    }
    
    const recentHistory = state.history.slice(-20);
    const repeatedActions = this.findRepeatedActions(recentHistory);
    if (repeatedActions.length > 0) {
      anomalies.push({
        type: 'unusual_pattern',
        description: '检测到重复的操作模式',
        severity: 'low',
        context: `重复操作: ${repeatedActions.join(', ')}`,
      });
    }
    
    const failedAttempts = this.countConsecutiveFailures(toolResults);
    if (failedAttempts >= 3) {
      anomalies.push({
        type: 'error',
        description: `连续失败 ${failedAttempts} 次，可能需要调整策略`,
        severity: 'high',
        context: '建议重新评估任务或请求用户帮助',
      });
    }
    
    return anomalies;
  }

  private findRepeatedActions(history: any[]): string[] {
    const actionCounts: Record<string, number> = {};
    
    for (const message of history) {
      if (message.role === 'assistant' && message.parts) {
        for (const part of message.parts) {
          if (part.type === 'tool_call') {
            const key = `${part.toolName}:${JSON.stringify(part.args)}`;
            actionCounts[key] = (actionCounts[key] || 0) + 1;
          }
        }
      }
    }
    
    return Object.entries(actionCounts)
      .filter(([_, count]) => count >= 2)
      .map(([key, _]) => key);
  }

  private countConsecutiveFailures(toolResults: ToolResult[]): number {
    let count = 0;
    for (let i = toolResults.length - 1; i >= 0; i--) {
      if (toolResults[i].isError) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  private recognizePatterns(state: AgentState, toolResults: ToolResult[]): Pattern[] {
    const patterns: Pattern[] = [];
    
    const toolSequence = toolResults.slice(-5).map(r => r.toolName);
    const sequencePatterns = this.findSequencePatterns(toolSequence);
    patterns.push(...sequencePatterns);
    
    const errorPattern = this.analyzeErrorPattern(toolResults);
    if (errorPattern) {
      patterns.push(errorPattern);
    }
    
    const timePattern = this.analyzeTimePattern(toolResults);
    if (timePattern) {
      patterns.push(timePattern);
    }
    
    const behaviorPattern = this.analyzeUserBehavior(state.history);
    if (behaviorPattern) {
      patterns.push(behaviorPattern);
    }
    
    // 新增启发式规则
    const workflowPattern = this.analyzeWorkflowPattern(state.history, toolResults);
    if (workflowPattern) {
      patterns.push(workflowPattern);
    }
    
    const complexityPattern = this.analyzeComplexityPattern(state);
    if (complexityPattern) {
      patterns.push(complexityPattern);
    }
    
    const contextSwitchPattern = this.analyzeContextSwitch(state.history);
    if (contextSwitchPattern) {
      patterns.push(contextSwitchPattern);
    }
    
    return patterns;
  }

  private findSequencePatterns(toolSequence: string[]): Pattern[] {
    const patterns: Pattern[] = [];
    
    if (toolSequence.length >= 2) {
      const pairCounts: Record<string, number> = {};
      for (let i = 0; i < toolSequence.length - 1; i++) {
        const pair = `${toolSequence[i]} -> ${toolSequence[i + 1]}`;
        pairCounts[pair] = (pairCounts[pair] || 0) + 1;
      }
      
      for (const [pair, count] of Object.entries(pairCounts)) {
        if (count >= 2) {
          patterns.push({
            type: 'tool_sequence',
            description: `常见工具序列: ${pair}`,
            significance: 0.7,
            occurrences: count,
          });
        }
      }
    }
    
    const toolFrequency: Record<string, number> = {};
    for (const tool of toolSequence) {
      toolFrequency[tool] = (toolFrequency[tool] || 0) + 1;
    }
    
    for (const [tool, count] of Object.entries(toolFrequency)) {
      if (count >= 3) {
        patterns.push({
          type: 'tool_frequency',
          description: `频繁使用工具: ${tool}`,
          significance: 0.6,
          occurrences: count,
        });
      }
    }
    
    return patterns;
  }

  private analyzeErrorPattern(toolResults: ToolResult[]): Pattern | null {
    const errors = toolResults.filter(r => r.isError);
    if (errors.length === 0) return null;
    
    const errorTools: Record<string, number> = {};
    for (const error of errors) {
      errorTools[error.toolName] = (errorTools[error.toolName] || 0) + 1;
    }
    
    const mostErrorTool = Object.entries(errorTools)
      .sort((a, b) => b[1] - a[1])[0];
    
    if (mostErrorTool) {
      return {
        type: 'error_pattern',
        description: `工具 ${mostErrorTool[0]} 经常出错 (${mostErrorTool[1]} 次)`,
        significance: 0.8,
        occurrences: mostErrorTool[1],
      };
    }
    
    return null;
  }

  private analyzeTimePattern(toolResults: ToolResult[]): Pattern | null {
    const times = toolResults.map(r => r.executionTime).filter(t => t > 0);
    if (times.length < 3) return null;
    
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev > avg) {
      return {
        type: 'time_variance',
        description: `执行时间波动较大 (平均: ${Math.round(avg)}ms, 标准差: ${Math.round(stdDev)}ms)`,
        significance: 0.5,
      };
    }
    
    return null;
  }

  private analyzeUserBehavior(history: any[]): Pattern | null {
    const userMessages = history.filter(m => m.role === 'user');
    if (userMessages.length < 3) return null;
    
    const recentUserInputs = userMessages.slice(-5).map(m => m.content.toLowerCase());
    
    const questionCount = recentUserInputs.filter(c => 
      c.includes('?') || c.includes('？') || c.includes('什么') || c.includes('如何')
    ).length;
    
    if (questionCount >= 3) {
      return {
        type: 'user_behavior',
        description: '用户倾向于提问模式',
        significance: 0.6,
      };
    }
    
    const commandCount = recentUserInputs.filter(c =>
      c.includes('读取') || c.includes('写入') || c.includes('执行') || c.includes('运行')
    ).length;
    
    if (commandCount >= 3) {
      return {
        type: 'user_behavior',
        description: '用户倾向于命令模式',
        significance: 0.6,
      };
    }
    
    return null;
  }

  /**
   * 分析工作流模式 - 检测常见的多步骤工作流
   */
  private analyzeWorkflowPattern(history: any[], toolResults: ToolResult[]): Pattern | null {
    const recentTools = toolResults.slice(-8);
    if (recentTools.length < 3) return null;
    
    const toolNames = recentTools.map(r => r.toolName);
    
    // 检测读写工作流: read -> edit -> write
    const readIndex = toolNames.indexOf('read_file');
    const writeIndex = toolNames.indexOf('write_file');
    if (readIndex !== -1 && writeIndex !== -1 && readIndex < writeIndex) {
      return {
        type: 'workflow',
        description: '检测到文件编辑工作流 (读取-修改-写入)',
        significance: 0.85,
      };
    }
    
    // 检测搜索-分析工作流
    const searchIndex = toolNames.findIndex(n => n.includes('search'));
    const analysisIndex = toolNames.findIndex(n => 
      n.includes('analysis') || n.includes('analyze')
    );
    if (searchIndex !== -1 && analysisIndex !== -1 && searchIndex < analysisIndex) {
      return {
        type: 'workflow',
        description: '检测到搜索-分析工作流',
        significance: 0.8,
      };
    }
    
    // 检测调试工作流: run -> error -> read -> edit
    const runIndex = toolNames.indexOf('run_bash');
    const errorCount = recentTools.filter(r => r.isError).length;
    if (runIndex !== -1 && errorCount > 0 && readIndex !== -1 && runIndex < readIndex) {
      return {
        type: 'workflow',
        description: '检测到调试工作流 (运行-错误-修复)',
        significance: 0.9,
      };
    }
    
    return null;
  }

  /**
   * 分析复杂度模式 - 评估当前任务的复杂度
   */
  private analyzeComplexityPattern(state: AgentState): Pattern | null {
    const historyLength = state.history.length;
    const stepCount = state.currentStep;
    const inputLength = state.originalInput.length;
    
    let complexity = 0;
    let description = '';
    
    // 基于历史记录长度判断
    if (historyLength > 50) {
      complexity = 0.9;
      description = '高复杂度任务: 大量历史交互';
    } else if (historyLength > 20) {
      complexity = 0.7;
      description = '中等复杂度任务: 较多历史交互';
    } else if (stepCount > 10) {
      complexity = 0.8;
      description = '高复杂度任务: 多步骤执行';
    } else if (inputLength > 500) {
      complexity = 0.6;
      description = '中等复杂度任务: 详细输入';
    }
    
    // 检测多文件操作
    const fileOperations = state.history.filter(m => 
      m.parts?.some((p: any) => 
        p.type === 'tool_call' && 
        (p.toolName === 'read_file' || p.toolName === 'write_file')
      )
    );
    const uniqueFiles = new Set(
      fileOperations.flatMap(m => 
        m.parts?.filter((p: any) => p.type === 'tool_call')
          .map((p: any) => p.args?.path)
      ).filter(Boolean)
    );
    
    if (uniqueFiles.size > 5) {
      complexity = Math.max(complexity, 0.85);
      description = description || '高复杂度任务: 多文件操作';
    }
    
    if (complexity > 0) {
      return {
        type: 'complexity',
        description,
        significance: complexity,
      };
    }
    
    return null;
  }

  /**
   * 分析上下文切换模式 - 检测用户是否频繁切换话题
   */
  private analyzeContextSwitch(history: any[]): Pattern | null {
    if (history.length < 6) return null;
    
    const userMessages = history.filter(m => m.role === 'user').slice(-6);
    if (userMessages.length < 3) return null;
    
    // 提取关键词进行简单的话题检测
    const extractKeywords = (text: string): string[] => {
      const keywords = [
        '文件', '代码', '函数', '类', '测试', 'bug', '错误',
        'file', 'code', 'function', 'class', 'test', 'bug', 'error',
        '配置', '设置', 'config', 'setting',
        '数据库', 'db', 'database',
        '网络', '请求', 'api', 'network', 'request',
      ];
      return keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
    };
    
    const messageKeywords = userMessages.map(m => extractKeywords(m.content));
    
    // 检测话题切换
    let switchCount = 0;
    for (let i = 1; i < messageKeywords.length; i++) {
      const prev = messageKeywords[i - 1];
      const curr = messageKeywords[i];
      
      // 如果没有共同关键词，认为是话题切换
      const common = prev.filter(k => curr.includes(k));
      if (common.length === 0 && prev.length > 0 && curr.length > 0) {
        switchCount++;
      }
    }
    
    if (switchCount >= 2) {
      return {
        type: 'context_switch',
        description: `检测到频繁话题切换 (${switchCount}次)`,
        significance: 0.75,
      };
    }
    
    return null;
  }

  private async buildContext(state: AgentState) {
    const recentMessages = this.sessionMemory.getShortTerm().getRecentMessages(5);
    console.log(`[Observer] buildContext: sessionMemory has ${recentMessages.length} recent messages`);
    recentMessages.forEach((msg, i) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`  [${i}] ${msg.role}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
    });
    
    return {
      relevantFacts: await this.getRelevantFacts(state.originalInput),
      recentEvents: recentMessages,
      userPreferences: this.getUserPreferences(),
    };
  }

  private async getRelevantFacts(query: string): Promise<string[]> {
    // 如果没有长期记忆，直接返回空
    const ltMemory = this.sessionMemory.getLongTerm();
    if (ltMemory.size() === 0) {
      return [];
    }
    const memories = await ltMemory.search(query, { limit: 3 });
    return memories.map(m => m.content);
  }

  private getUserPreferences(): Record<string, unknown> {
    return {
      language: 'zh-CN',
      timezone: 'Asia/Shanghai',
    };
  }

  private async getEnvironmentState(): Promise<EnvironmentState> {
    return {
      currentTime: Date.now(),
      availableTools: this.getAvailableTools(),
      resourceUsage: await this.getResourceUsage(),
    };
  }

  private getAvailableTools(): string[] {
    return [
      'read_file',
      'write_file',
      'run_bash',
      'search_web',
      'grep',
      'glob',
      'ls',
    ];
  }

  private async getResourceUsage(): Promise<ResourceUsage> {
    const usage = process.memoryUsage();
    const totalMemory = 1024 * 1024 * 1024;
    
    return {
      memory: Math.min(usage.heapUsed / totalMemory, 1),
      cpu: 0.3,
      network: 0.1,
    };
  }
}
