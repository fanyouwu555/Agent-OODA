import { createSignal, Show, createMemo } from 'solid-js';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
}

// 常量定义
const COPY_FEEDBACK_DURATION = 2000;

// 语言标签映射
const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  py: 'Python',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  go: 'Go',
  rs: 'Rust',
  rb: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  scala: 'Scala',
  r: 'R',
  matlab: 'MATLAB',
  sql: 'SQL',
  sh: 'Shell',
  bash: 'Bash',
  ps1: 'PowerShell',
  yaml: 'YAML',
  yml: 'YAML',
  json: 'JSON',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  md: 'Markdown',
  dockerfile: 'Dockerfile',
  makefile: 'Makefile',
  vim: 'Vim',
  lua: 'Lua',
  perl: 'Perl',
  dart: 'Dart',
  flutter: 'Flutter',
  solidity: 'Solidity',
};

// TypeScript/JavaScript 关键字
const KEYWORDS = [
  'const', 'let', 'var', 'function', 'class', 'interface', 'type',
  'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while',
  'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'super',
  'extends', 'implements', 'public', 'private', 'protected', 'static',
  'readonly', 'abstract', 'namespace', 'module', 'declare', 'enum',
  'break', 'continue', 'switch', 'case', 'default', 'do', 'in', 'of',
  'typeof', 'instanceof', 'void', 'null', 'undefined', 'true', 'false',
];

export function CodeBlock(props: CodeBlockProps) {
  const [copied, setCopied] = createSignal(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // 语法高亮函数 - 修复了处理顺序问题
  const highlightCode = (code: string, language?: string): string => {
    // 转义 HTML
    let highlighted = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 存储占位符
    const comments: string[] = [];
    const strings: string[] = [];

    // 1. 先提取并替换注释（避免注释内的内容被高亮）
    highlighted = highlighted.replace(/(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, (match) => {
      comments.push(match);
      return `___COMMENT_${comments.length - 1}___`;
    });

    // 2. 提取并替换字符串（避免字符串内的内容被高亮）
    highlighted = highlighted.replace(/(['"`])((?:(?!\1)[^\\]|\\.)*)(\1)/g, (match) => {
      strings.push(match);
      return `___STRING_${strings.length - 1}___`;
    });

    // 3. 关键字高亮（此时字符串和注释已被占位）
    const keywordRegex = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g');
    highlighted = highlighted.replace(keywordRegex, '<span class="code-keyword">$1</span>');

    // 4. 数字高亮
    highlighted = highlighted.replace(
      /\b(\d+(?:\.\d+)?)\b/g,
      '<span class="code-number">$1</span>'
    );

    // 5. 恢复字符串
    highlighted = highlighted.replace(/___STRING_(\d+)___/g, (_, i) =>
      `<span class="code-string">${strings[parseInt(i)]}</span>`
    );

    // 6. 恢复注释
    highlighted = highlighted.replace(/___COMMENT_(\d+)___/g, (_, i) =>
      `<span class="code-comment">${comments[parseInt(i)]}</span>`
    );

    // 7. 函数调用高亮（最后处理，避免与其他冲突）
    highlighted = highlighted.replace(
      /(\w+)(?=\()/g,
      '<span class="code-function">$1</span>'
    );

    return highlighted;
  };

  // 使用 createMemo 缓存高亮结果，优化性能
  const highlightedCode = createMemo(() => highlightCode(props.code, props.language));

  const getLanguageLabel = (lang?: string): string => {
    if (!lang) return 'text';
    const normalized = lang.toLowerCase().trim();
    return LANGUAGE_LABELS[normalized] || normalized;
  };

  // 获取安全的语言类名
  const getSafeLanguageClass = (lang?: string): string => {
    if (!lang) return 'text';
    // 只允许字母、数字、下划线和连字符
    return lang.replace(/[^a-zA-Z0-9_-]/g, '');
  };

  return (
    <div class="code-block-wrapper" role="region" aria-label="代码块">
      <div class="code-block-header">
        <div class="code-block-info">
          <Show when={props.filename}>
            <span class="code-filename" aria-label={`文件名: ${props.filename}`}>{props.filename}</span>
          </Show>
          <span class="code-language" aria-label={`语言: ${getLanguageLabel(props.language)}`}>
            {getLanguageLabel(props.language)}
          </span>
        </div>
        <button
          class="copy-button"
          onClick={copyToClipboard}
          title={copied() ? '已复制!' : '复制代码'}
          aria-label={copied() ? '代码已复制到剪贴板' : '复制代码到剪贴板'}
          aria-live="polite"
        >
          <Show when={!copied()} fallback={<span aria-hidden="true">✓</span>}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </Show>
          <span>{copied() ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre class="code-block" role="region" aria-label="代码内容">
        <code
          class={`language-${getSafeLanguageClass(props.language)}`}
          innerHTML={highlightedCode()}
        />
      </pre>
    </div>
  );
}
