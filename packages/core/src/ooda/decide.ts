import { 
  Orientation, 
  Decision, 
  Action, 
  ActionPlan, 
  Subtask, 
  DependencyGraph,
  Option,
  RiskAssessment,
  IdentifiedRisk
} from '../types';
import { getLLMService } from '../llm/service';
import { ChatMessage } from '../llm/provider';

interface DecisionAnalysis {
  problemStatement: string;
  options: Option[];
  recommendedOption: string;
  reasoning: string;
  risks: IdentifiedRisk[];
  mitigationStrategies: string[];
  suggestedResponse?: string;
}

export class Decider {
  private async getLLM() {
    return getLLMService();
  }
  
  async decide(orientation: Orientation): Promise<Decision> {
    const analysis = await this.performDecisionAnalysis(orientation);
    
    const selectedOption = analysis.options.find(o => o.id === analysis.recommendedOption) || analysis.options[0];
    
    const plan = await this.createPlan(orientation, selectedOption);
    
    const nextAction = await this.selectNextAction(plan, orientation, analysis);
    
    const riskAssessment = this.buildRiskAssessment(analysis);
    
    return {
      problemStatement: analysis.problemStatement,
      options: analysis.options,
      selectedOption,
      plan,
      nextAction,
      reasoning: analysis.reasoning,
      riskAssessment,
    };
  }

  private async performDecisionAnalysis(orientation: Orientation): Promise<DecisionAnalysis> {
    const llmService = await this.getLLM();
    const prompt = this.buildDecisionPrompt(orientation);
    const response = await llmService.generate(prompt, { maxTokens: 3000 });
    
    return this.parseDecisionResponse(response.text, orientation);
  }

  private buildDecisionPrompt(orientation: Orientation): string {
    const intent = orientation.primaryIntent;
    const constraints = orientation.constraints.map(c => `- ${c.description} (${c.severity})`).join('\n');
    const gaps = orientation.knowledgeGaps.map(g => `- ${g.topic}: ${g.description || '需要更多信息'}`).join('\n');
    const patterns = orientation.patterns.map(p => `- ${p.description}`).join('\n');
    const risks = orientation.risks.map(r => `- ${r}`).join('\n');
    const history = orientation.relevantContext?.recentEvents || [];

    return `作为OODA循环的Decide阶段，你需要基于Orient阶段的分析，生成多个可选方案并选择最佳方案。

## Orient阶段分析结果

### 用户意图
- 类型: ${intent.type}
- 参数: ${JSON.stringify(intent.parameters)}
- 置信度: ${intent.confidence}
- 原始输入: ${intent.rawInput || '无'}

### 约束条件
${constraints || '无特殊约束'}

### 知识缺口
${gaps || '无明显缺口'}

### 识别的模式
${patterns || '无特殊模式'}

### 潜在风险
${risks || '无已识别风险'}

## 决策任务

请生成至少3个可选方案来处理用户的请求，然后选择最佳方案。

### 方案评估标准
1. 技术正确性和健壮性
2. 可维护性和代码质量
3. 性能影响
4. 安全性考虑
5. 实现复杂度
6. 与现有模式的一致性

### 输出格式 (JSON)
{
  "problemStatement": "清晰的问题陈述",
  "options": [
    {
      "id": "option_1",
      "description": "方案描述",
      "approach": "具体方法",
      "pros": ["优点1", "优点2"],
      "cons": ["缺点1", "缺点2"],
      "estimatedComplexity": "low|medium|high",
      "estimatedImpact": "low|medium|high",
      "riskLevel": "low|medium|high",
      "score": 0.85
    }
  ],
  "recommendedOption": "option_1",
  "reasoning": "选择该方案的详细理由",
  "suggestedResponse": "如果这是需要直接回答的问题，在这里给出建议的回答内容",
  "risks": [
    {
      "description": "风险描述",
      "probability": 0.3,
      "impact": 0.7,
      "mitigation": "缓解措施"
    }
  ],
  "mitigationStrategies": ["策略1", "策略2"]
}

请只输出JSON，不要有其他内容。`;
  }

  private parseDecisionResponse(response: string, orientation: Orientation): DecisionAnalysis {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        const options: Option[] = (parsed.options || []).map((o: any) => ({
          id: o.id || `option_${Math.random().toString(36).substr(2, 9)}`,
          description: o.description || '未命名方案',
          approach: o.approach || '',
          pros: o.pros || [],
          cons: o.cons || [],
          estimatedComplexity: o.estimatedComplexity || 'medium',
          estimatedImpact: o.estimatedImpact || 'medium',
          riskLevel: o.riskLevel || 'medium',
          score: typeof o.score === 'number' ? o.score : 0.5,
        }));
        
        if (options.length === 0) {
          options.push(this.createDefaultOption(orientation));
        }
        
        return {
          problemStatement: parsed.problemStatement || `处理用户请求: ${orientation.primaryIntent.type}`,
          options,
          recommendedOption: parsed.recommendedOption || options[0].id,
          reasoning: parsed.reasoning || '基于分析选择最佳方案',
          suggestedResponse: parsed.suggestedResponse,
          risks: parsed.risks || [],
          mitigationStrategies: parsed.mitigationStrategies || [],
        };
      }
    } catch (e) {
      console.warn('[Decide] Failed to parse LLM response:', e);
    }
    
    return this.fallbackDecision(orientation);
  }

  private fallbackDecision(orientation: Orientation): DecisionAnalysis {
    const options = [this.createDefaultOption(orientation)];
    
    return {
      problemStatement: `处理用户请求: ${orientation.primaryIntent.type}`,
      options,
      recommendedOption: options[0].id,
      reasoning: '使用默认方案处理请求',
      risks: [],
      mitigationStrategies: [],
    };
  }

  private createDefaultOption(orientation: Orientation): Option {
    const intent = orientation.primaryIntent;
    let approach = '';
    
    switch (intent.type) {
      case 'file_read':
        approach = '使用文件读取工具获取文件内容';
        break;
      case 'file_write':
        approach = '使用文件写入工具保存内容';
        break;
      case 'execute':
        approach = '使用命令执行工具运行命令';
        break;
      case 'search':
        approach = '使用搜索工具查找信息';
        break;
      case 'code_analysis':
        approach = '分析代码并提供解释';
        break;
      case 'question':
        approach = '直接回答用户问题';
        break;
      default:
        approach = '根据上下文生成响应';
    }
    
    return {
      id: 'default_option',
      description: `${intent.type} 的标准处理方案`,
      approach,
      pros: ['实现简单', '风险较低'],
      cons: ['可能不是最优解'],
      estimatedComplexity: 'low',
      estimatedImpact: 'medium',
      riskLevel: 'low',
      score: 0.6,
    };
  }

  private async createPlan(orientation: Orientation, selectedOption: Option): Promise<ActionPlan> {
    const subtasks = await this.decomposeTask(orientation, selectedOption);
    const dependencies = this.buildDependencyGraph(subtasks);
    
    return {
      subtasks,
      dependencies,
      currentStep: 0,
      estimatedSteps: subtasks.length,
    };
  }

  private async decomposeTask(orientation: Orientation, selectedOption: Option): Promise<Subtask[]> {
    const intent = orientation.primaryIntent;
    
    if (intent.type === 'question' || intent.type === 'general') {
      return [];
    }
    
    const llmService = await this.getLLM();
    const prompt = this.buildDecomposePrompt(orientation, selectedOption);
    const response = await llmService.generate(prompt);
    
    try {
      const parsed = JSON.parse(response.text);
      if (parsed.subtasks && Array.isArray(parsed.subtasks)) {
        return parsed.subtasks.map((s: any) => ({
          id: s.id || `task_${Math.random().toString(36).substr(2, 9)}`,
          description: s.description || '',
          toolName: s.toolName || 'unknown',
          args: s.args || {},
          dependencies: s.dependencies || [],
          status: 'pending' as const,
        }));
      }
    } catch (e) {
      console.warn('[Decide] Failed to parse decompose response:', e);
    }
    
    return this.getDefaultSubtasks(intent);
  }

  private buildDecomposePrompt(orientation: Orientation, selectedOption: Option): string {
    return `基于选定的方案，将任务分解为具体的子任务。

## 选定方案
- 描述: ${selectedOption.description}
- 方法: ${selectedOption.approach}

## 用户意图
- 类型: ${orientation.primaryIntent.type}
- 参数: ${JSON.stringify(orientation.primaryIntent.parameters)}

## 约束条件
${orientation.constraints.map(c => c.description).join(', ')}

## 输出格式 (JSON)
{
  "subtasks": [
    {
      "id": "step_1",
      "description": "步骤描述",
      "toolName": "工具名称 (read_file, write_file, run_bash, search_web)",
      "args": {"参数名": "参数值"},
      "dependencies": ["依赖的任务ID"]
    }
  ]
}

请只输出JSON。`;
  }

  private getDefaultSubtasks(intent: any): Subtask[] {
    const subtasks: Subtask[] = [];
    
    switch (intent.type) {
      case 'file_read':
        subtasks.push({
          id: 'read_file',
          description: '读取文件内容',
          toolName: 'read_file',
          args: { path: intent.parameters.path || '.' },
          dependencies: [],
          status: 'pending',
        });
        break;
        
      case 'file_write':
        subtasks.push({
          id: 'write_file',
          description: '写入文件内容',
          toolName: 'write_file',
          args: { 
            path: intent.parameters.path || './output.txt',
            content: intent.parameters.content || ''
          },
          dependencies: [],
          status: 'pending',
        });
        break;
        
      case 'execute':
        subtasks.push({
          id: 'run_bash',
          description: '执行命令',
          toolName: 'run_bash',
          args: { command: intent.parameters.command || 'echo "Hello"' },
          dependencies: [],
          status: 'pending',
        });
        break;
        
      case 'search':
        subtasks.push({
          id: 'search_web',
          description: '搜索网络',
          toolName: 'search_web',
          args: { query: intent.parameters.query || '' },
          dependencies: [],
          status: 'pending',
        });
        break;
    }
    
    return subtasks;
  }

  private buildDependencyGraph(subtasks: Subtask[]): DependencyGraph {
    const nodes = subtasks.map(t => t.id);
    const edges: { from: string; to: string }[] = [];
    
    for (const task of subtasks) {
      for (const dep of task.dependencies) {
        edges.push({ from: dep, to: task.id });
      }
    }
    
    return { nodes, edges };
  }

  private async selectNextAction(
    plan: ActionPlan, 
    orientation: Orientation,
    analysis: DecisionAnalysis
  ): Promise<Action> {
    if (orientation.knowledgeGaps.some(g => g.importance > 0.8)) {
      const gap = orientation.knowledgeGaps.find(g => g.importance > 0.8);
      return {
        type: 'clarification',
        clarificationQuestion: `请提供更多信息: ${gap?.topic}`,
      };
    }
    
    if (plan.subtasks.length === 0) {
      const response = await this.generateLLMResponse(orientation, analysis);
      return {
        type: 'response',
        content: response,
      };
    }
    
    const pendingTasks = plan.subtasks.filter(t => t.status === 'pending');
    if (pendingTasks.length === 0) {
      return {
        type: 'response',
        content: '任务已完成',
      };
    }
    
    const currentTask = pendingTasks[0];
    return {
      type: 'tool_call',
      toolName: currentTask.toolName,
      args: currentTask.args,
    };
  }

  private async generateLLMResponse(
    orientation: Orientation, 
    analysis: DecisionAnalysis
  ): Promise<string> {
    if (analysis.suggestedResponse && analysis.suggestedResponse.length > 20) {
      return analysis.suggestedResponse;
    }
    
    const llmService = await this.getLLM();
    const intent = orientation.primaryIntent;
    
    const history: ChatMessage[] = [];
    if (orientation.relevantContext?.recentEvents) {
      for (const event of orientation.relevantContext.recentEvents.slice(-5)) {
        if (event.role === 'user' || event.role === 'assistant') {
          history.push({
            role: event.role,
            content: event.content || '',
          });
        }
      }
    }
    
    const systemPrompt = this.buildResponseSystemPrompt(orientation);
    const userPrompt = this.buildResponseUserPrompt(orientation, analysis);
    
    const result = await llmService.generate(userPrompt, {
      systemPrompt,
      history,
      maxTokens: 1500,
    });
    
    return result.text || '我理解您的请求，但暂时无法给出详细回答。';
  }

  private buildResponseSystemPrompt(orientation: Orientation): string {
    const intent = orientation.primaryIntent;
    
    return `你是一个智能助手，正在帮助用户解决问题。

当前任务类型: ${intent.type}
任务描述: ${orientation.primaryIntent.rawInput || '用户请求'}

请根据以下原则回答:
1. 直接回应用户的问题或请求
2. 提供准确、有帮助的信息
3. 如果需要执行操作，说明将要执行的操作
4. 保持回答简洁明了
5. 如果信息不足，礼貌地请求更多信息`;
  }

  private buildResponseUserPrompt(
    orientation: Orientation, 
    analysis: DecisionAnalysis
  ): string {
    const intent = orientation.primaryIntent;
    const selectedOption = analysis.options.find(o => o.id === analysis.recommendedOption) || analysis.options[0];
    
    let prompt = `用户输入: ${intent.rawInput || '无'}\n\n`;
    prompt += `分析结果:\n`;
    prompt += `- 意图类型: ${intent.type}\n`;
    prompt += `- 问题陈述: ${analysis.problemStatement}\n`;
    prompt += `- 推荐方案: ${selectedOption?.description || '直接回答'}\n`;
    prompt += `- 决策理由: ${analysis.reasoning}\n`;
    
    if (orientation.constraints.length > 0) {
      prompt += `\n约束条件:\n`;
      orientation.constraints.forEach(c => {
        prompt += `- ${c.description}\n`;
      });
    }
    
    prompt += `\n请直接回答用户的问题或请求，不要输出JSON格式。`;
    
    return prompt;
  }

  private buildRiskAssessment(analysis: DecisionAnalysis): RiskAssessment {
    const overallRiskLevel = analysis.risks.length > 0
      ? (analysis.risks.some(r => r.probability * r.impact > 0.5) ? 'high' : 'medium')
      : 'low';
    
    return {
      identifiedRisks: analysis.risks,
      mitigationStrategies: analysis.mitigationStrategies,
      overallRiskLevel: overallRiskLevel as 'low' | 'medium' | 'high',
    };
  }
}
