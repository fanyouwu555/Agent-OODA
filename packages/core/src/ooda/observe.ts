// packages/core/src/ooda/observe.ts
import { AgentState, Observation, ToolResult, EnvironmentState, ResourceUsage, Anomaly, Pattern } from '../types';
import { getMemory } from '../memory';

interface ToolResultData {
  toolName?: string;
  result?: unknown;
  isError?: boolean;
  executionTime?: number;
}

export class Observer {
  private memory = getMemory();
  
  async observe(state: AgentState): Promise<Observation> {
    this.storeToMemory(state);
    
    const toolResults = this.extractToolResults(state);
    const anomalies = this.detectAnomalies(state, toolResults);
    const patterns = this.recognizePatterns(state, toolResults);
    
    return {
      userInput: state.originalInput,
      toolResults,
      context: this.buildContext(state),
      environment: await this.getEnvironmentState(),
      history: state.history.slice(-10),
      anomalies,
      patterns,
    };
  }

  private storeToMemory(state: AgentState): void {
    for (const message of state.history) {
      this.memory.getShortTerm().storeMessage(message);
    }
    
    if (state.history.length > 0) {
      const lastMessage = state.history[state.history.length - 1];
      if (lastMessage.role === 'tool' && lastMessage.parts) {
        for (const part of lastMessage.parts) {
          if (part.type === 'tool_result' && !part.isError) {
            const resultData = part.result as ToolResultData;
            this.memory.getLongTerm().store({
              content: JSON.stringify(part.result),
              embedding: [],
              metadata: {
                type: 'experience',
                source: 'tool_result',
                tags: ['tool', resultData.toolName || 'unknown'],
                related: [],
              },
              importance: 0.7,
            });
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

  private buildContext(state: AgentState) {
    const recentMessages = this.memory.getShortTerm().getRecentMessages(5);
    
    return {
      relevantFacts: this.getRelevantFacts(state.originalInput),
      recentEvents: recentMessages,
      userPreferences: this.getUserPreferences(),
    };
  }

  private getRelevantFacts(query: string): string[] {
    const memories = this.memory.getLongTerm().search(query, 3);
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
