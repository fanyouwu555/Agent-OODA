// packages/tools/src/index.ts
export * from './registry';
export * from './base-tool';
export * from './web-tools';
export * from './utility-tools';
export * from './git-tools';
export * from './skills/base-skill';
export * from './skills/advanced-skills';
import { ToolRegistry } from './registry';
import { readFileTool, writeFileTool, runBashTool, listDirectoryTool, deleteFileTool, grepTool, globTool, getTimeTool } from './base-tool';
import { webSearchTool, webFetchTool, webSearchAndFetchTool } from './web-tools';
import { calculatorTool, weatherTool, translateTool, timerTool, currencyTool, uuidTool, base64Tool, hashTool, randomNumberTool, colorTool } from './utility-tools';
import { gitTools } from './git-tools';
import { realtimeDataTools } from './realtime-data-tools';
import { FileSkill, WebSkill, CodeSkill } from './skills/base-skill';
import { DataAnalysisSkill, ImageProcessingSkill, PDFProcessingSkill, CodeAnalysisSkill, APITestSkill, DatabaseQuerySkill } from './skills/advanced-skills';
import { getSkillRegistry, getToolRegistry } from '@ooda-agent/core';

export function initializeTools() {
    const registry = getToolRegistry();

    registry.registerTool(readFileTool);
    registry.registerTool(writeFileTool);
    registry.registerTool(runBashTool);
    registry.registerTool(listDirectoryTool);
    registry.registerTool(deleteFileTool);
    registry.registerTool(grepTool);
    registry.registerTool(globTool);
    registry.registerTool(getTimeTool);
    registry.registerTool(webSearchTool);
    registry.registerTool(webFetchTool);
    registry.registerTool(webSearchAndFetchTool);
    registry.registerTool(calculatorTool);
    registry.registerTool(weatherTool);
    registry.registerTool(translateTool);
    registry.registerTool(timerTool);
    registry.registerTool(currencyTool);
    registry.registerTool(uuidTool);
    registry.registerTool(base64Tool);
    registry.registerTool(hashTool);
    registry.registerTool(randomNumberTool);
    registry.registerTool(colorTool);

    for (const tool of gitTools) {
        registry.registerTool(tool);
    }

    for (const tool of realtimeDataTools) {
        registry.registerTool(tool);
    }

    return registry;
}

export function initializeSkills() {
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