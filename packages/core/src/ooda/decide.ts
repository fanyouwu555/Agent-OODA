// packages/core/src/ooda/decide.ts
import { Orientation, Decision, Action, ActionPlan, Subtask, DependencyGraph } from '../types';
import { getLLMService } from '../llm/service';

export class Decider {
  private async getLLM() {
    return getLLMService();
  }
  
  async decide(orientation: Orientation): Promise<Decision> {
    // 如果 orient 阶段已经得到了回复，直接返回响应动作
    const response = orientation.primaryIntent.parameters?.response;
    if (response && typeof response === 'string') {
      return {
        plan: {
          subtasks: [],
          dependencies: { nodes: [], edges: [] },
          currentStep: 0,
        },
        nextAction: {
          type: 'response',
          content: response,
        },
        reasoning: '直接回复用户',
      };
    }
    
    const plan = await this.createPlan(orientation);
    const nextAction = this.selectNextAction(plan);
    const reasoning = this.generateSimpleReasoning(orientation, plan, nextAction);
    
    return {
      plan,
      nextAction,
      reasoning,
    };
  }

  private async createPlan(orientation: Orientation): Promise<ActionPlan> {
    const subtasks = await this.decomposeTask(orientation);
    const dependencies = this.buildDependencyGraph(subtasks);
    
    return {
      subtasks,
      dependencies,
      currentStep: 0,
    };
  }

  private async decomposeTask(orientation: Orientation): Promise<Subtask[]> {
    const intent = orientation.primaryIntent;
    const llmService = await this.getLLM();
    
    const prompt = this.buildDecomposePrompt(orientation);
    const response = await llmService.generate(prompt);
    
    try {
      const parsed = JSON.parse(response);
      return parsed.subtasks || this.getDefaultSubtasks(intent);
    } catch (e) {
      return this.getDefaultSubtasks(intent);
    }
  }

  private buildDecomposePrompt(orientation: Orientation): string {
    const intent = orientation.primaryIntent;
    return `分解任务：

意图：${intent.type}
参数：${JSON.stringify(intent.parameters)}
约束：${orientation.constraints.map(c => c.description).join(', ')}

请将任务分解为具体的子任务，每个子任务包含：
- id：唯一标识符
- description：描述
- toolName：工具名称（read_file, write_file, run_bash, search_web）
- args：工具参数
- dependencies：依赖的子任务ID

输出格式：
{"subtasks": [{"id": "1", "description": "...", "toolName": "...", "args": {...}, "dependencies": []}]}`;
  }

  private getDefaultSubtasks(intent: any): Subtask[] {
    const subtasks: Subtask[] = [];
    
    // 根据意图创建子任务
    switch (intent.type) {
      case 'file_read':
        subtasks.push({
          id: 'read_file',
          description: '读取文件内容',
          toolName: 'read_file',
          args: { path: intent.parameters.path },
          dependencies: [],
        });
        break;
        
      case 'file_write':
        subtasks.push({
          id: 'write_file',
          description: '写入文件内容',
          toolName: 'write_file',
          args: { 
            path: intent.parameters.path,
            content: intent.parameters.content 
          },
          dependencies: [],
        });
        break;
        
      case 'execute':
        subtasks.push({
          id: 'run_bash',
          description: '执行命令',
          toolName: 'run_bash',
          args: { command: intent.parameters.command },
          dependencies: [],
        });
        break;
        
      case 'search':
        subtasks.push({
          id: 'search_web',
          description: '搜索网络',
          toolName: 'search_web',
          args: { query: intent.parameters.query },
          dependencies: [],
        });
        break;
        
      default:
        // 对于通用意图，直接生成响应
        break;
    }
    
    return subtasks;
  }

  private buildDependencyGraph(subtasks: Subtask[]): DependencyGraph {
    return {
      nodes: subtasks.map(task => task.id),
      edges: [], // 简单实现，没有依赖关系
    };
  }

  private selectNextAction(plan: ActionPlan): Action {
    if (plan.subtasks.length === 0) {
      // 没有子任务，直接生成响应
      return {
        type: 'response',
        content: '我需要更多信息来执行这个任务',
      };
    }
    
    const currentTask = plan.subtasks[plan.currentStep];
    return {
      type: 'tool_call',
      toolName: currentTask.toolName,
      args: currentTask.args,
    };
  }

  private generateSimpleReasoning(
    orientation: Orientation,
    plan: ActionPlan,
    nextAction: Action
  ): string {
    if (nextAction.type === 'response') {
      return '根据分析，直接回复用户';
    }
    
    return `分析用户意图: ${orientation.primaryIntent.type}\n` +
           `执行计划: ${plan.subtasks.map(t => t.description).join(', ')}\n` +
           `下一步行动: 调用 ${nextAction.toolName} 工具`;
  }
}