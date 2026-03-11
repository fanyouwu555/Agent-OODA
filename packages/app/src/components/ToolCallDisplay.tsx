import { For, Show } from 'solid-js';
import type { ToolCall } from '../types';

interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

export function ToolCallDisplay(props: ToolCallDisplayProps) {
  const getStatusColor = () => {
    switch (props.toolCall.status) {
      case 'pending': return '#9e9e9e';
      case 'running': return '#2196f3';
      case 'success': return '#4caf50';
      case 'error': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getStatusIcon = () => {
    switch (props.toolCall.status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'success': return '✅';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  const getDuration = () => {
    if (!props.toolCall.endTime) return null;
    const ms = props.toolCall.endTime - props.toolCall.startTime;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
      backgroundColor: '#fafafa',
      borderLeft: `4px solid ${getStatusColor()}`,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{getStatusIcon()}</span>
          <strong style={{ color: '#333' }}>{props.toolCall.name}</strong>
        </div>
        <Show when={getDuration()}>
          <span style={{ fontSize: '12px', color: '#666' }}>{getDuration()}</span>
        </Show>
      </div>
      
      <Show when={Object.keys(props.toolCall.args).length > 0}>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: '#666' }}>参数:</span>
          <pre style={{
            margin: '4px 0',
            padding: '8px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            fontSize: '11px',
            overflow: 'auto',
            maxHeight: '100px',
          }}>
            {JSON.stringify(props.toolCall.args, null, 2)}
          </pre>
        </div>
      </Show>

      <Show when={props.toolCall.status === 'running'}>
        <div style={{
          height: '3px',
          backgroundColor: '#e0e0e0',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: '30%',
            backgroundColor: '#2196f3',
            animation: 'pulse 1.5s infinite',
          }} />
        </div>
      </Show>

      <Show when={props.toolCall.result !== undefined}>
        <div>
          <span style={{ fontSize: '12px', color: '#666' }}>结果:</span>
          <pre style={{
            margin: '4px 0',
            padding: '8px',
            backgroundColor: '#e8f5e9',
            borderRadius: '4px',
            fontSize: '11px',
            overflow: 'auto',
            maxHeight: '150px',
          }}>
            {typeof props.toolCall.result === 'string' 
              ? props.toolCall.result 
              : JSON.stringify(props.toolCall.result, null, 2)}
          </pre>
        </div>
      </Show>

      <Show when={props.toolCall.error}>
        <div>
          <span style={{ fontSize: '12px', color: '#f44336' }}>错误:</span>
          <pre style={{
            margin: '4px 0',
            padding: '8px',
            backgroundColor: '#ffebee',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#c62828',
          }}>
            {props.toolCall.error}
          </pre>
        </div>
      </Show>
    </div>
  );
}

interface ToolCallListProps {
  toolCalls: ToolCall[];
}

export function ToolCallList(props: ToolCallListProps) {
  return (
    <div>
      <For each={props.toolCalls}>
        {(toolCall) => <ToolCallDisplay toolCall={toolCall} />}
      </For>
    </div>
  );
}
