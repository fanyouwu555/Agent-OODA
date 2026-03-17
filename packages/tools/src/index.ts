// packages/tools/src/index.ts
export * from './base-tool';
export * from './web-tools';
export * from './utility-tools';
export * from './git-tools';
export * from './skills/base-skill';
export * from './skills/advanced-skills';
export { context7Tool, grepAppTool, webSearchTool as mcpWebSearchTool, webFetchTool as mcpWebFetchTool, initializeMCPTools } from './mcp-tools';

import { 
  readFileTool, 
  writeFileTool, 
  runBashTool, 
  listDirectoryTool,
  deleteFileTool,
  grepTool,
  globTool,
  getTimeTool
} from './base-tool';
import { 
  webSearchTool, 
  webFetchTool, 
  webSearchAndFetchTool,
  webSearch,
  webFetch
} from './web-tools';
import { 
  calculatorTool,
  weatherTool,
  translateTool,
  timerTool,
  currencyTool,
  uuidTool,
  base64Tool,
  hashTool,
  randomNumberTool,
  colorTool
} from './utility-tools';
import { gitTools } from './git-tools';
import { FileSkill, WebSkill, CodeSkill } from './skills/base-skill';
import { 
  DataAnalysisSkill, 
  ImageProcessingSkill, 
  PDFProcessingSkill, 
  CodeAnalysisSkill, 
  APITestSkill, 
  DatabaseQuerySkill 
} from './skills/advanced-skills';
import { getSkillRegistry, getToolRegistry, ToolRegistry, UnifiedTool } from '@ooda-agent/core';

/**
 * 初始化工具并注册到核心的 ToolRegistry
 * 返回已注册的 ToolRegistry 实例
 */
export function initializeTools(): ToolRegistry {
  const registry = getToolRegistry();
  
  // 注册工具 - 使用类型断言兼容 Tool 和 UnifiedTool
  registry.registerTool(readFileTool as unknown as UnifiedTool);
  registry.registerTool(writeFileTool as unknown as UnifiedTool);
  registry.registerTool(runBashTool as unknown as UnifiedTool);
  registry.registerTool(listDirectoryTool as unknown as UnifiedTool);
  registry.registerTool(deleteFileTool as unknown as UnifiedTool);
  registry.registerTool(grepTool as unknown as UnifiedTool);
  registry.registerTool(globTool as unknown as UnifiedTool);
  registry.registerTool(getTimeTool as unknown as UnifiedTool);
  
  registry.registerTool(webSearchTool as unknown as UnifiedTool);
  registry.registerTool(webFetchTool as unknown as UnifiedTool);
  registry.registerTool(webSearchAndFetchTool as unknown as UnifiedTool);
  
  registry.registerTool(calculatorTool as unknown as UnifiedTool);
  registry.registerTool(weatherTool as unknown as UnifiedTool);
  registry.registerTool(translateTool as unknown as UnifiedTool);
  registry.registerTool(timerTool as unknown as UnifiedTool);
  registry.registerTool(currencyTool as unknown as UnifiedTool);
  registry.registerTool(uuidTool as unknown as UnifiedTool);
  registry.registerTool(base64Tool as unknown as UnifiedTool);
  registry.registerTool(hashTool as unknown as UnifiedTool);
  registry.registerTool(randomNumberTool as unknown as UnifiedTool);
  registry.registerTool(colorTool as unknown as UnifiedTool);
  
  // 注册 Git 工具
  for (const tool of gitTools) {
    registry.registerTool(tool as unknown as UnifiedTool);
  }
  
  return registry;
}

export function initializeSkills(): void {
  const skillRegistry = getSkillRegistry();
  
  skillRegistry.register(new FileSkill());
  skillRegistry.register(new WebSkill());
  skillRegistry.register(new CodeSkill());
  
  skillRegistry.register(new DataAnalysisSkill());
  skillRegistry.register(new ImageProcessingSkill());
  skillRegistry.register(new PDFProcessingSkill());
  skillRegistry.register(new CodeAnalysisSkill());
  skillRegistry.register(new APITestSkill());
  skillRegistry.register(new DatabaseQuerySkill());
}
