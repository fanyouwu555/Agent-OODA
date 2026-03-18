import { 
  Orientation, 
  Decision, 
  Action, 
  ActionPlan, 
  Subtask, 
  DependencyGraph,
  Option,
  RiskAssessment,
  IdentifiedRisk,
  ReasoningStep,
  FallbackStrategy,
  ThinkingCallback
} from '../types';
import { OODAPhaseModelConfig } from './types';
import { LLMService } from '../llm/service';
import { getLLMConnectionPool } from '../llm/connection-pool';
import { ChatMessage, StreamOptions } from '../llm/provider';
import { ToolSelector, getToolSelector } from './tool-selector';

// 使用统一的 ThinkingCallback 类型
export type DecideThinkingCallback = ThinkingCallback;

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
  private toolSelector: ToolSelector;
  private phaseModelConfig?: OODAPhaseModelConfig;
  
  constructor(phaseModelConfig?: OODAPhaseModelConfig) {
    this.toolSelector = getToolSelector();
    this.phaseModelConfig = phaseModelConfig;
  }

  /**
   * 获取 Decide 阶段的 LLM 服务（使用连接池）
   * 如果配置了阶段模型，使用配置的模型；否则使用默认模型
   */
  private async getLLM(): Promise<LLMService> {
    const pool = getLLMConnectionPool();
    
    if (this.phaseModelConfig?.decide) {
      const { provider, model } = this.phaseModelConfig.decide;
      return pool.acquire({ type: provider as any, model });
    }
    return pool.acquire();
  }
  
  /**
   * 释放 LLM 服务回连接池
   */
  private releaseLLM(service: LLMService): void {
    const pool = getLLMConnectionPool();
    pool.release(service);
  }

  /**
   * 更新阶段模型配置
   */
  setPhaseModelConfig(config: OODAPhaseModelConfig) {
    this.phaseModelConfig = config;
  }
  
  async decide(orientation: Orientation): Promise<Decision> {
    const analysis = await this.performDecisionAnalysis(orientation);
    
    const selectedOption = analysis.options.find(o => o.id === analysis.recommendedOption) || analysis.options[0];
    
    const plan = await this.createPlan(orientation, selectedOption);
    
    const nextAction = await this.selectNextAction(plan, orientation, analysis);
    
    const riskAssessment = this.buildRiskAssessment(analysis);
    
    // 生成ReAct推理链
    const reasoningChain = this.generateReasoningChain(orientation, selectedOption, nextAction);
    
    return {
      problemStatement: analysis.problemStatement,
      options: analysis.options,
      selectedOption,
      plan,
      nextAction,
      reasoning: analysis.reasoning,
      riskAssessment,
      reasoningChain,
      decisionMetadata: {
        confidence: orientation.primaryIntent.confidence,
        alternativesConsidered: analysis.options.map(o => o.id),
        successCriteria: this.extractSuccessCriteria(orientation),
      },
    };
  }
  
  /**
   * 生成ReAct风格的推理链
   */
  private generateReasoningChain(
    orientation: Orientation,
    selectedOption: Option,
    nextAction: Action
  ): ReasoningStep[] {
    const chain: ReasoningStep[] = [];
    const intent = orientation.primaryIntent;
    
    // Step 1: 理解问题
    chain.push({
      step: 1,
      thought: `用户意图是${intent.type}，置信度${Math.round(intent.confidence * 100)}%`,
    });
    
    // Step 2: 分析约束
    if (orientation.constraints.length > 0) {
      const criticalConstraints = orientation.constraints
        .filter(c => c.severity === 'high')
        .map(c => c.description)
        .join('、');
      if (criticalConstraints) {
        chain.push({
          step: 2,
          thought: `需要考虑约束: ${criticalConstraints}`,
        });
      }
    }
    
    // Step 3: 方案选择
    chain.push({
      step: 3,
      thought: `选择方案: ${selectedOption.description}`,
      action: selectedOption.approach,
    });
    
    // Step 4: 风险评估
    if (orientation.risks.length > 0) {
      chain.push({
        step: 4,
        thought: `潜在风险: ${orientation.risks.join('; ')}`,
      });
    }
    
    // Step 5: 执行动作
    if (nextAction.type === 'tool_call') {
      chain.push({
        step: 5,
        thought: `执行工具: ${nextAction.toolName}`,
        action: `${nextAction.toolName}(${JSON.stringify(nextAction.args)})`,
      });
      
      // 添加自我反思（如果失败了怎么办）
      nextAction.selfCritique = this.generateSelfCritique(nextAction, orientation);
      
      // 添加备用策略
      nextAction.fallbackStrategy = this.generateFallbackStrategy(nextAction, orientation);
    }
    
    return chain;
  }
  
  /**
   * 生成自我反思：如果失败了怎么办
   */
  private generateSelfCritique(action: Action, orientation: Orientation): string {
    if (action.type !== 'tool_call') return '';
    
    const toolName = action.toolName || '';
    
    // 针对不同工具的自我反思
    const critiques: Record<string, string> = {
      read_file: '如果读取失败，可能是路径错误，需要检查文件是否存在或尝试glob搜索',
      write_file: '如果写入失败，可能是权限问题或目录不存在，需要先创建目录',
      run_bash: '如果命令失败，可能是命令不存在或参数错误，需要检查命令是否正确',
      search_web: '如果搜索失败，可能是网络问题或查询词不当，需要简化查询',
    };
    
    return critiques[toolName] || '如果执行失败，需要分析错误信息并尝试备用方案';
  }
  
  /**
   * 生成备用策略
   */
  private generateFallbackStrategy(action: Action, orientation: Orientation): FallbackStrategy {
    const toolName = action.toolName || '';
    
    const strategies: Record<string, FallbackStrategy> = {
      read_file: {
        condition: '文件不存在',
        alternativeTool: 'glob',
        alternativeArgs: { pattern: action.args?.path },
        simplifiedTask: true,
      },
      run_bash: {
        condition: '命令不存在',
        alternativeTool: 'run_bash',
        alternativeArgs: { command: 'echo "命令执行失败"' },
        simplifiedTask: true,
      },
    };
    
    return strategies[toolName] || {
      condition: '执行失败',
      simplifiedTask: true,
    };
  }
  
  /**
   * 提取成功标准
   */
  private extractSuccessCriteria(orientation: Orientation): string[] {
    const criteria: string[] = [];
    const intentType = orientation.primaryIntent.type;
    
    switch (intentType) {
      case 'question':
        criteria.push('提供准确的答案', '回答清晰易懂');
        break;
      case 'file_read':
        criteria.push('成功读取文件内容', '返回完整内容');
        break;
      case 'file_write':
        criteria.push('成功写入文件', '内容正确保存');
        break;
      case 'execute':
        criteria.push('命令执行成功', '返回预期结果');
        break;
      case 'search':
        criteria.push('找到相关信息', '结果相关度高');
        break;
      default:
        criteria.push('完成任务', '用户满意');
    }
    
    return criteria;
  }

  /**
   * 流式版本的 decide - 实时推送 LLM 决策过程
   */
  async decideStream(orientation: Orientation, onThinking?: DecideThinkingCallback): Promise<Decision> {
    // 发送开始决策的消息
    if (onThinking) {
      await onThinking('thinking', '🎯 正在制定执行方案...');
    }

    const analysis = await this.performDecisionAnalysisStream(orientation, onThinking);
    
    const selectedOption = analysis.options.find(o => o.id === analysis.recommendedOption) || analysis.options[0];
    
    // 发送方案选择结果
    if (onThinking) {
      await onThinking('decision', `📋 选择方案: ${selectedOption?.description || '默认方案'}`);
    }

    const plan = await this.createPlan(orientation, selectedOption);
    
    if (onThinking) {
      const taskCount = plan.subtasks.length;
      await onThinking('thinking', taskCount > 0 
        ? `📦 任务分解: ${taskCount} 个子任务` 
        : '✨ 无需分解任务，直接执行');
    }
    
    const nextAction = await this.selectNextAction(plan, orientation, analysis);
    
    // 发送最终决策
    if (onThinking) {
      if (nextAction.type === 'response') {
        await onThinking('reasoning', '💬 准备生成回复...');
      } else if (nextAction.type === 'tool_call') {
        await onThinking('reasoning', `🔧 准备调用工具: ${nextAction.toolName}`);
      } else if (nextAction.type === 'clarification') {
        await onThinking('reasoning', `❓ 需要澄清: ${nextAction.clarificationQuestion}`);
      }
    }
    
    const riskAssessment = this.buildRiskAssessment(analysis);
    
    // 生成ReAct推理链
    const reasoningChain = this.generateReasoningChain(orientation, selectedOption, nextAction);
    
    // 发送推理链摘要
    if (onThinking && reasoningChain) {
      for (const step of reasoningChain) {
        await onThinking('reasoning', `🔹 步骤${step.step}: ${step.thought}`);
      }
    }
    
    return {
      problemStatement: analysis.problemStatement,
      options: analysis.options,
      selectedOption,
      plan,
      nextAction,
      reasoning: analysis.reasoning,
      riskAssessment,
      reasoningChain,
      decisionMetadata: {
        confidence: orientation.primaryIntent.confidence,
        alternativesConsidered: analysis.options.map(o => o.id),
        successCriteria: this.extractSuccessCriteria(orientation),
      },
    };
  }

  /**
   * 流式版本的决策分析 - 实时推送 LLM 思考过程
   */
  private async performDecisionAnalysisStream(
    orientation: Orientation, 
    onThinking?: DecideThinkingCallback
  ): Promise<DecisionAnalysis> {
    const llmService = await this.getLLM();
    const prompt = this.buildDecisionPrompt(orientation);
    
    if (onThinking) {
      await onThinking('thinking', '🔄 正在调用 LLM 生成决策方案...');
    }
    
    // 使用流式调用 LLM
    let fullResponse = '';
    const streamOptions: StreamOptions = {
      maxTokens: 1000,
      onToken: (token) => {
        fullResponse += token;
      },
    };
    
    for await (const token of llmService.stream(prompt, streamOptions)) {
      // 可以按需节流推送
      if (onThinking && fullResponse.length % 30 === 0) {
        await onThinking('decision', `💭 方案生成中: ${fullResponse.slice(-20)}...`);
      }
    }
    
    if (onThinking) {
      await onThinking('decision', '✅ 方案生成完成');
    }
    
    return this.parseDecisionResponse(fullResponse, orientation);
  }

  private async performDecisionAnalysis(orientation: Orientation): Promise<DecisionAnalysis> {
    const llmService = await this.getLLM();
    const prompt = this.buildDecisionPrompt(orientation);
    const response = await llmService.generate(prompt, { maxTokens: 1000 });
    
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
    // 改进：生成多个方案，而不是只有一个默认选项
    const options = this.createMultipleOptions(orientation);
    
    return {
      problemStatement: `处理用户请求: ${orientation.primaryIntent.type}`,
      options,
      recommendedOption: options[0].id,
      reasoning: '基于分析选择最佳方案',
      risks: [],
      mitigationStrategies: [],
    };
  }

  /**
   * 创建多个可选方案 - 改进版
   * 针对新闻摘要等场景，生成专门的方案
   */
  private createMultipleOptions(orientation: Orientation): Option[] {
    const options: Option[] = [];
    const intent = orientation.primaryIntent;
    
    // 检查是否是新闻摘要类型的请求
    const isNewsSummary = intent.parameters?.knowledgeGap === 'news_summary' ||
                          intent.parameters?.knowledgeGap === 'realtime_info';
    
    // 方案1：默认处理方案（基础）
    options.push(this.createDefaultOption(orientation));
    
    // 如果是新闻相关请求，添加专门的方案
    if (isNewsSummary) {
      // 方案2：搜索并生成摘要（推荐用于新闻）
      options.push({
        id: 'search_with_summary',
        description: '搜索新闻并生成摘要',
        approach: '使用 web_search 获取新闻链接，然后调用 LLM 生成简洁摘要',
        pros: ['直接提供新闻内容而非网站链接', '用户无需点击链接', '信息密度高'],
        cons: ['处理时间稍长', '依赖搜索结果质量'],
        estimatedComplexity: 'medium',
        estimatedImpact: 'high',
        riskLevel: 'low',
        score: 0.85,
      });
      
      // 方案3：多源新闻汇总
      options.push({
        id: 'multi_source_summary',
        description: '多源新闻汇总',
        approach: '从多个新闻源获取信息，生成综合摘要',
        pros: ['信息更全面', '可对比不同来源'],
        cons: ['复杂度更高', '可能信息过载'],
        estimatedComplexity: 'high',
        estimatedImpact: 'high',
        riskLevel: 'medium',
        score: 0.75,
      });
    }
    
    // 如果是问题类型，添加问答方案
    if (intent.type === 'question') {
      options.push({
        id: 'direct_answer',
        description: '直接回答问题',
        approach: '基于上下文和工具结果直接生成答案',
        pros: ['响应速度快', '直接解决问题'],
        cons: ['可能不够详细'],
        estimatedComplexity: 'low',
        estimatedImpact: 'medium',
        riskLevel: 'low',
        score: 0.7,
      });
    }
    
    // 按得分排序，返回得分最高的
    options.sort((a, b) => b.score - a.score);
    
    return options;
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
    
    // 改进：对于新闻摘要类请求，也需要分解任务
    const isNewsSummary = intent.parameters?.knowledgeGap === 'news_summary' ||
                          intent.parameters?.summarize === true;
    
    if ((intent.type === 'question' || intent.type === 'general') && !isNewsSummary) {
      return [];
    }
    
    // 如果是新闻摘要请求，生成专门的子任务
    if (isNewsSummary) {
      return this.createNewsSummaryTasks(orientation, selectedOption);
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

  /**
   * 创建新闻摘要任务 - 专门处理新闻摘要请求
   */
  private createNewsSummaryTasks(orientation: Orientation, selectedOption: Option): Subtask[] {
    const intent = orientation.primaryIntent;
    const query = intent.rawInput || '';
    
    return [
      {
        id: 'search_news',
        description: '搜索今日新闻',
        toolName: 'web_search',
        args: { 
          query: query,
          limit: 10  // 获取更多结果以便摘要
        },
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'summarize_news',
        description: '生成新闻摘要',
        toolName: 'llm_summarize',  // 虚拟工具，实际通过 response 生成
        args: {
          source: 'search_results',
          style: 'bullet',  // 要点式摘要
          maxItems: 5,      // 最多5条要点
        },
        dependencies: ['search_news'],
        status: 'pending',
      },
    ];
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
    // ========== 新增：基于知识缺口自动选择工具 ==========
    // 检查 Orient 阶段是否检测到需要工具调用的知识缺口
    const detectedGaps = orientation.relevantContext?.detectedKnowledgeGaps;
    if (detectedGaps && detectedGaps.length > 0) {
      const primaryGap = detectedGaps[0];
      
      // 如果置信度足够高，自动选择工具
      if (primaryGap.confidence >= 0.6 && primaryGap.suggestedTool) {
        console.log(`[Decide] 基于知识缺口自动选择工具: ${primaryGap.suggestedTool}`);
        
        // 特殊处理：新闻摘要和实时信息请求
        // 使用 suggestedTool（web_search_and_fetch）获取实际内容
        if (primaryGap.type === 'news_summary' || 
            primaryGap.type === 'realtime_info' ||
            primaryGap.type === 'web_search') {
          
          // 使用知识缺口检测建议的工具和参数
          const searchArgs = primaryGap.suggestedArgs || { 
            query: orientation.primaryIntent.rawInput, 
            limit: 10,
            fetchContent: true,
          };
          
          // 确保启用内容抓取
          searchArgs['fetchContent'] = true;
          searchArgs['summarize'] = true;
          searchArgs['summaryStyle'] = 'bullet';
          searchArgs['maxItems'] = 5;
          
          return {
            type: 'tool_call',
            toolName: primaryGap.suggestedTool,  // 使用建议的工具（web_search_and_fetch）
            args: searchArgs,
            reasoningChain: [
              {
                step: 1,
                thought: `检测到${primaryGap.type}需求: ${primaryGap.description}`,
              },
              {
                step: 2,
                thought: `使用 ${primaryGap.suggestedTool} 获取实际内容并生成摘要`,
              },
            ],
          };
        }
        
        return {
          type: 'tool_call',
          toolName: primaryGap.suggestedTool,
          args: primaryGap.suggestedArgs || {},
          reasoningChain: [
            {
              step: 1,
              thought: `检测到知识缺口: ${primaryGap.description}`,
            },
            {
              step: 2,
              thought: `自动选择工具: ${primaryGap.suggestedTool} 来获取所需信息`,
            },
          ],
        };
      }
    }
    // ========== 知识缺口处理结束 ==========
    
    // 启发式决策：高优先级知识缺口
    if (orientation.knowledgeGaps.some(g => g.importance > 0.8)) {
      const gap = orientation.knowledgeGaps.find(g => g.importance > 0.8);
      return {
        type: 'clarification',
        clarificationQuestion: `请提供更多信息: ${gap?.topic}`,
      };
    }
    
    // 启发式决策：高权限风险约束
    const highRiskPermission = orientation.constraints.find(c => 
      c.type === 'permission' && c.severity === 'high'
    );
    if (highRiskPermission && orientation.primaryIntent.type === 'execute') {
      // 对于高风险的执行命令，先请求确认
      return {
        type: 'clarification',
        clarificationQuestion: `即将执行命令，${highRiskPermission.description}，是否继续？`,
      };
    }
    
    // 启发式决策：连续失败时改变策略
    const consecutiveFailureConstraint = orientation.constraints.find(c =>
      c.description.includes('连续失败')
    );
    if (consecutiveFailureConstraint && plan.subtasks.length > 0) {
      // 尝试备选方案或简化任务
      const simplifiedTask = this.createSimplifiedTask(plan.subtasks[0]);
      if (simplifiedTask) {
        return {
          type: 'tool_call',
          toolName: simplifiedTask.toolName,
          args: simplifiedTask.args,
        };
      }
    }
    
    // 启发式决策：上下文切换时确认意图
    const contextSwitchPattern = orientation.patterns.find(p => p.type === 'context_switch');
    if (contextSwitchPattern && orientation.primaryIntent.confidence < 0.6) {
      return {
        type: 'clarification',
        clarificationQuestion: `检测到话题切换，您当前想解决的是: ${orientation.primaryIntent.rawInput}，对吗？`,
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
      const response = await this.generateLLMResponse(orientation, analysis);
      return {
        type: 'response',
        content: response,
      };
    }
    
    // 启发式决策：基于依赖关系选择任务
    const executableTask = this.selectTaskByDependencies(pendingTasks, plan);
    
    return {
      type: 'tool_call',
      toolName: executableTask.toolName,
      args: executableTask.args,
    };
  }

  /**
   * 启发式任务简化 - 当连续失败时尝试简化任务
   */
  private createSimplifiedTask(originalTask: Subtask): Subtask | null {
    // 对于文件读取失败，尝试读取部分内容
    if (originalTask.toolName === 'read_file') {
      return {
        ...originalTask,
        args: {
          ...originalTask.args,
          limit: 50, // 限制读取行数
        },
      };
    }
    
    // 对于搜索失败，尝试简化查询
    if (originalTask.toolName === 'search_web') {
      const query = originalTask.args.query as string;
      const simplifiedQuery = query.split(' ').slice(0, 3).join(' ');
      return {
        ...originalTask,
        args: {
          ...originalTask.args,
          query: simplifiedQuery,
        },
      };
    }
    
    return null;
  }

  /**
   * 启发式任务选择 - 基于依赖关系选择可执行的任务
   */
  private selectTaskByDependencies(pendingTasks: Subtask[], plan: ActionPlan): Subtask {
    const completedTasks = plan.subtasks
      .filter(t => t.status === 'completed')
      .map(t => t.id);
    
    // 找到所有依赖已满足的任务
    const executableTasks = pendingTasks.filter(task =>
      task.dependencies.every(dep => completedTasks.includes(dep))
    );
    
    if (executableTasks.length === 0) {
      // 如果没有可执行任务，返回第一个（可能存在循环依赖）
      return pendingTasks[0];
    }
    
    // 启发式：优先选择低风险任务
    const lowRiskTask = executableTasks.find(t => 
      !['write_file', 'run_bash'].includes(t.toolName)
    );
    if (lowRiskTask) {
      return lowRiskTask;
    }
    
    // 启发式：优先选择读取类任务
    const readTask = executableTasks.find(t => t.toolName === 'read_file');
    if (readTask) {
      return readTask;
    }
    
    return executableTasks[0];
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

  /**
   * 流式生成响应 - 用于实时显示生成过程
   */
  async *streamGenerateResponse(
    orientation: Orientation, 
    analysis: DecisionAnalysis,
    onChunk?: (chunk: string) => void
  ): AsyncGenerator<string> {
    // 如果有预设回复，直接返回
    if (analysis.suggestedResponse && analysis.suggestedResponse.length > 20) {
      yield analysis.suggestedResponse;
      return;
    }
    
    const llmService = await this.getLLM();
    
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
    
    const options: StreamOptions = {
      systemPrompt,
      history,
      maxTokens: 1500,
      onToken: onChunk,
    };
    
    for await (const token of llmService.stream(userPrompt, options)) {
      yield token;
    }
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
