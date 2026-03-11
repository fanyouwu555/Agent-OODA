// packages/tools/src/index.ts
export * from './registry';
export * from './base-tool';
export * from './skills/base-skill';
export * from './skills/advanced-skills';

import { ToolRegistry } from './registry';
import { readFileTool, writeFileTool, runBashTool, searchWebTool } from './base-tool';
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
  registry.register(searchWebTool);
  
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
