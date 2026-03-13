import { Show, For, createSignal } from 'solid-js';
import type { Message } from '../types';
import { ToolCallList } from './ToolCallDisplay';
import { MarkdownRenderer } from './MarkdownRenderer';

// 格式化时间戳（参考 OpenCode 展示格式）
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  // 如果是今天，显示时间
  if (diffMins < 1) {
    return '刚刚';
  } else if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else if (diffHours < 24 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
}

interface MessageItemProps {
  message: Message;
}

export function MessageItem(props: MessageItemProps) {
  const isUser = () => props.message.role === 'user';
  const [showDetails, setShowDetails] = createSignal(false);

  return (
    <div style={{
      marginBottom: '16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser() ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        maxWidth: '80%',
        padding: '12px 16px',
        borderRadius: '16px',
        backgroundColor: isUser() ? '#2196f3' : '#f5f5f5',
        color: isUser() ? 'white' : '#333',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '4px',
        }}>
          <strong style={{ fontSize: '12px', opacity: 0.8 }}>
            {isUser() ? 'You' : 'Agent'}
          </strong>
          <span style={{ fontSize: '10px', opacity: 0.6 }}>
            {formatTimestamp(props.message.timestamp)}
            <Show when={props.message.isQueued}>
              <span class="queued-badge">QUEUED</span>
            </Show>
            <Show when={props.message.status === 'error'}>
              <span class="error-badge">ERROR</span>
            </Show>
          </span>
        </div>
        <div class="message-content-wrapper">
          <MarkdownRenderer content={props.message.content} />
        </div>
      </div>

      {/* 工具调用内联展示（OpenCode 风格） */}
      <Show when={props.message.toolCalls && props.message.toolCalls.length > 0}>
        <div style={{ maxWidth: '80%', marginTop: '8px', width: '100%' }}>
          <ToolCallList toolCalls={props.message.toolCalls!} />
        </div>
      </Show>
    </div>
  );
}

import { createSignal } from 'solid-js';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export function MessageList(props: MessageListProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '16px',
      minHeight: '100%',
    }}>
      <For each={props.messages}>
        {(message) => <MessageItem message={message} />}
      </For>

      <Show when={props.isLoading}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: '#f5f5f5',
          borderRadius: '16px',
          alignSelf: 'flex-start',
        }}>
          <div style={{
            display: 'flex',
            gap: '4px',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#2196f3',
              animation: 'bounce 1.4s infinite ease-in-out both',
            }} />
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#2196f3',
              animation: 'bounce 1.4s infinite ease-in-out 0.16s both',
            }} />
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#2196f3',
              animation: 'bounce 1.4s infinite ease-in-out 0.32s both',
            }} />
          </div>
          <span style={{ color: '#666', fontSize: '14px' }}>Agent 正在思考...</span>
        </div>
      </Show>
    </div>
  );
}
