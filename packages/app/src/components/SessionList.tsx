import { createSignal, For, Show, onMount } from 'solid-js';
import type { SessionListItem } from '../types';
import { apiClient } from '../services/api';

interface SessionListProps {
  currentSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onClearAll?: () => void;
}

type ClearAction = 'all' | 'archived' | 'old';

interface ClearDialogState {
  show: boolean;
  action: ClearAction;
  title: string;
  message: string;
  confirmText: string;
}

export function SessionList(props: SessionListProps) {
  const [sessions, setSessions] = createSignal<SessionListItem[]>([]);
  const [archivedSessions, setArchivedSessions] = createSignal<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [showArchived, setShowArchived] = createSignal(false);
  const [clearDialog, setClearDialog] = createSignal<ClearDialogState>({ show: false, action: 'all', title: '', message: '', confirmText: '' });
  const [clearing, setClearing] = createSignal(false);
  const [clearResult, setClearResult] = createSignal<{ sessions: number; messages: number; toolCalls: number } | null>(null);
  const [showResult, setShowResult] = createSignal(false);
  let loaded = false;

  const loadSessions = async (force = false) => {
    if (isLoading() || (loaded && !force)) return;
    setIsLoading(true);
    if (force) loaded = false;
    loaded = true;
    try {
      const [activeResult, archivedResult] = await Promise.all([
        apiClient.getSessions('active'),
        apiClient.getSessions('archived'),
      ]);
      
      if (activeResult.success && activeResult.data) {
        setSessions(activeResult.data);
      }
      if (archivedResult.success && archivedResult.data) {
        setArchivedSessions(archivedResult.data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const searchSessions = async (query: string) => {
    if (!query.trim()) {
      loadSessions(true);
      return;
    }
    if (isLoading()) return;
    setIsLoading(true);
    try {
      const result = await apiClient.searchSessions(query);
      if (result.success && result.data) {
        setSessions(result.data.filter(s => s.status === 'active'));
        setArchivedSessions(result.data.filter(s => s.status === 'archived'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    loadSessions();
  });

  const handleArchive = async (sessionId: string, e: Event) => {
    e.stopPropagation();
    const result = await apiClient.archiveSession(sessionId);
    if (result.success) {
      loadSessions(true);
    }
  };

  const handleRestore = async (sessionId: string, e: Event) => {
    e.stopPropagation();
    const result = await apiClient.restoreSession(sessionId);
    if (result.success) {
      loadSessions(true);
    }
  };

  const handleDelete = async (sessionId: string, e: Event) => {
    e.stopPropagation();
    if (confirm('确定要删除这个会话吗？此操作不可恢复。')) {
      const result = await apiClient.deleteSession(sessionId);
      if (result.success) {
        loadSessions(true);
      }
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
  };

  const getSessionTitle = (session: SessionListItem) => {
    if (session.title) return session.title;
    if (session.firstMessageContent) {
      return session.firstMessageContent.slice(0, 30) + (session.firstMessageContent.length > 30 ? '...' : '');
    }
    if (session.lastMessage?.content) {
      return session.lastMessage.content.slice(0, 30) + (session.lastMessage.content.length > 30 ? '...' : '');
    }
    return '新对话';
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (value) {
      searchSessions(value);
    } else {
      loadSessions();
    }
  };

  const openClearDialog = (action: ClearAction) => {
    const dialogConfig: Record<ClearAction, Omit<ClearDialogState, 'show' | 'action'>> = {
      all: {
        title: '清理所有对话',
        message: '确定要清理所有对话吗？这将删除所有会话记录、消息和工具调用记录。此操作不可恢复！',
        confirmText: '清理全部',
      },
      archived: {
        title: '清理已归档对话',
        message: `确定要清理所有已归档的对话吗？当前有 ${archivedSessions().length} 个已归档会话。此操作不可恢复！`,
        confirmText: '清理已归档',
      },
      old: {
        title: '清理旧对话',
        message: '确定要清理 30 天前的对话吗？此操作不可恢复！',
        confirmText: '清理旧对话',
      },
    };

    setClearDialog({ show: true, action, ...dialogConfig[action] });
  };

  const closeClearDialog = () => {
    setClearDialog({ show: false, action: 'all', title: '', message: '', confirmText: '' });
    setClearResult(null);
    setShowResult(false);
  };

  const executeClear = async () => {
    setClearing(true);
    try {
      let result;
      const action = clearDialog().action;

      if (action === 'all') {
        result = await apiClient.clearAllSessions();
      } else if (action === 'archived') {
        result = await apiClient.clearArchivedSessions();
      } else {
        result = await apiClient.clearOldSessions(30);
      }

      if (result.success && result.data) {
        setClearResult(result.data.deleted);
        setShowResult(true);
        loadSessions(true);
        if (props.onClearAll && action === 'all') {
          props.onClearAll();
        }
      }
    } finally {
      setClearing(false);
    }
  };

  return (
    <div class="session-list-container">
      <div class="session-list-header">
        <button class="new-session-btn" onClick={props.onNewSession}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新对话
        </button>
        <div class="clear-menu">
          <button class="clear-btn" title="清理对话">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <div class="clear-dropdown">
            <button onClick={() => openClearDialog('archived')} disabled={archivedSessions().length === 0}>
              清理已归档 ({archivedSessions().length})
            </button>
            <button onClick={() => openClearDialog('old')}>
              清理30天前的对话
            </button>
            <button class="danger" onClick={() => openClearDialog('all')}>
              清理所有对话
            </button>
          </div>
        </div>
      </div>

      <div class="session-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="搜索会话..."
          value={searchQuery()}
          onInput={(e) => handleSearch(e.currentTarget.value)}
        />
      </div>

      <div class="session-tabs">
        <button
          class={`tab ${!showArchived() ? 'active' : ''}`}
          onClick={() => setShowArchived(false)}
        >
          当前 ({sessions().length})
        </button>
        <button
          class={`tab ${showArchived() ? 'active' : ''}`}
          onClick={() => setShowArchived(true)}
        >
          已归档 ({archivedSessions().length})
        </button>
      </div>

      <div class="session-list">
        <Show when={isLoading()}>
          <div class="loading-indicator">
            <div class="spinner"></div>
          </div>
        </Show>

        <Show when={!isLoading() && (showArchived() ? archivedSessions() : sessions()).length === 0}>
          <div class="empty-sessions">
            <p>{showArchived() ? '没有已归档的会话' : '没有会话记录'}</p>
          </div>
        </Show>

        <For each={showArchived() ? archivedSessions() : sessions()}>
          {(session) => (
            <div
              class={`session-item ${session.id === props.currentSessionId ? 'active' : ''} ${session.status === 'archived' ? 'archived' : ''}`}
              onClick={() => props.onSelectSession(session.id)}
            >
              <div class="session-info">
                <div class="session-title">{getSessionTitle(session)}</div>
                <div class="session-meta">
                  <span class="session-date">{formatDate(session.createdAt)}</span>
                  <Show when={session.messageCount > 0}>
                    <span class="session-count">{session.messageCount} 条消息</span>
                  </Show>
                </div>
              </div>
              <div class="session-actions">
                <Show when={session.status !== 'archived'}>
                  <button
                    class="action-btn archive"
                    onClick={(e) => handleArchive(session.id, e)}
                    title="归档"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="21 8 21 21 3 21 3 8"/>
                      <rect x="1" y="3" width="22" height="5"/>
                      <line x1="10" y1="12" x2="14" y2="12"/>
                    </svg>
                  </button>
                </Show>
                <Show when={session.status === 'archived'}>
                  <button
                    class="action-btn restore"
                    onClick={(e) => handleRestore(session.id, e)}
                    title="恢复"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                  </button>
                </Show>
                <button
                  class="action-btn delete"
                  onClick={(e) => handleDelete(session.id, e)}
                  title="删除"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={clearDialog().show}>
        <div class="clear-dialog-overlay" onClick={closeClearDialog}>
          <div class="clear-dialog" onClick={(e) => e.stopPropagation()}>
            <Show when={!showResult()}>
              <div class="clear-dialog-header">
                <div class="clear-dialog-icon warning">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <h3>{clearDialog().title}</h3>
              </div>
              <div class="clear-dialog-body">
                <p>{clearDialog().message}</p>
              </div>
              <div class="clear-dialog-actions">
                <button class="clear-dialog-btn cancel" onClick={closeClearDialog} disabled={clearing()}>
                  取消
                </button>
                <button class="clear-dialog-btn confirm" onClick={executeClear} disabled={clearing()}>
                  {clearing() ? '清理中...' : clearDialog().confirmText}
                </button>
              </div>
            </Show>
            <Show when={showResult() && clearResult()}>
              <div class="clear-dialog-header">
                <div class="clear-dialog-icon success">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <h3>清理完成</h3>
              </div>
              <div class="clear-dialog-body">
                <div class="clear-result">
                  <div class="clear-result-item">
                    <span class="label">已删除会话:</span>
                    <span class="value">{clearResult()!.sessions}</span>
                  </div>
                  <div class="clear-result-item">
                    <span class="label">已删除消息:</span>
                    <span class="value">{clearResult()!.messages}</span>
                  </div>
                  <div class="clear-result-item">
                    <span class="label">已删除工具调用:</span>
                    <span class="value">{clearResult()!.toolCalls}</span>
                  </div>
                </div>
              </div>
              <div class="clear-dialog-actions">
                <button class="clear-dialog-btn confirm" onClick={closeClearDialog}>
                  确定
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
