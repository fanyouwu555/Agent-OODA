// packages/core/src/ooda/decision-rollback.ts
// 决策回溯机制 - 支持撤销和重新选择决策

import { Decision, Action, Option, Orientation } from '../types';

export interface DecisionNode {
  id: string;
  decision: Decision;
  selectedOption: Option;
  action: Action;
  timestamp: number;
  parentId: string | null;
  children: string[];
  rollbackCount: number;
  success: boolean | null;
  metadata: Record<string, unknown>;
}

export interface RollbackResult {
  success: boolean;
  rolledBackTo: DecisionNode | null;
  alternativeOption: Option | null;
  newDecision: Decision | null;
  reason: string;
}

export interface DecisionPath {
  nodes: DecisionNode[];
  currentNodeId: string | null;
  totalRollbacks: number;
}

export class DecisionRollbackManager {
  private decisionTree: Map<string, DecisionNode> = new Map();
  private rootId: string | null = null;
  private currentNodeId: string | null = null;
  private maxRollbacks: number = 3;
  private maxPathLength: number = 10;

  constructor(maxRollbacks: number = 3, maxPathLength: number = 10) {
    this.maxRollbacks = maxRollbacks;
    this.maxPathLength = maxPathLength;
  }

  private generateNodeId(): string {
    return `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  recordDecision(
    decision: Decision,
    selectedOption: Option,
    action: Action,
    parentId: string | null = null
  ): string {
    const nodeId = this.generateNodeId();

    const node: DecisionNode = {
      id: nodeId,
      decision,
      selectedOption,
      action,
      timestamp: Date.now(),
      parentId,
      children: [],
      rollbackCount: 0,
      success: null,
      metadata: {},
    };

    this.decisionTree.set(nodeId, node);

    if (parentId) {
      const parent = this.decisionTree.get(parentId);
      if (parent) {
        parent.children.push(nodeId);
      }
    } else if (!this.rootId) {
      this.rootId = nodeId;
    }

    this.currentNodeId = nodeId;
    this.pruneOldPaths();

    return nodeId;
  }

  markNodeResult(nodeId: string, success: boolean): void {
    const node = this.decisionTree.get(nodeId);
    if (node) {
      node.success = success;
    }
  }

  canRollback(nodeId: string = this.currentNodeId || ''): boolean {
    const node = this.decisionTree.get(nodeId);
    if (!node) return false;
    return node.rollbackCount < this.maxRollbacks && node.parentId !== null;
  }

  rollback(
    nodeId: string = this.currentNodeId || '',
    reason: string = '手动回滚'
  ): RollbackResult {
    const node = this.decisionTree.get(nodeId);

    if (!node) {
      return {
        success: false,
        rolledBackTo: null,
        alternativeOption: null,
        newDecision: null,
        reason: `节点不存在: ${nodeId}`,
      };
    }

    if (node.rollbackCount >= this.maxRollbacks) {
      return {
        success: false,
        rolledBackTo: null,
        alternativeOption: null,
        newDecision: null,
        reason: `超过最大回滚次数: ${this.maxRollbacks}`,
      };
    }

    if (!node.parentId) {
      return {
        success: false,
        rolledBackTo: null,
        alternativeOption: null,
        newDecision: null,
        reason: '已是根节点，无法回滚',
      };
    }

    node.rollbackCount++;
    const parentNode = this.decisionTree.get(node.parentId);

    if (!parentNode) {
      return {
        success: false,
        rolledBackTo: null,
        alternativeOption: null,
        newDecision: null,
        reason: '父节点不存在',
      };
    }

    const alternativeOptions = parentNode.decision.options.filter(
      (opt) => opt.id !== node.decision.selectedOption?.id
    );

    const alternativeOption = this.selectBestAlternative(parentNode, alternativeOptions);

    this.currentNodeId = node.parentId;

    return {
      success: true,
      rolledBackTo: parentNode,
      alternativeOption,
      newDecision: alternativeOption
        ? this.createAlternativeDecision(parentNode.decision, alternativeOption)
        : null,
      reason: `${reason} - 回滚到 ${parentNode.decision.problemStatement}`,
    };
  }

  private selectBestAlternative(
    parentNode: DecisionNode,
    options: Option[]
  ): Option | null {
    if (options.length === 0) return null;

    const failedOptionIds = new Set<string>();
    const successOptionIds = new Set<string>();

    for (const [, childNode] of this.decisionTree) {
      if (childNode.parentId === parentNode.id) {
        if (childNode.success === false) {
          failedOptionIds.add(childNode.selectedOption?.id || '');
        } else if (childNode.success === true) {
          successOptionIds.add(childNode.selectedOption?.id || '');
        }
      }
    }

    const availableOptions = options.filter(
      (opt) => !failedOptionIds.has(opt.id) && opt.id !== parentNode.selectedOption?.id
    );

    if (availableOptions.length === 0) {
      return options.find((opt) => opt.id !== parentNode.selectedOption?.id) || null;
    }

    const sortedOptions = availableOptions.sort((a, b) => (b.score || 0) - (a.score || 0));
    return sortedOptions[0];
  }

  private createAlternativeDecision(decision: Decision, option: Option): Decision {
    const metadata = decision.decisionMetadata || { confidence: 0.5, alternativesConsidered: [], successCriteria: [] };
    return {
      problemStatement: decision.problemStatement,
      options: decision.options,
      selectedOption: option,
      plan: decision.plan,
      nextAction: this.createAlternativeAction(decision.nextAction, option),
      reasoning: `回滚重试: 选择替代方案 ${option.description}`,
      riskAssessment: decision.riskAssessment,
      reasoningChain: decision.reasoningChain,
      decisionMetadata: {
        ...metadata,
        alternativesConsidered: [...metadata.alternativesConsidered, option.id],
      },
    };
  }

  private createAlternativeAction(originalAction: Action, option: Option): Action {
    return {
      ...originalAction,
      args: {
        ...originalAction.args,
        _alternativeDescription: option.description,
      },
      fallbackStrategy: {
        condition: '执行失败',
        alternativeTool: originalAction.toolName || '',
        alternativeArgs: originalAction.args || {},
        simplifiedTask: true,
      },
    };
  }

  private pruneOldPaths(): void {
    if (this.decisionTree.size <= this.maxPathLength * 2) {
      return;
    }

    const leafNodes: DecisionNode[] = [];
    for (const [, node] of this.decisionTree) {
      if (node.children.length === 0 && node.id !== this.currentNodeId) {
        leafNodes.push(node);
      }
    }

    leafNodes.sort((a, b) => a.timestamp - b.timestamp);

    const toRemove = leafNodes.slice(0, Math.floor(leafNodes.length / 2));
    for (const node of toRemove) {
      if (node.parentId) {
        const parent = this.decisionTree.get(node.parentId);
        if (parent) {
          parent.children = parent.children.filter((id) => id !== node.id);
        }
      }
      this.decisionTree.delete(node.id);
    }
  }

  getCurrentPath(): DecisionPath {
    const path: DecisionNode[] = [];
    let nodeId = this.currentNodeId;

    while (nodeId) {
      const node = this.decisionTree.get(nodeId);
      if (!node) break;
      path.unshift(node);
      nodeId = node.parentId;
    }

    return {
      nodes: path,
      currentNodeId: this.currentNodeId,
      totalRollbacks: this.getTotalRollbacks(),
    };
  }

  private getTotalRollbacks(): number {
    let total = 0;
    for (const [, node] of this.decisionTree) {
      total += node.rollbackCount;
    }
    return total;
  }

  getNode(nodeId: string): DecisionNode | undefined {
    return this.decisionTree.get(nodeId);
  }

  getFailedBranches(): DecisionNode[] {
    const failed: DecisionNode[] = [];
    for (const [, node] of this.decisionTree) {
      if (node.success === false) {
        failed.push(node);
      }
    }
    return failed.sort((a, b) => b.timestamp - a.timestamp);
  }

  getSuccessBranches(): DecisionNode[] {
    const success: DecisionNode[] = [];
    for (const [, node] of this.decisionTree) {
      if (node.success === true) {
        success.push(node);
      }
    }
    return success.sort((a, b) => b.timestamp - a.timestamp);
  }

  analyzeFailurePatterns(): {
    failedOptions: Map<string, number>;
    commonFailureReasons: string[];
    recommendations: string[];
  } {
    const failedOptions = new Map<string, number>();
    const failureReasons: string[] = [];

    for (const [, node] of this.decisionTree) {
      if (node.success === false) {
        const optionId = node.selectedOption?.id || 'unknown';
        failedOptions.set(optionId, (failedOptions.get(optionId) || 0) + 1);

        const reason = node.metadata?.failureReason as string;
        if (reason) {
          failureReasons.push(reason);
        }
      }
    }

    const optionFailures = Array.from(failedOptions.entries())
      .sort((a, b) => b[1] - a[1]);

    const recommendations: string[] = [];
    for (const [optionId, count] of optionFailures.slice(0, 3)) {
      recommendations.push(
        `方案 ${optionId} 失败 ${count} 次，建议优先尝试其他方案`
      );
    }

    return {
      failedOptions,
      commonFailureReasons: failureReasons.slice(0, 5),
      recommendations,
    };
  }

  reset(): void {
    this.decisionTree.clear();
    this.rootId = null;
    this.currentNodeId = null;
  }

  exportTree(): {
    nodes: [string, DecisionNode][];
    rootId: string | null;
    currentNodeId: string | null;
  } {
    return {
      nodes: Array.from(this.decisionTree.entries()),
      rootId: this.rootId,
      currentNodeId: this.currentNodeId,
    };
  }

  importTree(data: {
    nodes: [string, DecisionNode][];
    rootId: string | null;
    currentNodeId: string | null;
  }): void {
    this.decisionTree = new Map(data.nodes);
    this.rootId = data.rootId;
    this.currentNodeId = data.currentNodeId;
  }
}

let globalRollbackManager: DecisionRollbackManager | null = null;

export function getDecisionRollbackManager(): DecisionRollbackManager {
  if (!globalRollbackManager) {
    globalRollbackManager = new DecisionRollbackManager();
  }
  return globalRollbackManager;
}

export function resetDecisionRollbackManager(): void {
  if (globalRollbackManager) {
    globalRollbackManager.reset();
  }
  globalRollbackManager = null;
}
