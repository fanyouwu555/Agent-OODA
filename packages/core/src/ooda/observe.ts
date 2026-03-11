// packages/core/src/ooda/observe.ts
import { AgentState, Observation, ToolResult, EnvironmentState, ResourceUsage } from '../types';
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
    
    return {
      userInput: state.originalInput,
      toolResults: this.extractToolResults(state),
      context: this.buildContext(state),
      environment: await this.getEnvironmentState(),
      history: state.history.slice(-10),
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
      if (results.length >= 5) break;
    }
    
    return results.reverse();
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
      availableTools: ['read_file', 'write_file', 'run_bash', 'search_web'],
      resourceUsage: await this.getResourceUsage(),
    };
  }

  private async getResourceUsage(): Promise<ResourceUsage> {
    return {
      memory: 0.5,
      cpu: 0.3,
      network: 0.1,
    };
  }
}
