import { createSignal, For, Show, onMount } from 'solid-js';
import type { UnifiedTool, ToolGroup } from '../types';
import { apiClient } from '../services/api';
import { showToast } from './Toast';

export function ToolRegistryPanel() {
  const [tools, setTools] = createSignal<UnifiedTool[]>([]);
  const [groups, setGroups] = createSignal<ToolGroup[]>([]);
  const [selectedTool, setSelectedTool] = createSignal<UnifiedTool | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [filterType, setFilterType] = createSignal<'all' | 'tool' | 'skill' | 'mcp-tool'>('all');
  const [filterCategory, setFilterCategory] = createSignal<string>('all');
  const [selectedGroup, setSelectedGroup] = createSignal<ToolGroup | null>(null);

  onMount(() => {
    loadTools();
  });

  const loadTools = async () => {
    setIsLoading(true);
    const response = await apiClient.getTools();
    if (response.success && response.data) {
      setTools(response.data.tools);
      setGroups(response.data.groups);
    } else {
      showToast('Failed to load tools', 'error');
    }
    setIsLoading(false);
  };

  const filteredTools = () => {
    let result = tools();
    const query = searchQuery().toLowerCase();
    const type = filterType();
    const category = filterCategory();

    if (type !== 'all') {
      result = result.filter(t => t.type === type);
    }

    if (category !== 'all') {
      result = result.filter(t => t.category === category);
    }

    if (query) {
      result = result.filter(t => 
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return result;
  };

  const categories = () => {
    const cats = new Set(tools().map(t => t.category));
    return Array.from(cats).sort();
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'tool': return 'var(--accent-primary)';
      case 'skill': return 'var(--success)';
      case 'mcp-tool': return 'var(--warning)';
      default: return 'var(--text-tertiary)';
    }
  };

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'critical': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#ca8a04';
      case 'low': return '#16a34a';
      default: return 'var(--text-tertiary)';
    }
  };

  const getToolsByGroup = (groupName: string) => {
    const group = groups().find(g => g.name === groupName);
    if (!group) return [];
    return tools().filter(t => group.tools.includes(t.name));
  };

  return (
    <div class="tool-registry-panel">
      <div class="panel-header">
        <h3>Tool Registry</h3>
        <div class="header-stats">
          <span>{tools().length} tools</span>
          <span>{groups().length} groups</span>
        </div>
      </div>

      <div class="panel-tabs">
        <button 
          class={filterType() === 'all' ? 'active' : ''} 
          onClick={() => setFilterType('all')}
        >
          All
        </button>
        <button 
          class={filterType() === 'tool' ? 'active' : ''} 
          onClick={() => setFilterType('tool')}
        >
          Tools
        </button>
        <button 
          class={filterType() === 'skill' ? 'active' : ''} 
          onClick={() => setFilterType('skill')}
        >
          Skills
        </button>
        <button 
          class={filterType() === 'mcp-tool' ? 'active' : ''} 
          onClick={() => setFilterType('mcp-tool')}
        >
          MCP Tools
        </button>
      </div>

      <div class="search-bar">
        <input
          type="text"
          placeholder="Search tools..."
          value={searchQuery()}
          onInput={(e) => setSearchQuery(e.currentTarget.value)}
        />
        <select 
          value={filterCategory()} 
          onChange={(e) => setFilterCategory(e.currentTarget.value)}
        >
          <option value="all">All Categories</option>
          <For each={categories()}>
            {(cat) => <option value={cat}>{cat}</option>}
          </For>
        </select>
      </div>

      <Show when={isLoading()}>
        <div class="loading">Loading tools...</div>
      </Show>

      <div class="tool-groups-section">
        <h4>Tool Groups</h4>
        <div class="groups-grid">
          <For each={groups()}>
            {(group) => (
              <div 
                class="group-card"
                onClick={() => setSelectedGroup(selectedGroup()?.name === group.name ? null : group)}
              >
                <div class="group-header">
                  <span class="group-name">{group.displayName}</span>
                  <span class="group-count">{group.tools.length} tools</span>
                </div>
                <Show when={group.description}>
                  <p class="group-description">{group.description}</p>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      <Show when={selectedGroup()}>
        <div class="group-detail">
          <div class="detail-header">
            <h4>{selectedGroup()?.displayName}</h4>
            <button class="btn-secondary" onClick={() => setSelectedGroup(null)}>Close</button>
          </div>
          <div class="tool-list">
            <For each={getToolsByGroup(selectedGroup()!.name)}>
              {(tool) => (
                <div class="tool-item compact" onClick={() => setSelectedTool(tool)}>
                  <span class="tool-name">{tool.name}</span>
                  <span class="tool-type" style={{ color: getTypeColor(tool.type) }}>
                    {tool.type}
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="tools-section">
        <h4>Tools ({filteredTools().length})</h4>
        <div class="tool-list">
          <For each={filteredTools()}>
            {(tool) => (
              <div 
                class={`tool-item ${selectedTool()?.name === tool.name ? 'selected' : ''}`}
                onClick={() => setSelectedTool(tool)}
              >
                <div class="tool-header">
                  <span class="tool-name">{tool.displayName || tool.name}</span>
                  <div class="tool-badges">
                    <span class="tool-type" style={{ color: getTypeColor(tool.type) }}>
                      {tool.type}
                    </span>
                    <Show when={tool.riskLevel}>
                      <span class="risk-badge" style={{ backgroundColor: getRiskColor(tool.riskLevel) }}>
                        {tool.riskLevel}
                      </span>
                    </Show>
                  </div>
                </div>
                <p class="tool-description">{tool.description}</p>
                <div class="tool-meta">
                  <span class="tool-category">{tool.category}</span>
                  <Show when={tool.version}>
                    <span class="tool-version">v{tool.version}</span>
                  </Show>
                </div>
                <Show when={tool.tags && tool.tags.length > 0}>
                  <div class="tool-tags">
                    <For each={tool.tags?.slice(0, 3)}>
                      {(tag) => <span class="tag">{tag}</span>}
                    </For>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </div>

      <Show when={selectedTool()}>
        <div class="tool-detail">
          <div class="detail-header">
            <h4>{selectedTool()?.displayName || selectedTool()?.name}</h4>
            <button class="btn-secondary" onClick={() => setSelectedTool(null)}>Close</button>
          </div>
          
          <div class="detail-content">
            <div class="detail-section">
              <label>Description</label>
              <p>{selectedTool()?.description}</p>
            </div>

            <div class="detail-row">
              <div class="detail-section">
                <label>Type</label>
                <p style={{ color: getTypeColor(selectedTool()?.type || '') }}>
                  {selectedTool()?.type}
                </p>
              </div>
              <div class="detail-section">
                <label>Category</label>
                <p>{selectedTool()?.category}</p>
              </div>
              <div class="detail-section">
                <label>Risk Level</label>
                <p style={{ color: getRiskColor(selectedTool()?.riskLevel) }}>
                  {selectedTool()?.riskLevel || 'unknown'}
                </p>
              </div>
            </div>

            <Show when={selectedTool()?.dependencies && selectedTool()?.dependencies!.length > 0}>
              <div class="detail-section">
                <label>Dependencies</label>
                <div class="dependencies-list">
                  <For each={selectedTool()?.dependencies}>
                    {(dep) => <span class="dep-item">{dep}</span>}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={selectedTool()?.requiredPermissions && selectedTool()?.requiredPermissions!.length > 0}>
              <div class="detail-section">
                <label>Required Permissions</label>
                <div class="permissions-list">
                  <For each={selectedTool()?.requiredPermissions}>
                    {(perm) => (
                      <span class="perm-item">
                        <span class="perm-type">{perm.type}</span>
                        <span class="perm-pattern">{perm.pattern}</span>
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={selectedTool()?.tags && selectedTool()?.tags!.length > 0}>
              <div class="detail-section">
                <label>Tags</label>
                <div class="tags-list">
                  <For each={selectedTool()?.tags}>
                    {(tag) => <span class="tag">{tag}</span>}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
