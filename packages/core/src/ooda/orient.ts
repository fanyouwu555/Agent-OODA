// packages/core/src/ooda/orient.ts
import { Observation, Orientation, Intent, Constraint, KnowledgeGap } from '../types';
import { getLLMService } from '../llm/service';

export class Orienter {
  private async getLLM() {
    return getLLMService();
  }
  
  async orient(observation: Observation): Promise<Orientation> {
    const intent = await this.analyzeIntent(observation);
    const constraints = this.identifyConstraints(observation);
    const knowledgeGaps = this.identifyKnowledgeGaps(observation, intent);
    
    return {
      primaryIntent: intent,
      relevantContext: observation.context,
      constraints,
      knowledgeGaps,
    };
  }

  private async analyzeIntent(observation: Observation): Promise<Intent> {
    const llmService = await this.getLLM();
    const prompt = this.buildIntentPrompt(observation);
    const response = await llmService.generate(prompt, { maxTokens: 1000 });
    
    return this.parseIntent(response, observation.userInput);
  }

  private buildIntentPrompt(observation: Observation): string {
    return `分析用户输入并提供简洁回复：

用户输入：${observation.userInput}

请直接回复用户的问题或请求，保持回答简洁明了。`;
  }

  private parseIntent(response: string, userInput: string): Intent {
    // 直接使用 LLM 的回复作为响应内容
    return {
      type: 'general',
      parameters: { response: response.trim() },
      confidence: 0.9,
    };
  }

  private classifyIntentType(input: string): string {
    // 简单的意图分类
    if (input.includes('读取') || input.includes('文件')) {
      return 'file_read';
    } else if (input.includes('写入') || input.includes('保存')) {
      return 'file_write';
    } else if (input.includes('运行') || input.includes('执行')) {
      return 'execute';
    } else if (input.includes('搜索') || input.includes('查询')) {
      return 'search';
    } else {
      return 'general';
    }
  }

  private extractParameters(input: string): Record<string, unknown> {
    // 简单的参数提取
    const params: Record<string, unknown> = {};
    
    // 提取文件路径
    const pathMatch = input.match(/文件[：:]([^\s]+)/);
    if (pathMatch) {
      params.path = pathMatch[1];
    }
    
    // 提取搜索关键词
    const searchMatch = input.match(/搜索[：:]([^\s]+)/);
    if (searchMatch) {
      params.query = searchMatch[1];
    }
    
    return params;
  }

  private identifyConstraints(observation: Observation): Constraint[] {
    const constraints: Constraint[] = [];
    
    // 检查资源约束
    if (observation.environment.resourceUsage.memory > 0.8) {
      constraints.push({
        type: 'resource',
        description: '内存使用过高',
        severity: 'medium',
      });
    }
    
    // 检查时间约束
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      constraints.push({
        type: 'time',
        description: '非工作时间',
        severity: 'low',
      });
    }
    
    return constraints;
  }

  private identifyKnowledgeGaps(observation: Observation, intent: Intent): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];
    
    // 检查是否缺少必要参数
    if (intent.type === 'file_read' && !intent.parameters.path) {
      gaps.push({
        topic: '文件路径',
        importance: 0.9,
        possibleSources: ['用户输入', '当前目录'],
      });
    }
    
    if (intent.type === 'search' && !intent.parameters.query) {
      gaps.push({
        topic: '搜索关键词',
        importance: 0.8,
        possibleSources: ['用户输入'],
      });
    }
    
    return gaps;
  }
}