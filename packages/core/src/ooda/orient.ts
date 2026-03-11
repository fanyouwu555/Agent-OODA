// packages/core/src/ooda/orient.ts
import { Observation, Orientation, Intent, Constraint, KnowledgeGap, Pattern, Relationship } from '../types';
import { getLLMService } from '../llm/service';

interface AnalysisResult {
  intentType: string;
  parameters: Record<string, unknown>;
  confidence: number;
  patterns: Pattern[];
  relationships: Relationship[];
  assumptions: string[];
  risks: string[];
}

export class Orienter {
  private async getLLM() {
    return getLLMService();
  }
  
  async orient(observation: Observation): Promise<Orientation> {
    const analysisResult = await this.performDeepAnalysis(observation);
    
    const intent = this.buildIntent(analysisResult, observation.userInput);
    const constraints = this.identifyConstraints(observation, analysisResult);
    const knowledgeGaps = this.identifyKnowledgeGaps(observation, intent, analysisResult);
    const patterns = this.synthesizePatterns(observation, analysisResult);
    const relationships = this.mapRelationships(observation, analysisResult);
    
    return {
      primaryIntent: intent,
      relevantContext: observation.context,
      constraints,
      knowledgeGaps,
      patterns,
      relationships,
      assumptions: analysisResult.assumptions,
      risks: analysisResult.risks,
    };
  }

  private async performDeepAnalysis(observation: Observation): Promise<AnalysisResult> {
    const llmService = await this.getLLM();
    const prompt = this.buildAnalysisPrompt(observation);
    const response = await llmService.generate(prompt, { maxTokens: 2000 });
    
    return this.parseAnalysisResult(response, observation);
  }

  private buildAnalysisPrompt(observation: Observation): string {
    const recentHistory = observation.history
      .slice(-5)
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');
    
    const toolResultsSummary = observation.toolResults
      .map(r => `${r.toolName}: ${r.isError ? 'ERROR' : 'SUCCESS'}`)
      .join(', ');

    return `作为OODA循环的Orient阶段，你需要深入分析观察结果，理解上下文，识别模式和关系。

## 观察数据
- 用户输入: ${observation.userInput}
- 最近历史: ${recentHistory || '无'}
- 工具结果: ${toolResultsSummary || '无'}
- 环境状态: 内存使用${Math.round(observation.environment.resourceUsage.memory * 100)}%, CPU使用${Math.round(observation.environment.resourceUsage.cpu * 100)}%

## 分析任务
请进行以下分析（以JSON格式输出）：

1. **意图分析**: 理解用户真正想要什么
   - type: 意图类型 (file_read, file_write, execute, search, code_analysis, question, general 等)
   - parameters: 提取的关键参数
   - confidence: 置信度 (0-1)

2. **模式识别**: 识别观察数据中的模式
   - 用户行为模式
   - 问题模式
   - 上下文模式

3. **关系映射**: 识别组件之间的关系
   - 文件之间的依赖关系
   - 操作之间的因果关系
   - 上下文关联

4. **假设识别**: 当前分析中的假设
   - 我们假设了什么？
   - 这些假设是否合理？

5. **风险评估**: 潜在风险
   - 执行风险
   - 数据风险
   - 资源风险

## 输出格式
{
  "intentType": "意图类型",
  "parameters": {"key": "value"},
  "confidence": 0.85,
  "patterns": [
    {"type": "pattern_type", "description": "模式描述", "significance": 0.8}
  ],
  "relationships": [
    {"from": "组件A", "to": "组件B", "type": "dependency", "strength": 0.9}
  ],
  "assumptions": ["假设1", "假设2"],
  "risks": ["风险1", "风险2"]
}

请只输出JSON，不要有其他内容。`;
  }

  private parseAnalysisResult(response: string, observation: Observation): AnalysisResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intentType: parsed.intentType || 'general',
          parameters: parsed.parameters || {},
          confidence: parsed.confidence || 0.5,
          patterns: parsed.patterns || [],
          relationships: parsed.relationships || [],
          assumptions: parsed.assumptions || [],
          risks: parsed.risks || [],
        };
      }
    } catch (e) {
      console.warn('[Orient] Failed to parse LLM response:', e);
    }
    
    return this.fallbackAnalysis(observation);
  }

  private fallbackAnalysis(observation: Observation): AnalysisResult {
    const input = observation.userInput.toLowerCase();
    let intentType = 'general';
    const parameters: Record<string, unknown> = {};
    
    if (input.includes('读取') || input.includes('查看') || input.includes('打开')) {
      intentType = 'file_read';
      const pathMatch = observation.userInput.match(/['"]([^'"]+)['"]/);
      if (pathMatch) parameters.path = pathMatch[1];
    } else if (input.includes('写入') || input.includes('保存') || input.includes('修改')) {
      intentType = 'file_write';
      const pathMatch = observation.userInput.match(/['"]([^'"]+)['"]/);
      if (pathMatch) parameters.path = pathMatch[1];
    } else if (input.includes('运行') || input.includes('执行') || input.includes('命令')) {
      intentType = 'execute';
    } else if (input.includes('搜索') || input.includes('查找') || input.includes('查询')) {
      intentType = 'search';
    } else if (input.includes('分析') || input.includes('解释') || input.includes('代码')) {
      intentType = 'code_analysis';
    } else if (input.includes('什么') || input.includes('如何') || input.includes('为什么') || input.includes('?') || input.includes('？')) {
      intentType = 'question';
    }
    
    return {
      intentType,
      parameters,
      confidence: 0.6,
      patterns: [],
      relationships: [],
      assumptions: ['使用简单的关键词匹配进行意图分类'],
      risks: [],
    };
  }

  private buildIntent(analysis: AnalysisResult, userInput: string): Intent {
    return {
      type: analysis.intentType,
      parameters: analysis.parameters,
      confidence: analysis.confidence,
      rawInput: userInput,
    };
  }

  private identifyConstraints(observation: Observation, analysis: AnalysisResult): Constraint[] {
    const constraints: Constraint[] = [];
    
    if (observation.environment.resourceUsage.memory > 0.8) {
      constraints.push({
        type: 'resource',
        description: '内存使用率过高，可能影响性能',
        severity: 'high',
      });
    } else if (observation.environment.resourceUsage.memory > 0.6) {
      constraints.push({
        type: 'resource',
        description: '内存使用率较高',
        severity: 'medium',
      });
    }
    
    if (observation.environment.resourceUsage.cpu > 0.8) {
      constraints.push({
        type: 'resource',
        description: 'CPU使用率过高',
        severity: 'high',
      });
    }
    
    const errorResults = observation.toolResults.filter(r => r.isError);
    if (errorResults.length > 0) {
      constraints.push({
        type: 'logic',
        description: `存在${errorResults.length}个工具执行错误`,
        severity: 'medium',
      });
    }
    
    for (const risk of analysis.risks) {
      constraints.push({
        type: 'logic',
        description: risk,
        severity: 'medium',
      });
    }
    
    return constraints;
  }

  private identifyKnowledgeGaps(observation: Observation, intent: Intent, analysis: AnalysisResult): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];
    
    if (intent.type === 'file_read' && !intent.parameters.path) {
      gaps.push({
        topic: '目标文件路径',
        description: '需要知道要读取哪个文件',
        importance: 0.9,
        possibleSources: ['用户输入', '当前目录结构', '最近操作的文件'],
      });
    }
    
    if (intent.type === 'file_write' && !intent.parameters.content) {
      gaps.push({
        topic: '写入内容',
        description: '需要知道要写入什么内容',
        importance: 0.9,
        possibleSources: ['用户输入', '模板', '其他文件'],
      });
    }
    
    if (intent.type === 'execute' && !intent.parameters.command) {
      gaps.push({
        topic: '执行命令',
        description: '需要知道要执行什么命令',
        importance: 0.9,
        possibleSources: ['用户输入'],
      });
    }
    
    if (intent.type === 'search' && !intent.parameters.query) {
      gaps.push({
        topic: '搜索关键词',
        description: '需要知道搜索什么内容',
        importance: 0.8,
        possibleSources: ['用户输入'],
      });
    }
    
    if (intent.confidence < 0.5) {
      gaps.push({
        topic: '用户意图',
        description: '用户意图不明确，需要进一步澄清',
        importance: 0.7,
        possibleSources: ['向用户询问'],
      });
    }
    
    return gaps;
  }

  private synthesizePatterns(observation: Observation, analysis: AnalysisResult): Pattern[] {
    const patterns: Pattern[] = [];
    
    patterns.push(...(analysis.patterns || []));
    
    const recentTools = observation.toolResults.slice(-5).map(r => r.toolName);
    const toolFrequency: Record<string, number> = {};
    for (const tool of recentTools) {
      toolFrequency[tool] = (toolFrequency[tool] || 0) + 1;
    }
    
    for (const [tool, count] of Object.entries(toolFrequency)) {
      if (count >= 3) {
        patterns.push({
          type: 'tool_usage',
          description: `频繁使用工具: ${tool} (${count}次)`,
          significance: 0.7,
        });
      }
    }
    
    const errorRate = observation.toolResults.filter(r => r.isError).length / Math.max(observation.toolResults.length, 1);
    if (errorRate > 0.5) {
      patterns.push({
        type: 'error_pattern',
        description: `高错误率: ${Math.round(errorRate * 100)}%`,
        significance: 0.9,
      });
    }
    
    return patterns;
  }

  private mapRelationships(observation: Observation, analysis: AnalysisResult): Relationship[] {
    const relationships: Relationship[] = [];
    
    relationships.push(...(analysis.relationships || []));
    
    const toolSequence = observation.toolResults.slice(-3);
    for (let i = 0; i < toolSequence.length - 1; i++) {
      relationships.push({
        from: toolSequence[i].toolName,
        to: toolSequence[i + 1].toolName,
        type: 'sequence',
        strength: 0.5,
      });
    }
    
    return relationships;
  }
}
