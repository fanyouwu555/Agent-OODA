import { createSignal, createEffect, onMount, Show, For, onCleanup } from 'solid-js';
import type { Message, Skill, ConfirmationRequest, ToolCall, SSEEvent, ModelInfo, Provider, AgentInstance, SessionListItem } from './types';
import { apiClient } from './services/api';
import { createEventClient } from './services/event-client';
import { ConfirmationDialog } from './components/ConfirmationDialog';
import { ToastContainer, showToast } from './components/Toast';
import { Typewriter, SmartTypewriter } from './components/Typewriter';
import { MarkdownRenderer } from './components/MarkdownRenderer';

const SESSION_STORAGE_KEY = 'ooda-agent-session-id';

function getSessionIdFromStorage(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSessionIdToStorage(sessionId: string): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage errors
  }
}

function clearSessionIdFromStorage(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// 组件：Agent下拉选择器
function AgentSelector(props: {
  currentAgent: string;
  agents: AgentInstance[];
  onSelect: (name: string) => void;
}) {
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <div class="agent-selector-dropdown">
      <button class="agent-selector-trigger" onClick={() => setIsOpen(!isOpen())}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
          <path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
        <span>{props.currentAgent}</span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      <Show when={isOpen()}>
        <div class="agent-dropdown-menu">
          <For each={props.agents}>
            {(agent) => (
              <button
                class={`agent-option ${props.currentAgent === agent.config.name ? 'active' : ''}`}
                onClick={() => {
                  props.onSelect(agent.config.name);
                  setIsOpen(false);
                }}
              >
                <span class="agent-option-icon">{agent.config.metadata?.icon || '🤖'}</span>
                <div class="agent-option-info">
                  <span class="agent-option-name">{agent.config.displayName || agent.config.name}</span>
                  <span class="agent-option-desc">{agent.config.description}</span>
                </div>
                <Show when={props.currentAgent === agent.config.name}>
                  <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </Show>
              </button>
            )}
          </For>
        </div>
        <div class="dropdown-backdrop" onClick={() => setIsOpen(false)} />
      </Show>
    </div>
  );
}

// 组件：会话历史弹窗
function SessionHistoryPopup(props: {
  isOpen: boolean;
  onClose: () => void;
  currentSessionId: string;
  sessions: SessionListItem[];
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onArchiveSession: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = createSignal<'active' | 'archived'>('active');

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleDateString('zh-CN');
  };

  const filteredSessions = () => {
    return props.sessions.filter(s => 
      activeTab() === 'active' ? s.status !== 'archived' : s.status === 'archived'
    );
  };

  return (
    <Show when={props.isOpen}>
      <div class="popup-overlay" onClick={props.onClose}>
        <div class="session-popup" onClick={(e) => e.stopPropagation()}>
          <div class="popup-header">
            <h3>会话历史</h3>
            <button class="popup-close" onClick={props.onClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <button class="new-session-btn-large" onClick={() => {
            props.onNewSession();
            props.onClose();
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            新建会话
          </button>

          <div class="session-tabs-popup">
            <button 
              class={`tab-popup ${activeTab() === 'active' ? 'active' : ''}`}
              onClick={() => setActiveTab('active')}
            >
              活跃
            </button>
            <button 
              class={`tab-popup ${activeTab() === 'archived' ? 'active' : ''}`}
              onClick={() => setActiveTab('archived')}
            >
              已归档
            </button>
          </div>

          <div class="session-list-popup">
            <For each={props.sessions}>
              {(session) => (
                <div 
                  class={`session-item-popup ${props.currentSessionId === session.id ? 'active' : ''}`}
                  onClick={() => {
                    props.onSelectSession(session.id);
                    props.onClose();
                  }}
                >
                  <div class="session-info-popup">
                    <span class="session-title-popup">{session.title || '新会话'}</span>
                    <span class="session-meta-popup">{session.messageCount} 条消息 · {formatTime(session.updatedAt)}</span>
                  </div>
                  <div class="session-actions-popup">
                    <button 
                      class="session-action-btn" 
                      title="归档"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onArchiveSession(session.id);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>
                      </svg>
                    </button>
                    <button 
                      class="session-action-btn delete" 
                      title="删除"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDeleteSession(session.id);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </For>
            <Show when={props.sessions.length === 0}>
              <div class="empty-sessions-popup">暂无会话</div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}

// 组件：设置弹窗
function SettingsPopup(props: {
  isOpen: boolean;
  onClose: () => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
  skills: Skill[];
  modelInfo: ModelInfo;
  providers: Provider[];
  onSwitchModel: (provider: string, model: string) => void;
  agents: AgentInstance[];
  currentAgent: string;
  onSelectAgent: (name: string) => void;
  onSelectSkill: (name: string) => void;
  mcpServers: Array<{name: string; status: 'connected' | 'disconnected'; tools: number}>;
  onToggleMcp: (name: string) => void;
  // 日志相关
  loggingEnabled: boolean;
  loggingLevel: string;
  loggingCategories: Record<string, boolean>;
  fileLoggingEnabled: boolean;
  logDir: string;
  logFiles: string[];
  onToggleLogging: (enabled: boolean) => void;
  onSetLoggingLevel: (level: string) => void;
  onToggleLoggingCategory: (category: string, enabled: boolean) => void;
  onToggleFileLogging: (enabled: boolean) => void;
  onClearLogs: () => void;
}) {
  const sections = [
    { id: 'chat', name: '对话', icon: '💬' },
    { id: 'agents', name: 'Agent', icon: '🤖' },
    { id: 'mcp', name: 'MCP', icon: '🔌' },
    { id: 'tools', name: '工具', icon: '🔧' },
    { id: 'permissions', name: '权限', icon: '🔒' },
    { id: 'logging', name: '日志', icon: '📋' },
  ];

  return (
    <Show when={props.isOpen}>
      <div class="popup-overlay" onClick={props.onClose}>
        <div class="settings-popup" onClick={(e) => e.stopPropagation()}>
          <div class="settings-sidebar-popup">
            <For each={sections}>
              {(section) => (
                <button 
                  class={`settings-nav-item ${props.activeSection === section.id ? 'active' : ''}`}
                  onClick={() => props.onSectionChange(section.id)}
                >
                  <span class="nav-icon">{section.icon}</span>
                  <span>{section.name}</span>
                </button>
              )}
            </For>
          </div>
          
          <div class="settings-content-popup">
            <div class="popup-header">
              <h3>{sections.find(s => s.id === props.activeSection)?.name || '设置'}</h3>
              <button class="popup-close" onClick={props.onClose}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <Show when={props.activeSection === 'chat'}>
              <div class="settings-section-content">
                <div class="setting-group">
                  <label>当前模型</label>
                  <select 
                    value={`${props.modelInfo.provider}/${props.modelInfo.name}`}
                    onChange={(e) => {
                      const [provider, model] = e.currentTarget.value.split('/');
                      props.onSwitchModel(provider, model);
                    }}
                  >
                    <For each={props.providers}>
                      {(provider) => (
                        <optgroup label={provider.name}>
                          <For each={provider.models}>
                            {(model) => (
                              <option value={`${provider.name}/${model.name}`}>
                                {model.name}
                              </option>
                            )}
                          </For>
                        </optgroup>
                      )}
                    </For>
                  </select>
                </div>
                <div class="setting-group">
                  <label>温度</label>
                  <input type="number" value={props.modelInfo.temperature} min="0" max="2" step="0.1" />
                </div>
                <div class="setting-group">
                  <label>最大Tokens</label>
                  <input type="number" value={props.modelInfo.maxTokens} min="1000" max="32000" step="1000" />
                </div>
              </div>
            </Show>

            <Show when={props.activeSection === 'agents'}>
              <div class="settings-section-content">
                <p class="section-desc">选择Agent</p>
                <div class="agents-list-compact">
                  <For each={props.agents}>
                    {(agent) => (
                      <div 
                        class={`agent-card-compact ${props.currentAgent === agent.config.name ? 'active' : ''}`}
                        onClick={() => props.onSelectAgent(agent.config.name)}
                      >
                        <span class="agent-icon">{agent.config.metadata?.icon || '🤖'}</span>
                        <div class="agent-info">
                          <span class="agent-name">{agent.config.displayName || agent.config.name}</span>
                          <span class="agent-desc">{agent.config.description}</span>
                        </div>
                        <Show when={props.currentAgent === agent.config.name}>
                          <span class="agent-badge-active">当前</span>
                        </Show>
                        <Show when={agent.status === 'disabled'}>
                          <span class="agent-badge-disabled">已禁用</span>
                        </Show>
                      </div>
                    )}
                  </For>
                  <Show when={props.agents.length === 0}>
                    <div class="empty-state-small">暂无Agent</div>
                  </Show>
                </div>
              </div>
            </Show>

            <Show when={props.activeSection === 'mcp'}>
              <div class="settings-section-content">
                <p class="section-desc">MCP服务器 - 点击切换开关</p>
                <div class="mcp-list">
                  <For each={props.mcpServers}>
                    {(server) => (
                      <div class="mcp-item">
                        <div class="mcp-info">
                          <span class="mcp-name">{server.name}</span>
                          <span class="mcp-tools">{server.tools} 个工具</span>
                        </div>
                        <button 
                          class={`mcp-toggle ${server.status}`}
                          onClick={() => props.onToggleMcp(server.name)}
                        >
                          <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                          </span>
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={props.activeSection === 'tools'}>
              <div class="settings-section-content">
                <p class="section-desc">Agent 可用技能列表 ({props.skills.length}个)</p>
                <div class="tools-grid-popup">
                  <For each={props.skills}>
                    {(skill) => (
                      <div 
                        class="tool-item-popup"
                        title="技能由 Agent 自动调用"
                      >
                        <span class="tool-name">{skill.name}</span>
                        <span class="tool-category">{skill.category}</span>
                        <span class="tool-desc">{skill.description}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={props.activeSection === 'permissions'}>
              <div class="settings-section-content">
                <p class="section-desc">权限管理</p>
                <div class="permission-options">
                  <div class="permission-item">
                    <span>文件读取</span>
                    <select><option value="allow">允许</option><option value="ask">询问</option><option value="deny">拒绝</option></select>
                  </div>
                  <div class="permission-item">
                    <span>文件写入</span>
                    <select><option value="ask">询问</option><option value="allow">允许</option><option value="deny">拒绝</option></select>
                  </div>
                  <div class="permission-item">
                    <span>执行命令</span>
                    <select><option value="ask">询问</option><option value="allow">允许</option><option value="deny">拒绝</option></select>
                  </div>
                  <div class="permission-item">
                    <span>网络请求</span>
                    <select><option value="allow">允许</option><option value="ask">询问</option><option value="deny">拒绝</option></select>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={props.activeSection === 'logging'}>
              <div class="settings-section-content">
                <p class="section-desc">日志管理 - 控制和查看系统日志</p>
                
                <div class="logging-main-switch">
                  <div class="logging-toggle-row">
                    <span class="toggle-label">启用日志记录</span>
                    <button 
                      class={`logging-toggle ${props.loggingEnabled ? 'on' : 'off'}`}
                      onClick={() => props.onToggleLogging(!props.loggingEnabled)}
                    >
                      <span class="toggle-track">
                        <span class="toggle-thumb"></span>
                      </span>
                    </button>
                  </div>
                  <div class="logging-toggle-row">
                    <span class="toggle-label">写入文件</span>
                    <button 
                      class={`logging-toggle ${props.fileLoggingEnabled ? 'on' : 'off'}`}
                      onClick={() => props.onToggleFileLogging(!props.fileLoggingEnabled)}
                    >
                      <span class="toggle-track">
                        <span class="toggle-thumb"></span>
                      </span>
                    </button>
                  </div>
                </div>

                <div class="logging-level-section">
                  <label>日志级别</label>
                  <select 
                    value={props.loggingLevel}
                    onChange={(e) => props.onSetLoggingLevel(e.currentTarget.value)}
                    disabled={!props.loggingEnabled}
                  >
                    <option value="trace">Trace (最详细)</option>
                    <option value="debug">Debug (调试)</option>
                    <option value="info">Info (信息)</option>
                    <option value="warn">Warn (警告)</option>
                    <option value="error">Error (错误)</option>
                  </select>
                </div>

                <div class="logging-categories-section">
                  <label>日志分类</label>
                  <div class="logging-categories-grid">
                    {Object.entries(props.loggingCategories).map(([category, enabled]) => (
                      <div class="logging-category-item">
                        <span class="category-name">{category}</span>
                        <button 
                          class={`logging-toggle small ${enabled ? 'on' : 'off'}`}
                          onClick={() => props.onToggleLoggingCategory(category, !enabled)}
                          disabled={!props.loggingEnabled}
                        >
                          <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div class="logging-actions">
                  <button 
                    class="btn-secondary"
                    onClick={props.onClearLogs}
                  >
                    清除日志
                  </button>
                </div>

                <Show when={props.logDir}>
                  <div class="logging-info-section">
                    <label>日志目录</label>
                    <div class="log-dir-path" title={props.logDir}>
                      {props.logDir}
                    </div>
                  </div>
                </Show>

                <Show when={props.logFiles.length > 0}>
                  <div class="logging-files-section">
                    <label>日志文件 ({props.logFiles.length})</label>
                    <div class="log-files-list">
                      {props.logFiles.map((file) => {
                        const fileName = file.split(/[/\\]/).pop() || file;
                        return (
                          <div class="log-file-item" title={file}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <span class="file-name">{fileName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}

function App() {
  const [sessionId, setSessionId] = createSignal('');
  const [message, setMessage] = createSignal('');
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [skills, setSkills] = createSignal<Skill[]>([]);
  const [confirmationRequest, setConfirmationRequest] = createSignal<ConfirmationRequest | null>(null);
  const [currentToolCalls, setCurrentToolCalls] = createSignal<ToolCall[]>([]);
  const [connectionStatus, setConnectionStatus] = createSignal<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [modelInfo, setModelInfo] = createSignal<{ name: string; provider: string; temperature: number; maxTokens: number }>({ name: 'moonshot-v1-8k', provider: 'Kimi', temperature: 0.7, maxTokens: 4000 });
  const [providers, setProviders] = createSignal<Provider[]>([
    { name: 'Kimi', type: 'api', models: [{ name: 'moonshot-v1-8k', temperature: 0.7, maxTokens: 4000 }] },
    { name: 'OpenAI', type: 'api', models: [{ name: 'gpt-4', temperature: 0.7, maxTokens: 8000 }, { name: 'gpt-3.5-turbo', temperature: 0.7, maxTokens: 4000 }] },
    { name: 'Anthropic', type: 'api', models: [{ name: 'claude-3-opus', temperature: 0.7, maxTokens: 200000 }, { name: 'claude-3-sonnet', temperature: 0.7, maxTokens: 200000 }] },
  ]);
  const [currentThinking, setCurrentThinking] = createSignal<string>('');
  const [currentIntent, setCurrentIntent] = createSignal<string>('');
  const [currentReasoning, setCurrentReasoning] = createSignal<string>('');
  const [oodaStep, setOodaStep] = createSignal<string>('');
  const [streamingContent, setStreamingContent] = createSignal<string>('');
  const [isStreaming, setIsStreaming] = createSignal<boolean>(false);
  
  // SSE 事件日志
  const [sseLogs, setSseLogs] = createSignal<Array<{type: string; content?: string; time: number}>>([]);
  const [showSseLogs, setShowSseLogs] = createSignal(false);
  
  // 新布局状态
  const [showSessionHistory, setShowSessionHistory] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [settingsSection, setSettingsSection] = createSignal('chat');
  const [currentAgent, setCurrentAgent] = createSignal('default');
  const [agents, setAgents] = createSignal<AgentInstance[]>([]);
  const [sessions, setSessions] = createSignal<SessionListItem[]>([]);
  
  // MCP服务器状态
  const [mcpServers, setMcpServers] = createSignal<Array<{name: string; status: 'connected' | 'disconnected'; tools: number}>>([
    { name: 'filesystem', status: 'connected', tools: 5 },
    { name: 'git', status: 'disconnected', tools: 0 },
    { name: 'browser', status: 'connected', tools: 8 },
  ]);
  
  // 日志管理状态
  const [loggingEnabled, setLoggingEnabled] = createSignal(true);
  const [loggingLevel, setLoggingLevel] = createSignal('info');
  const [loggingCategories, setLoggingCategories] = createSignal<Record<string, boolean>>({
    OODA: true, SERVER: true, SSE: true, WEBSOCKET: true, HTTP: true, 
    TOOL: true, SKILL: true, MEMORY: true, DB: true, PERMISSION: true, CONFIG: true, SYSTEM: true
  });
  const [fileLoggingEnabled, setFileLoggingEnabled] = createSignal(true);
  const [logDir, setLogDir] = createSignal('');
  const [logFiles, setLogFiles] = createSignal<string[]>([]);
  
  // 加载日志状态
  let loggingLoaded = false;
  const loadLoggingStatus = async () => {
    if (loggingLoaded) return;
    loggingLoaded = true;
    try {
      const result = await apiClient.getLoggingStatus();
      if (result.success && result.data) {
        setLoggingEnabled(result.data.enabled);
        setLoggingLevel(result.data.level);
        setLoggingCategories(result.data.categories);
        setFileLoggingEnabled(result.data.fileEnabled);
        setLogDir(result.data.logDir);
      }
      // 加载日志文件列表
      const filesResult = await apiClient.getLoggingFiles();
      if (filesResult.success && filesResult.data) {
        setLogFiles(filesResult.data.files);
      }
    } catch (e) {
      console.error('Failed to load logging status:', e);
    }
  };
  
  // 日志控制函数
  const handleToggleLogging = async (enabled: boolean) => {
    const result = await apiClient.toggleLogging(enabled);
    if (result.success) {
      setLoggingEnabled(enabled);
      showToast('success', enabled ? '日志已启用' : '日志已禁用');
    }
  };
  
  const handleSetLoggingLevel = async (level: string) => {
    const result = await apiClient.setLoggingLevel(level);
    if (result.success) {
      setLoggingLevel(level);
      showToast('success', `日志级别已设置为 ${level}`);
    }
  };
  
  const handleToggleLoggingCategory = async (category: string, enabled: boolean) => {
    const result = await apiClient.toggleLoggingCategory(category, enabled);
    if (result.success) {
      setLoggingCategories(prev => ({ ...prev, [category]: enabled }));
      showToast('success', `${category} 日志已${enabled ? '启用' : '禁用'}`);
    }
  };
  
  const handleToggleFileLogging = async (enabled: boolean) => {
    const result = await apiClient.toggleLoggingFile(enabled);
    if (result.success) {
      setFileLoggingEnabled(enabled);
      showToast('success', enabled ? '文件日志已启用' : '文件日志已禁用');
    }
  };
  
  const handleClearLogs = async () => {
    if (!confirm('确定要清除所有日志吗？')) return;
    const result = await apiClient.clearAllLogging();
    if (result.success) {
      showToast('success', `已清除 ${result.data?.memoryCleared || 0} 条内存日志和 ${result.data?.filesDeleted || 0} 个日志文件`);
    }
  };
  
  // 切换MCP服务器状态
  const toggleMcpServer = (name: string) => {
    setMcpServers(prev => prev.map(s => 
      s.name === name 
        ? { ...s, status: s.status === 'connected' ? 'disconnected' : 'connected' }
        : s
    ));
    // 显示切换后的状态（切换前状态的相反）
    const currentStatus = mcpServers().find(s => s.name === name)?.status;
    const newStatus = currentStatus === 'connected' ? 'disconnected' : 'connected';
    showToast('info', `MCP ${name} 已${newStatus === 'connected' ? '启用' : '禁用'}`);
  };

  let messagesContainer: HTMLDivElement | undefined;
  let eventClient: ReturnType<typeof createEventClient>;
  let unsubscribers: (() => void)[] = [];

  onMount(() => {
    // 使用 EventClient 替换 WebSocket
    eventClient = createEventClient({
      reconnectInterval: 5000,
      onConnect: () => {
        setConnectionStatus('connected');
      },
      onDisconnect: () => {
        setConnectionStatus('disconnected');
      },
      onError: (error) => {
        console.error('[EventClient] Error:', error);
      },
      autoConnect: false, // 延迟连接
    });

    // 订阅事件
    unsubscribers.push(
      // 权限请求
      eventClient.on('permission.asked', (event) => {
        const payload = event.payload as unknown as ConfirmationRequest;
        setConfirmationRequest(payload);
      }),
      
      // 工具调用更新
      eventClient.on('tool.updated', (event) => {
        const toolUpdate = event.payload as ToolCall;
        setCurrentToolCalls((prev) => {
          const index = prev.findIndex((t) => t.id === toolUpdate.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = toolUpdate;
            return updated;
          }
          return [...prev, toolUpdate];
        });
      }),
      
      // 会话更新
      eventClient.on('session.updated', (event) => {
        const sessionData = event.payload as { messages?: Message[] };
        if (sessionData.messages) {
          setMessages(sessionData.messages);
        }
      }),
      
      // 错误事件
      eventClient.on('system.error', (event) => {
        showToast('error', String(event.payload));
      })
    );

    // 连接事件流
    eventClient.connect(sessionId() || undefined);
  });

  const handleWebSocketMessage = (msg: { type: string; payload: unknown }) => {
    switch (msg.type) {
      case 'confirmation':
        setConfirmationRequest(msg.payload as ConfirmationRequest);
        break;
      case 'tool_update':
        const toolUpdate = msg.payload as ToolCall;
        setCurrentToolCalls((prev) => {
          const index = prev.findIndex((t) => t.id === toolUpdate.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = toolUpdate;
            return updated;
          }
          return [...prev, toolUpdate];
        });
        break;
      case 'session_update':
        const sessionData = msg.payload as { messages?: Message[] };
        if (sessionData.messages) {
          setMessages(sessionData.messages);
        }
        break;
      case 'error':
        showToast('error', String(msg.payload));
        break;
    }
  };

  let sessionInitialized = false;
  
  const initializeSession = async () => {
    if (sessionInitialized || sessionId()) return;
    sessionInitialized = true;
    
    const savedSessionId = getSessionIdFromStorage();
    if (savedSessionId) {
      const result = await apiClient.getSession(savedSessionId);
      if (result.success && result.data) {
        setSessionId(savedSessionId);
        if (result.data.messages) {
          setMessages(result.data.messages);
        }
        return;
      }
    }
    const result = await apiClient.createSession();
    if (result.success && result.data) {
      setSessionId(result.data.sessionId);
      saveSessionIdToStorage(result.data.sessionId);
    } else {
      showToast('error', '创建会话失败');
    }
  };
  
  onMount(() => {
    initializeSession();
  });

  createEffect(() => {
    const id = sessionId();
    if (id) {
      saveSessionIdToStorage(id);
    }
  });

  const switchSession = async (newSessionId: string) => {
    if (newSessionId === sessionId()) return;
    
    setSessionId(newSessionId);
    setMessages([]);
    setCurrentToolCalls([]);
    saveSessionIdToStorage(newSessionId);
    
    const result = await apiClient.getSessionHistory(newSessionId);
    if (result.success && result.data) {
      setMessages(result.data);
    }
    
    // EventClient: 切换会话只需要重新连接
    if (eventClient?.isConnected()) {
      eventClient.disconnect();
      eventClient.connect(newSessionId);
    }
    
    showToast('success', '已切换会话');
  };

  const createNewSession = async () => {
    const result = await apiClient.createSession();
    if (result.success && result.data) {
      setSessionId(result.data.sessionId);
      setMessages([]);
      setCurrentToolCalls([]);
      saveSessionIdToStorage(result.data.sessionId);
      showToast('success', '已创建新会话');
    } else {
      showToast('error', result.error || '创建会话失败');
    }
  };

  const deleteSession = async (sessionIdToDelete: string) => {
    const result = await apiClient.deleteSession(sessionIdToDelete);
    if (result.success) {
      showToast('success', '会话已删除');
      // 从列表中移除
      setSessions(prev => prev.filter(s => s.id !== sessionIdToDelete));
      // 如果删除的是当前会话，创建新会话
      if (sessionIdToDelete === sessionId()) {
        createNewSession();
      }
    } else {
      showToast('error', result.error || '删除失败');
    }
  };

  const archiveSession = async (sessionIdToArchive: string) => {
    const result = await apiClient.archiveSession(sessionIdToArchive);
    if (result.success) {
      showToast('success', '会话已归档');
      // 更新列表中的状态
      setSessions(prev => prev.map(s => 
        s.id === sessionIdToArchive ? { ...s, status: 'archived' } : s
      ));
    } else {
      showToast('error', result.error || '归档失败');
    }
  };

  // 过滤当前tab的会话
  const filteredSessions = () => {
    return sessions();
  };

  let skillsLoaded = false;
  const loadSkills = async () => {
    if (skillsLoaded) return;
    skillsLoaded = true;
    const result = await apiClient.getSkills();
    if (result.success && result.data) {
      setSkills(result.data);
    }
  };

  let modelsLoaded = false;
  const loadModels = async () => {
    if (modelsLoaded) return;
    modelsLoaded = true;
    try {
      const result = await apiClient.getModels();
      if (result.success && result.data) {
        setProviders(result.data.providers);
        // 后端返回的是 model 字段，前端期望 name
        const active: any = result.data.activeModel;
        setModelInfo({
          name: active.model || active.name || 'unknown',
          provider: active.provider || 'unknown',
          temperature: active.temperature ?? 0.7,
          maxTokens: active.maxTokens ?? 2000
        });
      } else {
        // 如果API失败，使用默认模型
        setProviders([{
          name: 'Kimi',
          type: 'api',
          models: [{ name: 'moonshot-v1-8k' }]
        }, {
          name: 'OpenAI',
          type: 'api', 
          models: [{ name: 'gpt-4' }, { name: 'gpt-3.5-turbo' }]
        }]);
      }
    } catch (e) {
      console.error('Failed to load models:', e);
      // 使用默认模型
      setProviders([{
        name: 'Kimi',
        type: 'api',
        models: [{ name: 'moonshot-v1-8k' }]
      }]);
    }
  };

  let agentsLoaded = false;
  const loadAgents = async () => {
    if (agentsLoaded) return;
    agentsLoaded = true;
    const result = await apiClient.getAgents();
    if (result.success && result.data) {
      setAgents(result.data.agents);
      if (result.data.default) {
        setCurrentAgent(result.data.default);
      }
    }
  };

  let sessionsLoaded = false;
  const loadSessions = async () => {
    if (sessionsLoaded) return;
    sessionsLoaded = true;
    const result = await apiClient.getSessions();
    if (result.success && result.data) {
      setSessions(result.data);
    }
  };

  onMount(() => {
    loadSkills();
    loadModels();
    loadAgents();
    loadSessions();
  });

  const switchModel = async (providerName: string, modelName: string) => {
    const result = await apiClient.switchModel({ providerName, modelName });
    if (result.success && result.data) {
      setModelInfo(result.data.activeModel);
      showToast('success', `已切换到 ${modelName}`);
    } else {
      showToast('error', result.error || '切换模型失败');
    }
  };

  const scrollToBottom = () => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  createEffect(() => {
    messages();
    scrollToBottom();
  });

  const sendMessage = async () => {
    if (!message() || !sessionId() || isLoading()) return;

    const userMessage = message();
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setMessage('');
    setIsLoading(true);
    setCurrentToolCalls([]);
    setCurrentThinking('');
    setCurrentIntent('');
    setCurrentReasoning('');
    setStreamingContent('');  // 重置流式内容
    setIsStreaming(false);
    setOodaStep('Observe: 分析用户输入...');

    try {
      await apiClient.sendMessage(sessionId(), userMessage, (event: SSEEvent) => {
        handleSSEEvent(event);
      });
    } catch (error) {
      showToast('error', '发送消息失败');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: '发送失败，请重试',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
      setOodaStep('');
    }
  };

  const handleSSEEvent = (event: SSEEvent) => {
    // 使用 queueMicrotask 确保 UI 更新
    queueMicrotask(() => {
      // 调试日志
      console.log('[SSE Client] Received event:', event.type, event.content?.substring(0, 50));
      
      // 记录 SSE 事件日志
      setSseLogs(prev => [...prev.slice(-20), { type: event.type, content: event.content?.substring(0, 100), time: Date.now() }]);
      
      switch (event.type) {
      case 'thinking':
        setOodaStep('Orient: 理解意图...');
        if (event.content) {
          setCurrentThinking(event.content);
        }
        break;
      case 'intent':
        if (event.content) {
          setCurrentIntent(event.content);
          setOodaStep('Decide: 制定决策...');
        }
        break;
      case 'reasoning':
        if (event.content) {
          setCurrentReasoning(event.content);
          setOodaStep('Act: 执行行动...');
        }
        break;
      case 'tool_call':
        setOodaStep('Act: 执行工具调用...');
        if (event.toolCall) {
          setCurrentToolCalls((prev) => [...prev, event.toolCall!]);
        }
        break;
      case 'tool_result':
        if (event.toolCall) {
          setCurrentToolCalls((prev) => {
            const index = prev.findIndex((t) => t.id === event.toolCall!.id);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = event.toolCall!;
              return updated;
            }
            return prev;
          });
        }
        break;
      case 'content':
        // 流式内容事件 - 增量更新消息
        if (event.content !== undefined) {
          setIsStreaming(true);
          setStreamingContent((prev) => prev + event.content);
        }
        break;
      case 'result':
        setOodaStep('完成');
        // 优先使用流式内容，否则使用 event.content
        const finalContent = streamingContent() || event.content || '';
        if (finalContent) {
          const assistantMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: finalContent,
            timestamp: Date.now(),
            toolCalls: currentToolCalls(),
            thinking: currentThinking(),
            intent: currentIntent(),
            reasoning: currentReasoning(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setCurrentToolCalls([]);
          setCurrentThinking('');
          setCurrentIntent('');
          setCurrentReasoning('');
          setStreamingContent('');
          setIsStreaming(false);
          setSseLogs([]);
        }
        break;
      case 'error':
        showToast('error', event.content || '发生错误');
        setOodaStep('错误');
        setStreamingContent('');
        setIsStreaming(false);
        break;
      case 'confirmation':
        if (event.confirmation) {
          setConfirmationRequest(event.confirmation);
        }
        break;
      case 'end':
        // Stream ended, do nothing
        break;
    }
    });
  };

  const handleConfirmation = async (id: string, allowed: boolean) => {
    setConfirmationRequest(null);
    
    // EventClient: 权限确认使用 API 调用
    const result = await apiClient.confirmPermission(sessionId(), id, allowed);
    if (!result.success) {
      showToast('error', result.error || '确认失败');
    }
    
    showToast('info', allowed ? '已允许操作' : '已拒绝操作');
  };

  const callSkill = async (skillName: string) => {
    // 找到技能信息
    const skill = skills().find(s => s.name === skillName);
    
    // 技能应该被直接调用，而不是添加到输入框
    // 使用特殊格式让后端识别为直接调用技能
    setMessage(`使用技能: ${skillName}`);
    setShowSettings(false);
    // 自动发送
    setTimeout(() => sendMessage(), 100);
    showToast('info', `正在调用 ${skillName} 技能...`);
  };

  const clearMessages = () => {
    setMessages([]);
    setCurrentToolCalls([]);
    showToast('info', '消息已清空');
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div class="app-container new-layout">
      <ToastContainer />
      
      <ConfirmationDialog
        request={confirmationRequest()}
        onConfirm={handleConfirmation}
      />

      {/* 紧凑顶部导航栏 */}
      <header class="top-nav">
        <div class="nav-left">
          <button class="nav-icon-btn" onClick={() => {
            loadSessions();
            setShowSessionHistory(true);
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12h18M3 6h18M3 18h18"/>
            </svg>
          </button>
          <div class="logo-compact">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <span>OODA</span>
          </div>
        </div>

        <div class="nav-center">
          <AgentSelector 
            currentAgent={currentAgent()} 
            agents={agents()}
            onSelect={(name) => setCurrentAgent(name)}
          />
        </div>

        <div class="nav-right">
          <div class="model-badge-compact">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
            <span>{modelInfo().name}</span>
          </div>
          <button class="nav-icon-btn" onClick={() => {
            setSettingsSection('chat');
            loadLoggingStatus();
            setShowSettings(true);
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <div class={`status-indicator-compact ${connectionStatus()}`}>
            <div class="status-dot-compact"></div>
          </div>
        </div>
      </header>

      {/* 弹窗组件 */}
      <SessionHistoryPopup
        isOpen={showSessionHistory()}
        onClose={() => setShowSessionHistory(false)}
        currentSessionId={sessionId()}
        sessions={filteredSessions()}
        onSelectSession={switchSession}
        onNewSession={createNewSession}
        onDeleteSession={deleteSession}
        onArchiveSession={archiveSession}
      />

      <SettingsPopup
        isOpen={showSettings()}
        onClose={() => setShowSettings(false)}
        activeSection={settingsSection()}
        onSectionChange={setSettingsSection}
        skills={skills()}
        modelInfo={modelInfo()}
        providers={providers()}
        onSwitchModel={switchModel}
        agents={agents()}
        currentAgent={currentAgent()}
        onSelectAgent={setCurrentAgent}
        onSelectSkill={callSkill}
        mcpServers={mcpServers()}
        onToggleMcp={toggleMcpServer}
        loggingEnabled={loggingEnabled()}
        loggingLevel={loggingLevel()}
        loggingCategories={loggingCategories()}
        fileLoggingEnabled={fileLoggingEnabled()}
        logDir={logDir()}
        logFiles={logFiles()}
        onToggleLogging={handleToggleLogging}
        onSetLoggingLevel={handleSetLoggingLevel}
        onToggleLoggingCategory={handleToggleLoggingCategory}
        onToggleFileLogging={handleToggleFileLogging}
        onClearLogs={handleClearLogs}
      />

      {/* 主内容区 */}
      <main class="main-content new-main">
        {/* 流式内容显示区域 - 包含 OODA 过程内联展示 */}
        <Show when={isStreaming() || isLoading()}>
          <div class="streaming-content">
            {/* OODA 过程实时展示 */}
            <Show when={currentThinking() || currentIntent() || currentReasoning()}>
              <div class="ooda-streaming">
                <Show when={currentThinking()}>
                  <div class="ooda-item thinking">
                    <span class="ooda-icon">💭</span>
                    <span class="ooda-label">思考</span>
                    <span class="ooda-text">{currentThinking()}</span>
                  </div>
                </Show>
                <Show when={currentIntent()}>
                  <div class="ooda-item intent">
                    <span class="ooda-icon">🎯</span>
                    <span class="ooda-label">意图</span>
                    <span class="ooda-text">{currentIntent()}</span>
                  </div>
                </Show>
                <Show when={currentReasoning()}>
                  <div class="ooda-item reasoning">
                    <span class="ooda-icon">💡</span>
                    <span class="ooda-label">推理</span>
                    <span class="ooda-text">{currentReasoning()}</span>
                  </div>
                </Show>
              </div>
            </Show>
            {/* 流式内容 */}
            <Show when={streamingContent()}>
              <div class="streaming-text">
                <Typewriter 
                  text={streamingContent()} 
                  speed={20}
                  class="streaming-typewriter"
                />
              </div>
            </Show>
            {/* 加载状态 */}
            <Show when={!streamingContent() && isLoading()}>
              <div class="streaming-loading">
                <div class="loading-spinner"></div>
                <span>正在思考...</span>
              </div>
            </Show>
            {/* SSE 事件日志 - 可展开 */}
            <Show when={sseLogs().length > 0}>
              <div class="sse-logs">
                <button class="sse-logs-toggle" onClick={() => setShowSseLogs(!showSseLogs())}>
                  <span>SSE 事件 ({sseLogs().length})</span>
                  <span class="toggle-icon">{showSseLogs() ? '▼' : '▶'}</span>
                </button>
                <Show when={showSseLogs()}>
                  <div class="sse-logs-list">
                    <For each={sseLogs()}>
                      {(log) => (
                        <div class={`sse-log-item ${log.type}`}>
                          <span class="log-type">{log.type}</span>
                          <span class="log-content">{log.content || '(无)'}</span>
                          <span class="log-time">{new Date(log.time).toLocaleTimeString()}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        <div class="messages-container" ref={messagesContainer}>
          <Show when={messages().length === 0 && !isLoading()}>
            <div class="empty-state">
              <div class="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h2>开始对话</h2>
              <p>输入消息开始与 OODA Agent 交互</p>
              <div class="quick-actions">
                <button onClick={() => setMessage('帮我分析一下项目结构')}>分析项目</button>
                <button onClick={() => setMessage('帮我写一个函数')}>编写代码</button>
                <button onClick={() => setMessage('解释一下这段代码')}>代码解释</button>
              </div>
            </div>
          </Show>

          <div class="messages-list">
            <For each={messages()}>
              {(msg) => (
                <div class={`message ${msg.role}`}>
                  <div class="message-avatar">
                    <Show when={msg.role === 'user'} fallback={
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                      </svg>
                    }>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    </Show>
                  </div>
                  <div class="message-body">
                    <div class="message-header">
                      <span class="message-author">{msg.role === 'user' ? '你' : 'OODA Agent'}</span>
                      <span class="message-time">{formatTime(msg.timestamp)}</span>
                    </div>
                    <div class="message-content">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  </div>
                </div>
              )}
            </For>
            
            <Show when={isLoading()}>
              <div class="message assistant loading">
                <div class="message-avatar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                </div>
                <div class="message-body">
                  <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>

        <footer class="input-area">
          <div class="input-row">
            {/* 左侧模型选择器 */}
            <div class="input-model-selector">
              <select 
                class="model-select"
                value={`${modelInfo().provider}/${modelInfo().name}`}
                onChange={(e) => {
                  const [provider, model] = e.currentTarget.value.split('/');
                  switchModel(provider, model);
                }}
              >
                <For each={providers()}>
                  {(provider) => (
                    <optgroup label={provider.name}>
                      <For each={provider.models}>
                        {(model) => (
                          <option value={`${provider.name}/${model.name}`}>
                            {model.name}
                          </option>
                        )}
                      </For>
                    </optgroup>
                  )}
                </For>
              </select>
            </div>
            {/* 左侧输入框 */}
            <div class="input-container">
              <textarea
                value={message()}
                onInput={(e) => setMessage(e.currentTarget.value)}
                placeholder="输入你的问题..."
                disabled={isLoading()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                rows={1}
              />
              <button 
                class="send-btn" 
                onClick={sendMessage}
                disabled={isLoading() || !message().trim()}
              >
                <Show when={!isLoading()} fallback={
                  <div class="btn-spinner"></div>
                }>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </Show>
              </button>
            </div>
          </div>
          <p class="input-hint">按 Enter 发送，Shift + Enter 换行</p>
        </footer>
      </main>
    </div>
  );
}

export default App;
