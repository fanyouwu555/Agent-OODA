// packages/tools/src/registry.ts
import { Tool, ExecutionContext } from '@ooda-agent/core';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(
    toolName: string,
    input: unknown,
    context: ExecutionContext
  ): Promise<unknown> {
    const tool = this.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    // 验证输入
    const validatedInput = tool.schema.parse(input);

    // 执行工具
    return tool.execute(validatedInput, context);
  }
}