import { createSignal, For, Show, onMount } from 'solid-js';
import type { AgentInstance, AgentConfig } from '../types';
import { apiClient } from '../services/api';
import { showToast } from './Toast';

export function AgentConfigPanel() {
  const [agents, setAgents] = createSignal<AgentInstance[]>([]);
  const [selectedAgent, setSelectedAgent] = createSignal<AgentInstance | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [defaultAgent, setDefaultAgent] = createSignal<string>('');
  const [searchQuery, setSearchQuery] = createSignal('');
  const [showCreateModal, setShowCreateModal] = createSignal(false);
  const [editingConfig, setEditingConfig] = createSignal<Partial<AgentConfig> | null>(null);

  onMount(() => {
    loadAgents();
  });

  const loadAgents = async () => {
    setIsLoading(true);
    const response = await apiClient.getAgents();
    if (response.success && response.data) {
      setAgents(response.data.agents);
      setDefaultAgent(response.data.default);
    } else {
      showToast('Failed to load agents', 'error');
    }
    setIsLoading(false);
  };

  const handleSelectAgent = (agent: AgentInstance) => {
    setSelectedAgent(agent);
    setEditingConfig({ ...agent.config });
  };

  const handleEnableAgent = async (name: string) => {
    const response = await apiClient.enableAgent(name);
    if (response.success) {
      showToast(`Agent '${name}' enabled`, 'success');
      loadAgents();
    } else {
      showToast('Failed to enable agent', 'error');
    }
  };

  const handleDisableAgent = async (name: string) => {
    const response = await apiClient.disableAgent(name);
    if (response.success) {
      showToast(`Agent '${name}' disabled`, 'success');
      loadAgents();
    } else {
      showToast('Failed to disable agent', 'error');
    }
  };

  const handleSetDefault = async (name: string) => {
    const response = await apiClient.setDefaultAgent(name);
    if (response.success) {
      setDefaultAgent(name);
      showToast(`Agent '${name}' set as default`, 'success');
    } else {
      showToast('Failed to set default agent', 'error');
    }
  };

  const handleDeleteAgent = async (name: string) => {
    if (!confirm(`Are you sure you want to delete agent '${name}'?`)) return;
    
    const response = await apiClient.deleteAgent(name);
    if (response.success) {
      showToast(`Agent '${name}' deleted`, 'success');
      setSelectedAgent(null);
      loadAgents();
    } else {
      showToast('Failed to delete agent', 'error');
    }
  };

  const handleSaveConfig = async () => {
    const config = editingConfig();
    if (!config?.name) return;

    const response = await apiClient.updateAgent(config.name, config);
    if (response.success) {
      showToast('Agent updated successfully', 'success');
      loadAgents();
    } else {
      showToast('Failed to update agent', 'error');
    }
  };

  const filteredAgents = () => {
    const query = searchQuery().toLowerCase();
    if (!query) return agents();
    
    return agents().filter(a => 
      a.config.name.toLowerCase().includes(query) ||
      a.config.displayName?.toLowerCase().includes(query) ||
      a.config.description.toLowerCase().includes(query) ||
      a.config.metadata?.tags?.some(t => t.toLowerCase().includes(query))
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'var(--success)';
      case 'idle': return 'var(--accent-primary)';
      case 'disabled': return 'var(--text-tertiary)';
      case 'error': return 'var(--error)';
      default: return 'var(--text-tertiary)';
    }
  };

  return (
    <div class="agent-config-panel">
      <div class="panel-header">
        <h3>Agent Configuration</h3>
        <button class="btn-primary" onClick={() => setShowCreateModal(true)}>
          + Create Agent
        </button>
      </div>

      <div class="search-bar">
        <input
          type="text"
          placeholder="Search agents..."
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
        />
      </div>

      <Show when={isLoading()}>
        <div class="loading">Loading agents...</div>
      </Show>

      <div class="agent-list">
        <For each={filteredAgents()}>
          {(agent) => (
            <div 
              class={`agent-card ${selectedAgent()?.config.name === agent.config.name ? 'selected' : ''}`}
              onClick={() => handleSelectAgent(agent)}
            >
              <div class="agent-header">
                <span class="agent-icon">{agent.config.metadata?.icon || '🤖'}</span>
                <div class="agent-info">
                  <div class="agent-name">
                    {agent.config.displayName || agent.config.name}
                    {defaultAgent() === agent.config.name && (
                      <span class="default-badge">Default</span>
                    )}
                  </div>
                  <div class="agent-description">{agent.config.description}</div>
                </div>
                <div 
                  class="agent-status" 
                  style={{ background: getStatusColor(agent.status) }}
                  title={agent.status}
                />
              </div>
              
              <Show when={agent.config.metadata?.tags}>
                <div class="agent-tags">
                  <For each={agent.config.metadata?.tags}>
                    {(tag) => <span class="tag">{tag}</span>}
                  </For>
                </div>
              </Show>

              <div class="agent-stats">
                <span>Usage: {agent.usageCount}</span>
                <Show when={agent.lastUsed}>
                  <span>Last: {new Date(agent.lastUsed!).toLocaleString()}</span>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={selectedAgent() && editingConfig()}>
        <div class="agent-detail">
          <div class="detail-header">
            <h4>Edit Agent: {selectedAgent()?.config.name}</h4>
            <div class="detail-actions">
              <Show when={selectedAgent()?.config.enabled !== false}>
                <button class="btn-secondary" onClick={() => handleDisableAgent(selectedAgent()!.config.name)}>
                  Disable
                </button>
              </Show>
              <Show when={selectedAgent()?.config.enabled === false}>
                <button class="btn-secondary" onClick={() => handleEnableAgent(selectedAgent()!.config.name)}>
                  Enable
                </button>
              </Show>
              <button class="btn-secondary" onClick={() => handleSetDefault(selectedAgent()!.config.name)}>
                Set Default
              </button>
              <button class="btn-danger" onClick={() => handleDeleteAgent(selectedAgent()!.config.name)}>
                Delete
              </button>
            </div>
          </div>

          <div class="detail-content">
            <div class="form-group">
              <label>Display Name</label>
              <input
                type="text"
                value={editingConfig()?.displayName || ''}
                onInput={(e) => setEditingConfig({ ...editingConfig()!, displayName: e.currentTarget.value })}
              />
            </div>

            <div class="form-group">
              <label>Description</label>
              <textarea
                value={editingConfig()?.description || ''}
                onInput={(e) => setEditingConfig({ ...editingConfig()!, description: e.currentTarget.value })}
              />
            </div>

            <div class="form-group">
              <label>System Prompt</label>
              <textarea
                class="prompt-textarea"
                value={editingConfig()?.systemPrompt || ''}
                onInput={(e) => setEditingConfig({ ...editingConfig()!, systemPrompt: e.currentTarget.value })}
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Icon</label>
                <input
                  type="text"
                  value={editingConfig()?.metadata?.icon || ''}
                  onInput={(e) => setEditingConfig({ 
                    ...editingConfig()!, 
                    metadata: { ...editingConfig()?.metadata, icon: e.currentTarget.value }
                  })}
                />
              </div>
              <div class="form-group">
                <label>Version</label>
                <input
                  type="text"
                  value={editingConfig()?.metadata?.version || ''}
                  onInput={(e) => setEditingConfig({ 
                    ...editingConfig()!, 
                    metadata: { ...editingConfig()?.metadata, version: e.currentTarget.value }
                  })}
                />
              </div>
            </div>

            <div class="form-group">
              <label>Tags (comma separated)</label>
              <input
                type="text"
                value={editingConfig()?.metadata?.tags?.join(', ') || ''}
                onInput={(e) => setEditingConfig({ 
                  ...editingConfig()!, 
                  metadata: { 
                    ...editingConfig()?.metadata, 
                    tags: e.currentTarget.value.split(',').map(t => t.trim()).filter(Boolean)
                  }
                })}
              />
            </div>

            <div class="form-group">
              <label>Model</label>
              <input
                type="text"
                value={editingConfig()?.model?.name || ''}
                onInput={(e) => setEditingConfig({ 
                  ...editingConfig()!, 
                  model: { ...editingConfig()?.model!, name: e.currentTarget.value }
                })}
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Temperature</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={editingConfig()?.model?.temperature || 0.7}
                  onInput={(e) => setEditingConfig({ 
                    ...editingConfig()!, 
                    model: { ...editingConfig()?.model!, temperature: parseFloat(e.currentTarget.value) }
                  })}
                />
              </div>
              <div class="form-group">
                <label>Max Tokens</label>
                <input
                  type="number"
                  value={editingConfig()?.model?.maxTokens || 2000}
                  onInput={(e) => setEditingConfig({ 
                    ...editingConfig()!, 
                    model: { ...editingConfig()?.model!, maxTokens: parseInt(e.currentTarget.value) }
                  })}
                />
              </div>
            </div>

            <div class="form-group">
              <label>Allowed Tools</label>
              <input
                type="text"
                value={Array.isArray(editingConfig()?.tools) 
                  ? editingConfig()?.tools?.join(', ')
                  : (editingConfig()?.tools as any)?.allowed?.join(', ') || ''
                }
                onInput={(e) => {
                  const tools = e.currentTarget.value.split(',').map(t => t.trim()).filter(Boolean);
                  setEditingConfig({ 
                    ...editingConfig()!, 
                    tools: { allowed: tools }
                  });
                }}
              />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Max Steps</label>
                <input
                  type="number"
                  value={editingConfig()?.runtime?.maxSteps || 50}
                  onInput={(e) => setEditingConfig({ 
                    ...editingConfig()!, 
                    runtime: { ...editingConfig()?.runtime, maxSteps: parseInt(e.currentTarget.value) }
                  })}
                />
              </div>
              <div class="form-group">
                <label>Timeout (ms)</label>
                <input
                  type="number"
                  value={editingConfig()?.runtime?.timeout || 300000}
                  onInput={(e) => setEditingConfig({ 
                    ...editingConfig()!, 
                    runtime: { ...editingConfig()?.runtime, timeout: parseInt(e.currentTarget.value) }
                  })}
                />
              </div>
            </div>

            <div class="form-actions">
              <button class="btn-secondary" onClick={() => setSelectedAgent(null)}>
                Cancel
              </button>
              <button class="btn-primary" onClick={handleSaveConfig}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
