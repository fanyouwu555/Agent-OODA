import { createSignal, createEffect, onMount, Show, For, onCleanup } from 'solid-js';
import type { Message, Skill, ConfirmationRequest, ToolCall, SSEEvent, ModelInfo, Provider } from './types';
import { apiClient } from './services/api';
import { createWebSocketClient } from './services/websocket';
import { ConfirmationDialog } from './components/ConfirmationDialog';
import { ToastContainer, showToast } from './components/Toast';
import { SessionList } from './components/SessionList';
import { AgentConfigPanel } from './components/AgentConfigPanel';
import { ToolRegistryPanel } from './components/ToolRegistryPanel';
import { PermissionPanel } from './components/PermissionPanel';

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

function App() {
  const [sessionId, setSessionId] = createSignal('');
  const [message, setMessage] = createSignal('');
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [skills, setSkills] = createSignal<Skill[]>([]);
  const [confirmationRequest, setConfirmationRequest] = createSignal<ConfirmationRequest | null>(null);
  const [currentToolCalls, setCurrentToolCalls] = createSignal<ToolCall[]>([]);
  const [connectionStatus, setConnectionStatus] = createSignal<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [modelInfo, setModelInfo] = createSignal<ModelInfo>({ name: 'moonshot-v1-8k', provider: 'Kimi', temperature: 0.7, maxTokens: 4000 });
  const [providers, setProviders] = createSignal<Provider[]>([]);
  const [currentThinking, setCurrentThinking] = createSignal<string>('');
  const [currentIntent, setCurrentIntent] = createSignal<string>('');
  const [currentReasoning, setCurrentReasoning] = createSignal<string>('');
  const [oodaStep, setOodaStep] = createSignal<string>('');
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [activeTab, setActiveTab] = createSignal<'sessions' | 'models' | 'skills' | 'agents' | 'tools' | 'permissions' | 'settings'>('sessions');

  let messagesContainer: HTMLDivElement | undefined;
  let wsClient: ReturnType<typeof createWebSocketClient>;

  onMount(() => {
    wsClient = createWebSocketClient({
      url: '/ws',
      reconnect: true,
      heartbeatInterval: 25000,
      onOpen: () => {
        setConnectionStatus('connected');
      },
      onClose: () => {
        setConnectionStatus('disconnected');
      },
      onMessage: (msg) => {
        handleWebSocketMessage(msg);
      },
      onError: () => {
        console.error('[WebSocket] Connection error');
      },
    });
    wsClient.connect();
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
      showToast('error', result.error || '创建会话失败');
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
    
    if (wsClient?.isConnected()) {
      wsClient.send({ type: 'subscribe', payload: newSessionId });
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
    const result = await apiClient.getModels();
    if (result.success && result.data) {
      setProviders(result.data.providers);
      setModelInfo(result.data.activeModel);
    }
  };

  onMount(() => {
    loadSkills();
    loadModels();
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
      case 'result':
        setOodaStep('完成');
        if (event.content) {
          const assistantMessage: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: event.content,
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
        }
        break;
      case 'error':
        showToast('error', event.content || '发生错误');
        setOodaStep('错误');
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
  };

  const handleConfirmation = async (id: string, allowed: boolean) => {
    setConfirmationRequest(null);
    
    if (wsClient?.isConnected()) {
      wsClient.confirmPermission(id, allowed);
    } else {
      const result = await apiClient.confirmPermission(sessionId(), id, allowed);
      if (!result.success) {
        showToast('error', result.error || '确认失败');
      }
    }
    
    showToast('info', allowed ? '已允许操作' : '已拒绝操作');
  };

  const callSkill = async (skillName: string) => {
    const skillMessage = `请使用 ${skillName} 技能`;
    setMessage(skillMessage);
    setTimeout(() => sendMessage(), 100);
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
    <div class="app-container">
      <ToastContainer />
      
      <ConfirmationDialog
        request={confirmationRequest()}
        onConfirm={handleConfirmation}
      />

      <aside class={`sidebar ${sidebarOpen() ? 'open' : 'closed'}`}>
        <div class="sidebar-header">
          <div class="logo">
            <div class="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            </div>
            <Show when={sidebarOpen()}>
              <span class="logo-text">OODA Agent</span>
            </Show>
          </div>
          <button class="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen())}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d={sidebarOpen() ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"}/>
            </svg>
          </button>
        </div>

        <Show when={sidebarOpen()}>
          <div class="sidebar-tabs">
            <button 
              class={`tab ${activeTab() === 'sessions' ? 'active' : ''}`}
              onClick={() => setActiveTab('sessions')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              会话
            </button>
            <button 
              class={`tab ${activeTab() === 'models' ? 'active' : ''}`}
              onClick={() => setActiveTab('models')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <path d="M8 21h8M12 17v4"/>
              </svg>
              模型
            </button>
            <button 
              class={`tab ${activeTab() === 'skills' ? 'active' : ''}`}
              onClick={() => setActiveTab('skills')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
              </svg>
              技能
            </button>
            <button 
              class={`tab ${activeTab() === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
              设置
            </button>
          </div>
        </Show>

        <div class="sidebar-content">
          <Show when={sidebarOpen() && activeTab() === 'sessions'}>
            <SessionList
              currentSessionId={sessionId()}
              onSelectSession={switchSession}
              onNewSession={createNewSession}
              onClearAll={async () => {
                clearSessionIdFromStorage();
                await createNewSession();
              }}
            />
          </Show>
          <Show when={sidebarOpen() && activeTab() === 'models'}>
            <div class="models-section">
              <div class="section-title">
                <span>可用模型</span>
                <div class="connection-status">
                  <div class={`status-dot ${connectionStatus()}`}></div>
                  <span>{connectionStatus() === 'connected' ? '已连接' : connectionStatus() === 'connecting' ? '连接中' : '已断开'}</span>
                </div>
              </div>
              
              <For each={providers()}>
                {(provider) => (
                  <div class="provider-group">
                    <div class="provider-header">
                      <span class="provider-name">{provider.name}</span>
                      <span class="provider-type">{provider.type}</span>
                    </div>
                    <div class="model-list">
                      <For each={provider.models}>
                        {(model) => {
                          const isActive = () => modelInfo().provider === provider.name && modelInfo().name === model.name;
                          return (
                            <div 
                              class={`model-card ${isActive() ? 'active' : ''}`}
                              onClick={() => switchModel(provider.name, model.name)}
                            >
                              <div class="model-info">
                                <span class="model-name">{model.name}</span>
                                <Show when={isActive()}>
                                  <span class="active-badge">当前</span>
                                </Show>
                              </div>
                              <div class="model-params">
                                <span>温度: {model.temperature || 0.7}</span>
                                <span>Tokens: {model.maxTokens || 2000}</span>
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={sidebarOpen() && activeTab() === 'skills'}>
            <div class="skills-section">
              <div class="section-title">
                <span>可用技能</span>
                <span class="skill-count">{skills().length}</span>
              </div>
              <div class="skill-list">
                <For each={skills()}>
                  {(skill) => (
                    <div class="skill-card" onClick={() => callSkill(skill.name)}>
                      <div class="skill-header">
                        <span class="skill-name">{skill.name}</span>
                        <span class="skill-version">v{skill.version}</span>
                      </div>
                      <p class="skill-desc">{skill.description}</p>
                      <span class="skill-category">{skill.category}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={sidebarOpen() && activeTab() === 'agents'}>
            <AgentConfigPanel />
          </Show>

          <Show when={sidebarOpen() && activeTab() === 'tools'}>
            <ToolRegistryPanel />
          </Show>

          <Show when={sidebarOpen() && activeTab() === 'permissions'}>
            <PermissionPanel />
          </Show>

          <Show when={sidebarOpen() && activeTab() === 'settings'}>
            <div class="settings-section">
              <div class="section-title">设置</div>
              <div class="settings-group">
                <div class="setting-item">
                  <span>当前模型</span>
                  <span class="setting-value">{modelInfo().name}</span>
                </div>
                <div class="setting-item">
                  <span>提供商</span>
                  <span class="setting-value">{modelInfo().provider}</span>
                </div>
                <div class="setting-item">
                  <span>温度</span>
                  <span class="setting-value">{modelInfo().temperature}</span>
                </div>
                <div class="setting-item">
                  <span>最大Tokens</span>
                  <span class="setting-value">{modelInfo().maxTokens}</span>
                </div>
              </div>
              <button class="clear-btn" onClick={clearMessages}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3,6 5,6 21,6"/>
                  <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
                </svg>
                清空对话
              </button>
            </div>
          </Show>
        </div>
      </aside>

      <main class="main-content">
        <header class="main-header">
          <div class="header-left">
            <Show when={!sidebarOpen()}>
              <button class="menu-btn" onClick={() => setSidebarOpen(true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="3" y1="12" x2="21" y2="12"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
            </Show>
            <div class="current-model">
              <div class="model-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/>
                  <path d="M8 21h8M12 17v4"/>
                </svg>
                <span>{modelInfo().name}</span>
              </div>
              <span class="provider-label">{modelInfo().provider}</span>
            </div>
          </div>
          <div class="header-right">
            <div class={`status-indicator ${connectionStatus()}`}>
              <div class="pulse"></div>
              <span>{connectionStatus() === 'connected' ? '在线' : connectionStatus() === 'connecting' ? '连接中' : '离线'}</span>
            </div>
          </div>
        </header>

        <Show when={isLoading() && oodaStep()}>
          <div class="ooda-progress">
            <div class="progress-header">
              <div class="progress-spinner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="0">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                  </circle>
                </svg>
              </div>
              <span class="progress-step">{oodaStep()}</span>
            </div>
            <div class="progress-details">
              <Show when={currentThinking()}>
                <div class="detail-item thinking">
                  <div class="detail-icon">💭</div>
                  <div class="detail-content">
                    <span class="detail-label">思考</span>
                    <p class="detail-text">{currentThinking()}</p>
                  </div>
                </div>
              </Show>
              <Show when={currentIntent()}>
                <div class="detail-item intent">
                  <div class="detail-icon">🎯</div>
                  <div class="detail-content">
                    <span class="detail-label">意图</span>
                    <p class="detail-text">{currentIntent()}</p>
                  </div>
                </div>
              </Show>
              <Show when={currentReasoning()}>
                <div class="detail-item reasoning">
                  <div class="detail-icon">💡</div>
                  <div class="detail-content">
                    <span class="detail-label">推理</span>
                    <p class="detail-text">{currentReasoning()}</p>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={currentToolCalls().length > 0}>
          <div class="tool-calls-panel">
            <div class="panel-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              <span>工具调用</span>
            </div>
            <div class="tool-calls-list">
              <For each={currentToolCalls()}>
                {(tool) => (
                  <div class={`tool-item ${tool.status}`}>
                    <div class="tool-header">
                      <div class="tool-status-icon">
                        <Show when={tool.status === 'running'} fallback={
                          <Show when={tool.status === 'success'} fallback={
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <circle cx="12" cy="12" r="10"/>
                              <line x1="15" y1="9" x2="9" y2="15"/>
                              <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                          }>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                              <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                          </Show>
                        }>
                          <div class="spinner-small"></div>
                        </Show>
                      </div>
                      <span class="tool-name">{tool.name}</span>
                      <Show when={tool.endTime}>
                        <span class="tool-time">{((tool.endTime! - tool.startTime) / 1000).toFixed(2)}s</span>
                      </Show>
                    </div>
                    <Show when={Object.keys(tool.args).length > 0}>
                      <div class="tool-args">
                        <span class="args-label">参数:</span>
                        <pre class="args-content">{JSON.stringify(tool.args, null, 2)}</pre>
                      </div>
                    </Show>
                    <Show when={tool.result !== undefined && tool.status === 'success'}>
                      <div class="tool-result-preview">
                        <span class="result-label">结果:</span>
                        <pre class="result-content">{typeof tool.result === 'string' ? tool.result.substring(0, 200) + (tool.result.length > 200 ? '...' : '') : JSON.stringify(tool.result, null, 2).substring(0, 200)}</pre>
                      </div>
                    </Show>
                    <Show when={tool.error}>
                      <div class="tool-error">
                        <span class="error-label">错误:</span>
                        <span class="error-text">{tool.error}</span>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
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
                      <p>{msg.content}</p>
                    </div>
                    <Show when={msg.role === 'assistant' && (msg.thinking || msg.intent || msg.reasoning)}>
                      <div class="message-ooda-section">
                        <div class="ooda-section-header">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                          </svg>
                          <span>OODA 决策过程</span>
                        </div>
                        <div class="ooda-steps">
                          <Show when={msg.thinking}>
                            <div class="ooda-step thinking">
                              <div class="step-icon">💭</div>
                              <div class="step-content">
                                <span class="step-label">思考 (Observe)</span>
                                <p class="step-text">{msg.thinking}</p>
                              </div>
                            </div>
                          </Show>
                          <Show when={msg.intent}>
                            <div class="ooda-step intent">
                              <div class="step-icon">🎯</div>
                              <div class="step-content">
                                <span class="step-label">意图 (Orient)</span>
                                <p class="step-text">{msg.intent}</p>
                              </div>
                            </div>
                          </Show>
                          <Show when={msg.reasoning}>
                            <div class="ooda-step reasoning">
                              <div class="step-icon">💡</div>
                              <div class="step-content">
                                <span class="step-label">推理 (Decide)</span>
                                <p class="step-text">{msg.reasoning}</p>
                              </div>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </Show>
                    <Show when={msg.toolCalls && msg.toolCalls.length > 0}>
                      <div class="message-tools-section">
                        <div class="tools-section-header">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                          </svg>
                          <span>工具调用 ({msg.toolCalls!.length})</span>
                        </div>
                        <div class="tools-list">
                          <For each={msg.toolCalls}>
                            {(tool) => (
                              <div class={`message-tool-item ${tool.status}`}>
                                <div class="tool-item-header">
                                  <Show when={tool.status === 'success'} fallback={
                                    <Show when={tool.status === 'error'} fallback={
                                      <div class="tool-status pending"></div>
                                    }>
                                      <div class="tool-status error"></div>
                                    </Show>
                                  }>
                                    <div class="tool-status success"></div>
                                  </Show>
                                  <span class="tool-item-name">{tool.name}</span>
                                  <Show when={tool.endTime}>
                                    <span class="tool-item-time">{((tool.endTime! - tool.startTime) / 1000).toFixed(2)}s</span>
                                  </Show>
                                </div>
                                <Show when={Object.keys(tool.args).length > 0}>
                                  <div class="tool-item-args">
                                    <span class="args-label">参数:</span>
                                    <pre>{JSON.stringify(tool.args, null, 2)}</pre>
                                  </div>
                                </Show>
                                <Show when={tool.result !== undefined}>
                                  <div class="tool-item-result">
                                    <span class="result-label">结果:</span>
                                    <pre class="result-content">{typeof tool.result === 'string' ? tool.result.substring(0, 500) + (tool.result.length > 500 ? '...' : '') : JSON.stringify(tool.result, null, 2).substring(0, 500)}</pre>
                                  </div>
                                </Show>
                                <Show when={tool.error}>
                                  <div class="tool-item-error">{tool.error}</div>
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
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
          <p class="input-hint">按 Enter 发送，Shift + Enter 换行</p>
        </footer>
      </main>
    </div>
  );
}

export default App;
