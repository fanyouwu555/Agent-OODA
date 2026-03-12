import { createSignal, createEffect, For, Show } from 'solid-js';
import type { MemoryRecord } from '@ooda-agent/core';

interface MemoryVisualizationProps {
  memories: MemoryRecord[];
  onMemoryClick?: (memory: MemoryRecord) => void;
  onMemoryDelete?: (memoryId: string) => void;
}

export function MemoryVisualization(props: MemoryVisualizationProps) {
  const [selectedType, setSelectedType] = createSignal<string>('all');
  const [searchQuery, setSearchQuery] = createSignal('');
  const [sortBy, setSortBy] = createSignal<'importance' | 'time' | 'access'>('importance');

  // 过滤和排序记忆
  const filteredMemories = () => {
    let result = props.memories;

    // 按类型过滤
    if (selectedType() !== 'all') {
      result = result.filter(m => m.type === selectedType());
    }

    // 按搜索词过滤
    if (searchQuery()) {
      const query = searchQuery().toLowerCase();
      result = result.filter(m => 
        m.content.toLowerCase().includes(query) ||
        m.tags?.some(t => t.toLowerCase().includes(query))
      );
    }

    // 排序
    return result.sort((a, b) => {
      switch (sortBy()) {
        case 'importance':
          return b.importance - a.importance;
        case 'time':
          return b.createdAt - a.createdAt;
        case 'access':
          return (b.accessCount || 0) - (a.accessCount || 0);
        default:
          return 0;
      }
    });
  };

  // 统计信息
  const stats = () => {
    const memories = props.memories;
    const byType: Record<string, number> = {};
    memories.forEach(m => {
      byType[m.type] = (byType[m.type] || 0) + 1;
    });

    return {
      total: memories.length,
      byType,
      avgImportance: memories.length > 0 
        ? memories.reduce((sum, m) => sum + m.importance, 0) / memories.length 
        : 0,
    };
  };

  // 获取重要性颜色
  const getImportanceColor = (importance: number) => {
    if (importance >= 0.8) return '#22c55e';
    if (importance >= 0.6) return '#3b82f6';
    if (importance >= 0.4) return '#f59e0b';
    return '#ef4444';
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div class="memory-visualization">
      {/* 统计面板 */}
      <div class="memory-stats">
        <div class="stat-card">
          <div class="stat-value">{stats().total}</div>
          <div class="stat-label">总记忆数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{(stats().avgImportance * 100).toFixed(1)}%</div>
          <div class="stat-label">平均重要性</div>
        </div>
        <For each={Object.entries(stats().byType)}>
          {([type, count]) => (
            <div class="stat-card">
              <div class="stat-value">{count}</div>
              <div class="stat-label">{getTypeLabel(type)}</div>
            </div>
          )}
        </For>
      </div>

      {/* 过滤器 */}
      <div class="memory-filters">
        <div class="filter-group">
          <label>类型:</label>
          <select 
            value={selectedType()} 
            onChange={(e) => setSelectedType(e.currentTarget.value)}
          >
            <option value="all">全部</option>
            <option value="fact">事实</option>
            <option value="experience">经验</option>
            <option value="skill">技能</option>
            <option value="preference">偏好</option>
          </select>
        </div>

        <div class="filter-group">
          <label>排序:</label>
          <select 
            value={sortBy()} 
            onChange={(e) => setSortBy(e.currentTarget.value as any)}
          >
            <option value="importance">重要性</option>
            <option value="time">时间</option>
            <option value="access">访问次数</option>
          </select>
        </div>

        <div class="filter-group search">
          <input
            type="text"
            placeholder="搜索记忆..."
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* 记忆列表 */}
      <div class="memory-list">
        <For each={filteredMemories()}>
          {(memory) => (
            <div 
              class="memory-item"
              onClick={() => props.onMemoryClick?.(memory)}
            >
              <div class="memory-header">
                <span 
                  class="memory-type"
                  style={{ 'background-color': getTypeColor(memory.type) }}
                >
                  {getTypeLabel(memory.type)}
                </span>
                <span 
                  class="memory-importance"
                  style={{ color: getImportanceColor(memory.importance) }}
                >
                  {'★'.repeat(Math.ceil(memory.importance * 5))}
                </span>
                <span class="memory-time">{formatTime(memory.createdAt)}</span>
                <Show when={props.onMemoryDelete}>
                  <button 
                    class="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onMemoryDelete?.(memory.id);
                    }}
                  >
                    ×
                  </button>
                </Show>
              </div>
              
              <div class="memory-content">{memory.content}</div>
              
              <Show when={memory.tags && memory.tags.length > 0}>
                <div class="memory-tags">
                  <For each={memory.tags}>
                    {(tag) => <span class="tag">{tag}</span>}
                  </For>
                </div>
              </Show>

              <div class="memory-meta">
                <span>访问: {memory.accessCount || 0}次</span>
                <Show when={memory.lastAccessed}>
                  <span>最后访问: {formatTime(memory.lastAccessed!)}</span>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>

      {/* 空状态 */}
      <Show when={filteredMemories().length === 0}>
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-text">暂无记忆</div>
        </div>
      </Show>
    </div>
  );
}

// 辅助函数
function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    fact: '事实',
    experience: '经验',
    skill: '技能',
    preference: '偏好',
  };
  return labels[type] || type;
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    fact: '#3b82f6',
    experience: '#8b5cf6',
    skill: '#22c55e',
    preference: '#f59e0b',
  };
  return colors[type] || '#6b7280';
}
