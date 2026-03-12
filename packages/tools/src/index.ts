// packages/tools/src/index.ts
export * from './registry';
export * from './base-tool';
export * from './web-tools';
export * from './utility-tools';
export * from './git-tools';
export * from './skills/base-skill';
export * from './skills/advanced-skills';

import { ToolRegistry } from './registry';
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
import { getSkillRegistry } from '@ooda-agent/core';

export function initializeTools(): ToolRegistry {
  const registry = new ToolRegistry();
  
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(runBashTool);
  registry.register(listDirectoryTool);
  registry.register(deleteFileTool);
  registry.register(grepTool);
  registry.register(globTool);
  registry.register(getTimeTool);
  
  registry.register(webSearchTool);
  registry.register(webFetchTool);
  registry.register(webSearchAndFetchTool);
  
  registry.register(calculatorTool);
  registry.register(weatherTool);
  registry.register(translateTool);
  registry.register(timerTool);
  registry.register(currencyTool);
  registry.register(uuidTool);
  registry.register(base64Tool);
  registry.register(hashTool);
  registry.register(randomNumberTool);
  registry.register(colorTool);
  
  // 注册 Git 工具
  for (const tool of gitTools) {
    registry.register(tool);
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
