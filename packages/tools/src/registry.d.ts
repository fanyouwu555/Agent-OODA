import { Tool, ExecutionContext } from '@ooda-agent/core';
export declare class ToolRegistry {
    private tools;
    register(tool: Tool): void;
    get(name: string): Tool | undefined;
    list(): string[];
    execute(toolName: string, input: unknown, context: ExecutionContext): Promise<unknown>;
}
//# sourceMappingURL=registry.d.ts.map