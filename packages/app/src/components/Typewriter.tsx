import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import type { JSX } from 'solid-js';

interface TypewriterProps {
  text: string;
  speed?: number; // 每个字符的间隔时间（毫秒），默认30ms
  cursor?: boolean; // 是否显示光标，默认true
  cursorBlinkSpeed?: number; // 光标闪烁速度，默认530ms
  class?: string;
  onComplete?: () => void;
}

export function Typewriter(props: TypewriterProps) {
  const [displayedText, setDisplayedText] = createSignal('');
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [isComplete, setIsComplete] = createSignal(false);
  
  const speed = () => props.speed ?? 30;
  const showCursor = () => props.cursor ?? true;
  const cursorBlinkSpeed = () => props.cursorBlinkSpeed ?? 530;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let cursorIntervalId: ReturnType<typeof setInterval> | null = null;
  const [cursorVisible, setCursorVisible] = createSignal(true);

  // 打字效果
  createEffect(() => {
    const text = props.text;
    
    // 重置状态
    setDisplayedText('');
    setCurrentIndex(0);
    setIsComplete(false);
    
    // 清除之前的定时器
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    if (!text) {
      return;
    }

    // 开始打字
    intervalId = setInterval(() => {
      const idx = currentIndex();
      if (idx < text.length) {
        setDisplayedText(text.substring(0, idx + 1));
        setCurrentIndex(idx + 1);
      } else {
        // 打字完成
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        setIsComplete(true);
        props.onComplete?.();
      }
    }, speed());
  });

  // 光标闪烁效果
  createEffect(() => {
    if (cursorIntervalId) {
      clearInterval(cursorIntervalId);
    }
    
    if (showCursor() && !isComplete()) {
      cursorIntervalId = setInterval(() => {
        setCursorVisible(v => !v);
      }, cursorBlinkSpeed());
    } else {
      setCursorVisible(true); // 完成后保持光标显示
    }
  });

  onCleanup(() => {
    if (intervalId) clearInterval(intervalId);
    if (cursorIntervalId) clearInterval(cursorIntervalId);
  });

  return (
    <span class={props.class}>
      {displayedText()}
      <Show when={showCursor()}>
        <Show when={!isComplete() || cursorVisible()}>
          <span class="typewriter-cursor">▊</span>
        </Show>
      </Show>
    </span>
  );
}

// 智能打字机组件 - 支持HTML内容
interface SmartTypewriterProps {
  text: string;
  speed?: number;
  cursor?: boolean;
  class?: string;
  onComplete?: () => void;
}

export function SmartTypewriter(props: SmartTypewriterProps) {
  const [displayedText, setDisplayedText] = createSignal('');
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [isComplete, setIsComplete] = createSignal(false);
  
  const speed = () => props.speed ?? 20;
  const showCursor = () => props.cursor ?? true;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let cursorIntervalId: ReturnType<typeof setInterval> | null = null;
  const [cursorVisible, setCursorVisible] = createSignal(true);

  // 打字效果 - 智能处理HTML标签
  createEffect(() => {
    const text = props.text;
    
    setDisplayedText('');
    setCurrentIndex(0);
    setIsComplete(false);
    
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    if (!text) {
      return;
    }

    // 检测是否包含HTML标签
    const hasHtml = /<[^>]+>/.test(text);

    if (!hasHtml) {
      // 纯文本打字
      intervalId = setInterval(() => {
        const idx = currentIndex();
        if (idx < text.length) {
          setDisplayedText(text.substring(0, idx + 1));
          setCurrentIndex(idx + 1);
        } else {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          setIsComplete(true);
          props.onComplete?.();
        }
      }, speed());
    } else {
      // HTML内容：一次性显示（因为需要完整渲染HTML）
      setDisplayedText(text);
      setCurrentIndex(text.length);
      setIsComplete(true);
      props.onComplete?.();
    }
  });

  // 光标闪烁
  createEffect(() => {
    if (cursorIntervalId) {
      clearInterval(cursorIntervalId);
    }
    
    if (showCursor() && !isComplete()) {
      cursorIntervalId = setInterval(() => {
        setCursorVisible(v => !v);
      }, 530);
    } else {
      setCursorVisible(true);
    }
  });

  onCleanup(() => {
    if (intervalId) clearInterval(intervalId);
    if (cursorIntervalId) clearInterval(cursorIntervalId);
  });

  return (
    <span class={props.class}>
      <Show when={showCursor() && !isComplete() && cursorVisible()}>
        <span class="typewriter-cursor">▊</span>
      </Show>
    </span>
  );
}

// 消息打字机组件 - 用于聊天消息
interface MessageTypewriterProps {
  content: string;
  thinking?: string;
  intent?: string;
  reasoning?: string;
  speed?: number;
  onComplete?: () => void;
}

export function MessageTypewriter(props: MessageTypewriterProps) {
  const [showThinking, setShowThinking] = createSignal(false);
  const [showIntent, setShowIntent] = createSignal(false);
  const [showReasoning, setShowReasoning] = createSignal(false);
  const [showContent, setShowContent] = createSignal(false);
  
  const speed = () => props.speed ?? 25;

  // 按顺序显示各个部分
  createEffect(() => {
    if (props.thinking) {
      setShowThinking(true);
    }
  });

  return (
    <div class="message-typewriter">
      {/* 思考过程 */}
      <Show when={props.thinking}>
        <div class="mt-thinking">
          <div class="mt-label">
            <span class="mt-icon">💭</span>
            <span>思考</span>
          </div>
          <div class="mt-content">
            <Typewriter 
              text={props.thinking!} 
              speed={speed()} 
              class="mt-text"
              onComplete={() => {
                if (props.intent) setShowIntent(true);
                else if (props.reasoning) setShowReasoning(true);
                else setShowContent(true);
              }}
            />
          </div>
        </div>
      </Show>

      {/* 意图 */}
      <Show when={props.intent && showIntent()}>
        <div class="mt-intent">
          <div class="mt-label">
            <span class="mt-icon">🎯</span>
            <span>意图</span>
          </div>
          <div class="mt-content">
            <Typewriter 
              text={props.intent!} 
              speed={speed()} 
              class="mt-text"
              onComplete={() => {
                if (props.reasoning) setShowReasoning(true);
                else setShowContent(true);
              }}
            />
          </div>
        </div>
      </Show>

      {/* 推理 */}
      <Show when={props.reasoning && showReasoning()}>
        <div class="mt-reasoning">
          <div class="mt-label">
            <span class="mt-icon">💡</span>
            <span>推理</span>
          </div>
          <div class="mt-content">
            <Typewriter 
              text={props.reasoning!} 
              speed={speed()} 
              class="mt-text"
              onComplete={() => setShowContent(true)}
            />
          </div>
        </div>
      </Show>

      {/* 最终回复 */}
      <Show when={props.content && showContent()}>
        <div class="mt-content-final">
          <Typewriter 
            text={props.content} 
            speed={speed()} 
            class="mt-text-final"
            onComplete={props.onComplete}
          />
        </div>
      </Show>
    </div>
  );
}
