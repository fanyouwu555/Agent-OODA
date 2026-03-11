import { createSignal, createEffect, Show } from 'solid-js';
import type { ConfirmationRequest } from '../types';

interface ConfirmationDialogProps {
  request: ConfirmationRequest | null;
  onConfirm: (id: string, allowed: boolean) => void;
}

export function ConfirmationDialog(props: ConfirmationDialogProps) {
  const [isVisible, setIsVisible] = createSignal(false);

  createEffect(() => {
    setIsVisible(props.request !== null);
  });

  const handleConfirm = () => {
    if (props.request) {
      props.onConfirm(props.request.id, true);
      setIsVisible(false);
    }
  };

  const handleDeny = () => {
    if (props.request) {
      props.onConfirm(props.request.id, false);
      setIsVisible(false);
    }
  };

  return (
    <Show when={isVisible() && props.request}>
      <div class="dialog-overlay">
        <div class="dialog-content">
          <div class="dialog-header">
            <div class="dialog-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <h3>权限请求确认</h3>
          </div>
          
          <div class="dialog-body">
            <div class="dialog-field">
              <label>工具名称</label>
              <code class="dialog-code">{props.request!.toolName}</code>
            </div>

            <div class="dialog-field">
              <label>请求时间</label>
              <span class="dialog-value">{new Date(props.request!.timestamp).toLocaleString()}</span>
            </div>

            <div class="dialog-field">
              <label>参数详情</label>
              <pre class="dialog-pre">{JSON.stringify(props.request!.args, null, 2)}</pre>
            </div>
          </div>

          <div class="dialog-actions">
            <button class="dialog-btn deny" onClick={handleDeny}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              拒绝
            </button>
            <button class="dialog-btn confirm" onClick={handleConfirm}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              允许
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
