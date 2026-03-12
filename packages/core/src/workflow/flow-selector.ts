import type { FlowType } from '../pattern/types';
import type { Message } from '../types';

export interface FlowSelector {
  determineFlowType(input: string, history: Message[]): FlowType;
  analyzeInput(input: string): InputAnalysis;
}

export interface InputAnalysis {
  isCodeRelated: boolean;
  isAnalysisRelated: boolean;
  complexity: 'low' | 'medium' | 'high';
  keywords: string[];
  estimatedTokens: number;
}

const CODE_KEYWORDS = [
  '代码', '函数', '类', '方法', '变量', '导入', '导出',
  'code', 'function', 'class', 'method', 'variable', 'import', 'export',
  'bug', '调试', 'debug', '错误', 'error', '修复', 'fix',
  '实现', 'implement', '重构', 'refactor', '优化', 'optimize',
  'def ', 'return ', 'if ', 'else ', 'for ', 'while ', 'try ', 'catch ',
  'const ', 'let ', 'var ', 'function ', 'class ', 'interface ',
];

const ANALYSIS_KEYWORDS = [
  '分析', '比较', '评估', '计划', '策略', '设计',
  'analyze', 'compare', 'evaluate', 'plan', 'strategy', 'design',
  '架构', 'architecture', '系统', 'system', '复杂', 'complex',
  '多个', 'multiple', '各种', 'various', '综合', 'comprehensive',
];

const COMPLEXITY_INDICATORS = {
  high: ['架构', '系统', '设计', '重构', 'architecture', 'system', 'design', 'refactor'],
  medium: ['实现', '功能', '模块', 'implement', 'feature', 'module'],
};

export class IntelligentFlowSelector implements FlowSelector {
  private codeKeywords: Set<string>;
  private analysisKeywords: Set<string>;
  private complexityIndicators: {
    high: Set<string>;
    medium: Set<string>;
  };

  constructor() {
    this.codeKeywords = new Set(CODE_KEYWORDS);
    this.analysisKeywords = new Set(ANALYSIS_KEYWORDS);
    this.complexityIndicators = {
      high: new Set(COMPLEXITY_INDICATORS.high),
      medium: new Set(COMPLEXITY_INDICATORS.medium),
    };
  }

  determineFlowType(input: string, history: Message[]): FlowType {
    const analysis = this.analyzeInput(input);
    
    if (analysis.isCodeRelated) {
      return 'code';
    }
    
    if (analysis.isAnalysisRelated) {
      return 'analysis';
    }
    
    if (this.isComplexRequest(input, history, analysis)) {
      return 'complex';
    }
    
    return 'simple';
  }

  analyzeInput(input: string): InputAnalysis {
    const lowerInput = input.toLowerCase();
    const keywords: string[] = [];
    
    for (const keyword of this.codeKeywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        keywords.push(keyword);
      }
    }
    
    for (const keyword of this.analysisKeywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        keywords.push(keyword);
      }
    }
    
    const isCodeRelated = keywords.some(k => this.codeKeywords.has(k));
    const isAnalysisRelated = keywords.some(k => this.analysisKeywords.has(k));
    
    const complexity = this.estimateComplexity(input, keywords);
    const estimatedTokens = this.estimateTokens(input);
    
    return {
      isCodeRelated,
      isAnalysisRelated,
      complexity,
      keywords: [...new Set(keywords)],
      estimatedTokens,
    };
  }

  private isComplexRequest(
    input: string, 
    history: Message[], 
    analysis: InputAnalysis
  ): boolean {
    if (analysis.complexity === 'high') {
      return true;
    }
    
    if (input.length > 500) {
      return true;
    }
    
    if (history.length > 5) {
      return true;
    }
    
    const sentences = input.split(/[。！？.!?]/).filter(s => s.trim().length > 0);
    if (sentences.length > 3) {
      return true;
    }
    
    return false;
  }

  private estimateComplexity(input: string, keywords: string[]): 'low' | 'medium' | 'high' {
    const lowerInput = input.toLowerCase();
    
    for (const indicator of this.complexityIndicators.high) {
      if (lowerInput.includes(indicator.toLowerCase())) {
        return 'high';
      }
    }
    
    for (const indicator of this.complexityIndicators.medium) {
      if (lowerInput.includes(indicator.toLowerCase())) {
        return 'medium';
      }
    }
    
    if (keywords.length > 3) {
      return 'medium';
    }
    
    if (input.length > 300) {
      return 'medium';
    }
    
    return 'low';
  }

  private estimateTokens(input: string): number {
    const chineseChars = (input.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (input.match(/[a-zA-Z]+/g) || []).length;
    const otherChars = input.length - chineseChars - englishWords * 5;
    
    return Math.ceil(chineseChars * 1.5 + englishWords + otherChars * 0.5);
  }
}

let flowSelector: FlowSelector | null = null;

export function getFlowSelector(): FlowSelector {
  if (!flowSelector) {
    flowSelector = new IntelligentFlowSelector();
  }
  return flowSelector;
}

export function setFlowSelector(selector: FlowSelector): void {
  flowSelector = selector;
}
