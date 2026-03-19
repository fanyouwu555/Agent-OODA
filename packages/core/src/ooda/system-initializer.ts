// packages/core/src/ooda/system-initializer.ts
// 系统初始化模块 - 统一管理系统各组件的初始化

import { SessionMemory, SessionMemoryConfig } from '../memory/index.js';
import { initializeMemoryIntegrator, MemoryIntegrator } from './memory-integrator.js';
import { getIntentRegistry, createDefaultIntentRegistry } from './intent-registry.js';
import { getPromptRegistry, createDefaultPromptRegistry } from './prompt-registry.js';
import { getToolExecutorRegistry, createDefaultToolExecutorRegistry } from './tool-executor-registry.js';
import { getPerformanceMonitor } from './performance-monitor.js';
import type { MemoryRepository } from '@ooda-agent/storage';

export interface SystemConfig {
  enableLongTermMemory: boolean;
  enableEmbedding: boolean;
  memoryRepository?: MemoryRepository;
}

const DEFAULT_CONFIG: SystemConfig = {
  enableLongTermMemory: true,
  enableEmbedding: false,
};

let isInitialized = false;
let sessionMemory: SessionMemory | null = null;

export async function initializeSystem(config: Partial<SystemConfig> = {}): Promise<void> {
  if (isInitialized) {
    console.warn('[SystemInitializer] System already initialized');
    return;
  }

  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  console.log('[SystemInitializer] Starting system initialization...');

  try {
    if (finalConfig.enableLongTermMemory && finalConfig.memoryRepository) {
      const sessionConfig: SessionMemoryConfig = {
        memoryRepository: finalConfig.memoryRepository,
        enableEmbedding: finalConfig.enableEmbedding,
      };
      sessionMemory = new SessionMemory(sessionConfig);
      console.log('[SystemInitializer] SessionMemory initialized');
    }

    const memoryIntegrator = initializeMemoryIntegrator(sessionMemory);
    console.log('[SystemInitializer] MemoryIntegrator initialized');

    createDefaultIntentRegistry();
    console.log('[SystemInitializer] IntentRegistry initialized');

    createDefaultPromptRegistry();
    console.log('[SystemInitializer] PromptRegistry initialized');

    createDefaultToolExecutorRegistry();
    console.log('[SystemInitializer] ToolExecutorRegistry initialized');

    const monitor = getPerformanceMonitor();
    console.log('[SystemInitializer] PerformanceMonitor initialized');

    isInitialized = true;
    console.log('[SystemInitializer] System initialization complete');
  } catch (error) {
    console.error('[SystemInitializer] Initialization failed:', error);
    throw error;
  }
}

export function getSessionMemory(): SessionMemory | null {
  return sessionMemory;
}

export function getMemoryIntegrator(): MemoryIntegrator | null {
  return sessionMemory ? initializeMemoryIntegrator(sessionMemory) : null;
}

export function isSystemInitialized(): boolean {
  return isInitialized;
}

export function resetSystem(): void {
  isInitialized = false;
  sessionMemory = null;
}

export function getSystemStatus(): {
  initialized: boolean;
  hasLongTermMemory: boolean;
  hasSessionMemory: boolean;
} {
  return {
    initialized: isInitialized,
    hasLongTermMemory: sessionMemory !== null,
    hasSessionMemory: sessionMemory !== null,
  };
}
