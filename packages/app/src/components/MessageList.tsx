import { Show, For } from 'solid-js';
import type { Message } from '../types';
import { ToolCallList } from './ToolCallDisplay';

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
            {new Date(props.message.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <p style={{ margin: '0', whiteSpace: 'pre-wrap' }}>{props.message.content}</p>
      </div>

      <Show when={!isUser() && (props.message.thinking || props.message.intent || props.message.reasoning)}>
        <div style={{ maxWidth: '80%', marginTop: '8px', width: '100%' }}>
          <button
            onClick={() => setShowDetails(!showDetails())}
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              backgroundColor: '#e3f2fd',
              border: '1px solid #90caf9',
              borderRadius: '4px',
              cursor: 'pointer',
              color: '#1565c0',
            }}
          >
            {showDetails() ? '隐藏 OODA 过程' : '显示 OODA 过程'}
          </button>
          <Show when={showDetails()}>
            <div style={{
              marginTop: '8px',
              padding: '12px',
              backgroundColor: '#fafafa',
              borderRadius: '8px',
              border: '1px solid #e0e0e0',
            }}>
              <Show when={props.message.thinking}>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ color: '#1976d2', fontWeight: 500 }}>🧠 思考 (Orient)</span>
                  </div>
                  <pre style={{
                    margin: '0',
                    padding: '8px',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    fontSize: '11px',
                    whiteSpace: 'pre-wrap',
                    color: '#333',
                  }}>{props.message.thinking}</pre>
                </div>
              </Show>
              <Show when={props.message.intent}>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ color: '#388e3c', fontWeight: 500 }}>🎯 意图 (Observe)</span>
                  </div>
                  <pre style={{
                    margin: '0',
                    padding: '8px',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    fontSize: '11px',
                    whiteSpace: 'pre-wrap',
                    color: '#333',
                  }}>{props.message.intent}</pre>
                </div>
              </Show>
              <Show when={props.message.reasoning}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ color: '#f57c00', fontWeight: 500 }}>💡 推理 (Decide)</span>
                  </div>
                  <pre style={{
                    margin: '0',
                    padding: '8px',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    fontSize: '11px',
                    whiteSpace: 'pre-wrap',
                    color: '#333',
                  }}>{props.message.reasoning}</pre>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

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
