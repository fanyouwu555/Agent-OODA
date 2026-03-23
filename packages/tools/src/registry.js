export class ToolRegistry {
    tools = new Map();
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    list() {
        return Array.from(this.tools.keys());
    }
    has(name) {
        return this.tools.has(name);
    }
    async execute(toolName, input, context) {
        const tool = this.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }
        const validatedInput = tool.schema.parse(input);
        return tool.execute(validatedInput, context);
    }
}

let toolRegistry = null;
export function getToolRegistry() {
    if (!toolRegistry) {
        toolRegistry = new ToolRegistry();
    }
    return toolRegistry;
}