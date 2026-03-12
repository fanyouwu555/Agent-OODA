export class ToolRegistry {
    tools = new Map();
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    list() {
        return Array.from(this.tools.keys());
    }
    async execute(toolName, input, context) {
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
//# sourceMappingURL=registry.js.map