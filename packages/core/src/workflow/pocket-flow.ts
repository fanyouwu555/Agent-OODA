import type { 
  FlowNode, 
  FlowContext, 
  NodeExecutor, 
  FlowResult,
  FlowDefinition 
} from './types';

export class PocketFlow {
  private name: string;
  private nodes: Map<string, FlowNode> = new Map();
  private executors: Map<string, NodeExecutor> = new Map();
  private executionOrder: string[] = [];
  private continueOnError: boolean = true;

  constructor(name: string) {
    this.name = name;
  }

  addNode(
    id: string, 
    executor: NodeExecutor, 
    dependencies: string[] = [],
    options: { continueOnError?: boolean } = {}
  ): this {
    const node: FlowNode = {
      id,
      name: id,
      dependencies,
      status: 'pending',
    };
    
    this.nodes.set(id, node);
    this.executors.set(id, executor);
    
    if (options.continueOnError !== undefined) {
      this.continueOnError = options.continueOnError;
    }
    
    return this;
  }

  addFunctionNode(
    name: string, 
    fn: NodeExecutor, 
    dependencies: string[] = []
  ): this {
    return this.addNode(name, fn, dependencies);
  }

  setContinueOnError(value: boolean): this {
    this.continueOnError = value;
    return this;
  }

  async execute(initialData?: Map<string, unknown>): Promise<FlowResult> {
    const startTime = Date.now();
    
    const context: FlowContext = {
      data: initialData || new Map(),
      errors: [],
      metadata: {},
    };

    this.resetNodes();
    this.executionOrder = this.calculateExecutionOrder();

    for (const nodeId of this.executionOrder) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      if (context.errors.length > 0 && !this.continueOnError) {
        node.status = 'skipped';
        continue;
      }

      if (!this.canExecute(node, context)) {
        node.status = 'skipped';
        continue;
      }

      node.status = 'running';
      node.startTime = Date.now();

      try {
        const executor = this.executors.get(nodeId);
        if (executor) {
          const result = await executor(context);
          context.data.set(nodeId, result);
        }
        node.status = 'success';
      } catch (error) {
        node.status = 'failed';
        node.error = String(error);
        context.errors.push(error as Error);
      }

      node.endTime = Date.now();
      node.executionTime = (node.endTime - node.startTime);
    }

    const totalTime = Date.now() - startTime;

    return {
      success: context.errors.length === 0,
      context,
      nodes: new Map(this.nodes),
      executionOrder: this.executionOrder,
      totalTime,
      errors: context.errors,
    };
  }

  private resetNodes(): void {
    for (const node of this.nodes.values()) {
      node.status = 'pending';
      node.startTime = undefined;
      node.endTime = undefined;
      node.executionTime = undefined;
      node.error = undefined;
    }
  }

  private calculateExecutionOrder(): string[] {
    const order: string[] = [];
    const completed = new Set<string>();
    const remaining = new Set(this.nodes.keys());
    const maxIterations = this.nodes.size * 2;
    let iterations = 0;

    while (remaining.size > 0 && iterations < maxIterations) {
      iterations++;
      
      for (const nodeId of remaining) {
        const node = this.nodes.get(nodeId);
        if (!node) {
          remaining.delete(nodeId);
          continue;
        }

        if (this.areDependenciesMet(node, completed)) {
          order.push(nodeId);
          completed.add(nodeId);
          remaining.delete(nodeId);
        }
      }
    }

    if (remaining.size > 0) {
      const remainingNodes = Array.from(remaining);
      const errorMsg = `Circular dependency or missing dependencies detected for nodes: ${remainingNodes.join(', ')}`;
      console.warn(`[PocketFlow] ${errorMsg}`);
      order.push(...remainingNodes);
    }

    return order;
  }

  private areDependenciesMet(node: FlowNode, completed: Set<string>): boolean {
    return node.dependencies.every(dep => completed.has(dep));
  }

  private canExecute(node: FlowNode, context: FlowContext): boolean {
    if (!this.areDependenciesMet(node, new Set(this.executionOrder.slice(0, this.executionOrder.indexOf(node.id))))) {
      return false;
    }

    for (const depId of node.dependencies) {
      const depNode = this.nodes.get(depId);
      if (depNode && depNode.status === 'failed') {
        return false;
      }
    }

    return true;
  }

  getName(): string {
    return this.name;
  }

  getNodes(): Map<string, FlowNode> {
    return new Map(this.nodes);
  }

  getExecutionOrder(): string[] {
    return [...this.executionOrder];
  }

  toDefinition(): FlowDefinition {
    return {
      name: this.name,
      nodes: Array.from(this.nodes.values()).map(node => ({
        id: node.id,
        name: node.name,
        dependencies: node.dependencies,
      })),
    };
  }
}

export function createFlow(name: string): PocketFlow {
  return new PocketFlow(name);
}
