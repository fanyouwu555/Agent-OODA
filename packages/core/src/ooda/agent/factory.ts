// packages/core/src/ooda/agent/factory.ts
// OODA Agent 工厂

import { OODAConfig, OODAAgentConfig } from '../types';
import { AgentDependencies } from './base';
import { ObserveAgent } from '../observe';
import { OrientAgent } from './orient';
import { DecideAgent } from './decide';
import { ActAgent } from './act';

export class OODAAgentFactory {
  private config: OODAConfig;
  private dependencies: AgentDependencies;

  constructor(config: OODAConfig, dependencies: AgentDependencies) {
    this.config = config;
    this.dependencies = dependencies;
  }

  createObserveAgent(sessionId: string): ObserveAgent {
    return new ObserveAgent(this.config.observe, sessionId, this.dependencies);
  }

  createOrientAgent(sessionId: string): OrientAgent {
    return new OrientAgent(this.config.orient, sessionId, this.dependencies);
  }

  createDecideAgent(sessionId: string): DecideAgent {
    return new DecideAgent(this.config.decide, sessionId, this.dependencies);
  }

  createActAgent(sessionId: string): ActAgent {
    return new ActAgent(this.config.act, sessionId, this.dependencies);
  }

  createAll(sessionId: string) {
    return {
      observe: this.createObserveAgent(sessionId),
      orient: this.createOrientAgent(sessionId),
      decide: this.createDecideAgent(sessionId),
      act: this.createActAgent(sessionId),
    };
  }

  getAgentConfig(role: 'observe' | 'orient' | 'decide' | 'act'): OODAAgentConfig {
    return this.config[role];
  }
}
