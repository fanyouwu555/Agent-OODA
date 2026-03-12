import { createSignal, For, Show, onMount } from 'solid-js';
import type { EnhancedPermissionConfig, PermissionMode } from '../types';
import { apiClient } from '../services/api';
import { showToast } from './Toast';

export function PermissionPanel() {
  const [config, setConfig] = createSignal<EnhancedPermissionConfig | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [selectedAgent, setSelectedAgent] = createSignal<string>('global');
  const [searchQuery, setSearchQuery] = createSignal('');

  onMount(() => {
    loadPermissions();
  });

  const loadPermissions = async () => {
    setIsLoading(true);
    const response = await apiClient.getPermissions();
    if (response.success && response.data) {
      setConfig(response.data.config);
    } else {
      showToast('Failed to load permissions', 'error');
    }
    setIsLoading(false);
  };

  const handleUpdateGlobalPermission = async (tool: string, mode: PermissionMode) => {
    const response = await apiClient.updateGlobalPermission(tool, mode);
    if (response.success) {
      showToast('Permission updated', 'success');
      loadPermissions();
    } else {
      showToast('Failed to update permission', 'error');
    }
  };

  const handleUpdateAgentPermission = async (agent: string, tool: string, mode: PermissionMode) => {
    const response = await apiClient.updateAgentPermission(agent, tool, mode);
    if (response.success) {
      showToast('Agent permission updated', 'success');
      loadPermissions();
    } else {
      showToast('Failed to update agent permission', 'error');
    }
  };

  const getModeColor = (mode: PermissionMode) => {
    switch (mode) {
      case 'allow': return 'var(--success)';
      case 'deny': return 'var(--error)';
      case 'ask': return 'var(--warning)';
      default: return 'var(--text-tertiary)';
    }
  };

  const getModeIcon = (mode: PermissionMode) => {
    switch (mode) {
      case 'allow': return '✓';
      case 'deny': return '✗';
      case 'ask': return '?';
      default: return '-';
    }
  };

  const globalTools = () => {
    const globalConfig = config()?.global;
    if (!globalConfig) return [];
    
    const allTools = { ...globalConfig.tools, ...globalConfig.skills };
    const query = searchQuery().toLowerCase();
    
    return Object.entries(allTools)
      .filter(([name]) => !query || name.toLowerCase().includes(query))
      .sort((a, b) => a[0].localeCompare(b[0]));
  };

  const agentList = () => {
    const agents = config()?.agents || {};
    return Object.keys(agents).sort();
  };

  const agentPermissions = () => {
    const agentName = selectedAgent();
    if (agentName === 'global' || !config()) return null;
    
    const agentConfig = config()!.agents[agentName];
    if (!agentConfig) return null;
    
    const effectivePerms: Record<string, PermissionMode> = {};
    
    if (agentConfig.inherit !== false && config()?.global) {
      Object.assign(effectivePerms, config()!.global.tools, config()!.global.skills);
    }
    
    if (agentConfig.tools) {
      Object.assign(effectivePerms, agentConfig.tools);
    }
    if (agentConfig.skills) {
      Object.assign(effectivePerms, agentConfig.skills);
    }
    
    return effectivePerms;
  };

  const groups = () => {
    return config()?.groups || {};
  };

  return (
    <div class="permission-panel">
      <div class="panel-header">
        <h3>Permission Configuration</h3>
        <div class="header-info">
          <span>Default Mode: <strong style={{ color: getModeColor(config()?.global.defaultMode || 'ask') }}>
            {config()?.global.defaultMode || 'ask'}
          </strong></span>
        </div>
      </div>

      <Show when={isLoading()}>
        <div class="loading">Loading permissions...</div>
      </Show>

      <Show when={config()}>
        <div class="permission-content">
          <div class="agent-selector">
            <h4>Select Scope</h4>
            <div class="scope-list">
              <button 
                class={selectedAgent() === 'global' ? 'active' : ''}
                onClick={() => setSelectedAgent('global')}
              >
                Global Permissions
              </button>
              <For each={agentList()}>
                {(agent) => (
                  <button 
                    class={selectedAgent() === agent ? 'active' : ''}
                    onClick={() => setSelectedAgent(agent)}
                  >
                    {agent}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="search-bar">
            <input
              type="text"
              placeholder="Search tools/skills..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
          </div>

          <Show when={selectedAgent() === 'global'}>
            <div class="permissions-section">
              <h4>Global Permissions</h4>
              <p class="section-description">
                These permissions apply to all agents unless overridden at the agent level.
              </p>
              
              <div class="permission-table">
                <div class="table-header">
                  <span class="col-name">Tool/Skill</span>
                  <span class="col-mode">Mode</span>
                  <span class="col-actions">Actions</span>
                </div>
                <For each={globalTools()}>
                  {([name, mode]) => (
                    <div class="table-row">
                      <span class="col-name">{name}</span>
                      <span class="col-mode" style={{ color: getModeColor(mode) }}>
                        {getModeIcon(mode)} {mode}
                      </span>
                      <span class="col-actions">
                        <button 
                          class={`btn-sm ${mode === 'allow' ? 'active' : ''}`}
                          onClick={() => handleUpdateGlobalPermission(name, 'allow')}
                          title="Allow"
                        >
                          ✓
                        </button>
                        <button 
                          class={`btn-sm ${mode === 'ask' ? 'active' : ''}`}
                          onClick={() => handleUpdateGlobalPermission(name, 'ask')}
                          title="Ask"
                        >
                          ?
                        </button>
                        <button 
                          class={`btn-sm ${mode === 'deny' ? 'active' : ''}`}
                          onClick={() => handleUpdateGlobalPermission(name, 'deny')}
                          title="Deny"
                        >
                          ✗
                        </button>
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={selectedAgent() !== 'global' && agentPermissions()}>
            <div class="permissions-section">
              <h4>Agent: {selectedAgent()}</h4>
              <div class="agent-config-info">
                <Show when={config()?.agents[selectedAgent()]?.inherit !== false}>
                  <span class="inherit-badge">Inherits from Global</span>
                </Show>
                <Show when={config()?.agents[selectedAgent()]?.inherit === false}>
                  <span class="no-inherit-badge">Does not inherit</span>
                </Show>
              </div>
              
              <div class="permission-table">
                <div class="table-header">
                  <span class="col-name">Tool/Skill</span>
                  <span class="col-mode">Effective Mode</span>
                  <span class="col-source">Source</span>
                  <span class="col-actions">Override</span>
                </div>
                <For each={Object.entries(agentPermissions()!).sort((a, b) => a[0].localeCompare(b[0]))}>
                  {([name, mode]) => {
                    const agentConfig = config()?.agents[selectedAgent()];
                    const isOverridden = agentConfig?.tools?.[name] || agentConfig?.skills?.[name];
                    const isGlobal = config()?.global.tools[name] || config()?.global.skills[name];
                    
                    return (
                      <div class="table-row">
                        <span class="col-name">{name}</span>
                        <span class="col-mode" style={{ color: getModeColor(mode) }}>
                          {getModeIcon(mode)} {mode}
                        </span>
                        <span class="col-source">
                          {isOverridden ? 'Agent' : isGlobal ? 'Global' : 'Default'}
                        </span>
                        <span class="col-actions">
                          <button 
                            class={`btn-sm ${mode === 'allow' ? 'active' : ''}`}
                            onClick={() => handleUpdateAgentPermission(selectedAgent(), name, 'allow')}
                            title="Allow"
                          >
                            ✓
                          </button>
                          <button 
                            class={`btn-sm ${mode === 'ask' ? 'active' : ''}`}
                            onClick={() => handleUpdateAgentPermission(selectedAgent(), name, 'ask')}
                            title="Ask"
                          >
                            ?
                          </button>
                          <button 
                            class={`btn-sm ${mode === 'deny' ? 'active' : ''}`}
                            onClick={() => handleUpdateAgentPermission(selectedAgent(), name, 'deny')}
                            title="Deny"
                          >
                            ✗
                          </button>
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>

          <Show when={Object.keys(groups()).length > 0}>
            <div class="groups-section">
              <h4>Permission Groups</h4>
              <p class="section-description">
                Predefined permission groups that can be applied to agents.
              </p>
              
              <div class="groups-grid">
                <For each={Object.entries(groups())}>
                  {([name, perms]) => (
                    <div class="group-card">
                      <h5>{name}</h5>
                      <div class="group-perms">
                        <For each={Object.entries(perms).slice(0, 5)}>
                          {([tool, mode]) => (
                            <div class="perm-row">
                              <span class="perm-tool">{tool}</span>
                              <span class="perm-mode" style={{ color: getModeColor(mode) }}>
                                {getModeIcon(mode)}
                              </span>
                            </div>
                          )}
                        </For>
                        <Show when={Object.keys(perms).length > 5}>
                          <span class="more">+{Object.keys(perms).length - 5} more</span>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={config()?.agents[selectedAgent()]?.patterns && config()?.agents[selectedAgent()]?.patterns!.length > 0}>
            <div class="patterns-section">
              <h4>Permission Patterns</h4>
              <p class="section-description">
                Pattern-based permission rules for this agent.
              </p>
              
              <div class="patterns-list">
                <For each={config()?.agents[selectedAgent()]?.patterns}>
                  {(pattern) => (
                    <div class="pattern-item">
                      <div class="pattern-header">
                        <code class="pattern-expr">{pattern.pattern}</code>
                        <span class="pattern-mode" style={{ color: getModeColor(pattern.mode) }}>
                          {getModeIcon(pattern.mode)} {pattern.mode}
                        </span>
                      </div>
                      <Show when={pattern.conditions && pattern.conditions.length > 0}>
                        <div class="pattern-conditions">
                          <For each={pattern.conditions}>
                            {(cond) => (
                              <span class="condition">
                                {cond.type} {cond.operator} "{cond.value}"
                              </span>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
