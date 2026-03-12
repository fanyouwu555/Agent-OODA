import { For, Show, createSignal } from 'solid-js';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer(props: MarkdownRendererProps) {
  const [expandedImages, setExpandedImages] = createSignal<Set<string>>(new Set());

  // 简单的 Markdown 解析
  const parseMarkdown = (markdown: string): Array<{ type: string; content: any }> => {
    const lines = markdown.split('\n');
    const elements: Array<{ type: string; content: any }> = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 代码块
      if (line.startsWith('```')) {
        const language = line.slice(3).trim();
        let code = '';
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          code += lines[i] + '\n';
          i++;
        }
        elements.push({
          type: 'code',
          content: { language, code: code.trim() },
        });
        i++;
        continue;
      }

      // 标题
      if (line.startsWith('# ')) {
        elements.push({ type: 'h1', content: line.slice(2) });
      } else if (line.startsWith('## ')) {
        elements.push({ type: 'h2', content: line.slice(3) });
      } else if (line.startsWith('### ')) {
        elements.push({ type: 'h3', content: line.slice(4) });
      } else if (line.startsWith('#### ')) {
        elements.push({ type: 'h4', content: line.slice(5) });
      }
      // 列表
      else if (line.match(/^\s*[-*+]\s/)) {
        const items: string[] = [];
        while (i < lines.length && lines[i].match(/^\s*[-*+]\s/)) {
          items.push(lines[i].replace(/^\s*[-*+]\s/, ''));
          i++;
        }
        elements.push({ type: 'ul', content: items });
        continue;
      }
      // 有序列表
      else if (line.match(/^\s*\d+\.\s/)) {
        const items: string[] = [];
        while (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) {
          items.push(lines[i].replace(/^\s*\d+\.\s/, ''));
          i++;
        }
        elements.push({ type: 'ol', content: items });
        continue;
      }
      // 引用
      else if (line.startsWith('> ')) {
        elements.push({ type: 'blockquote', content: line.slice(2) });
      }
      // 分隔线
      else if (line.match(/^\s*[-=]{3,}\s*$/)) {
        elements.push({ type: 'hr', content: '' });
      }
      // 表格
      else if (line.includes('|')) {
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes('|')) {
          const cells = lines[i]
            .split('|')
            .map(c => c.trim())
            .filter(c => c);
          if (cells.length > 0 && !cells[0].match(/^[-:]+$/)) {
            rows.push(cells);
          }
          i++;
        }
        if (rows.length > 0) {
          elements.push({ type: 'table', content: rows });
        }
        continue;
      }
      // 图片
      else if (line.match(/!\[.*?\]\(.*?\)/)) {
        const match = line.match(/!\[(.*?)\]\((.*?)\)/);
        if (match) {
          elements.push({
            type: 'image',
            content: { alt: match[1], src: match[2] },
          });
        }
      }
      // 链接
      else if (line.match(/\[.*?\]\(.*?\)/)) {
        const parts: Array<{ type: string; content: string }> = [];
        let remaining = line;
        let match;
        const linkRegex = /\[(.*?)\]\((.*?)\)/g;
        
        while ((match = linkRegex.exec(line)) !== null) {
          const before = remaining.slice(0, match.index);
          if (before) {
            parts.push({ type: 'text', content: before });
          }
          parts.push({ type: 'link', content: match[0], url: match[2], text: match[1] });
          remaining = remaining.slice(match.index + match[0].length);
        }
        if (remaining) {
          parts.push({ type: 'text', content: remaining });
        }
        elements.push({ type: 'paragraph', content: parts });
      }
      // 普通段落
      else if (line.trim()) {
        elements.push({ type: 'paragraph', content: parseInline(line) });
      }

      i++;
    }

    return elements;
  };

  // 行内元素解析
  const parseInline = (text: string): Array<{ type: string; content: string }> => {
    const parts: Array<{ type: string; content: string }> = [];
    
    // 粗体 **text**
    text = text.replace(/\*\*(.*?)\*\*/g, '___BOLD___$1___BOLD___');
    // 斜体 *text*
    text = text.replace(/\*(.*?)\*/g, '___ITALIC___$1___ITALIC___');
    // 行内代码 `code`
    text = text.replace(/`([^`]+)`/g, '___CODE___$1___CODE___');
    // 删除线 ~~text~~
    text = text.replace(/~~(.*?)~~/g, '___STRIKE___$1___STRIKE___');

    const tokens = text.split(/(___BOLD___|___ITALIC___|___CODE___|___STRIKE___)/);
    let currentStyle: string | null = null;

    for (const token of tokens) {
      if (token === '___BOLD___') {
        currentStyle = currentStyle === 'bold' ? null : 'bold';
      } else if (token === '___ITALIC___') {
        currentStyle = currentStyle === 'italic' ? null : 'italic';
      } else if (token === '___CODE___') {
        currentStyle = currentStyle === 'code' ? null : 'code';
      } else if (token === '___STRIKE___') {
        currentStyle = currentStyle === 'strike' ? null : 'strike';
      } else if (token) {
        parts.push({ type: currentStyle || 'text', content: token });
      }
    }

    return parts;
  };

  const toggleImageExpand = (src: string) => {
    setExpandedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(src)) {
        newSet.delete(src);
      } else {
        newSet.add(src);
      }
      return newSet;
    });
  };

  const elements = () => parseMarkdown(props.content);

  return (
    <div class="markdown-renderer">
      <For each={elements()}>
        {(element) => {
          switch (element.type) {
            case 'h1':
              return <h1>{element.content}</h1>;
            case 'h2':
              return <h2>{element.content}</h2>;
            case 'h3':
              return <h3>{element.content}</h3>;
            case 'h4':
              return <h4>{element.content}</h4>;
            case 'paragraph':
              return (
                <p>
                  <For each={element.content}>
                    {(part) => {
                      switch (part.type) {
                        case 'bold':
                          return <strong>{part.content}</strong>;
                        case 'italic':
                          return <em>{part.content}</em>;
                        case 'code':
                          return <code class="inline-code">{part.content}</code>;
                        case 'strike':
                          return <del>{part.content}</del>;
                        default:
                          return <span>{part.content}</span>;
                      }
                    }}
                  </For>
                </p>
              );
            case 'ul':
              return (
                <ul>
                  <For each={element.content}>
                    {(item) => <li>{item}</li>}
                  </For>
                </ul>
              );
            case 'ol':
              return (
                <ol>
                  <For each={element.content}>
                    {(item) => <li>{item}</li>}
                  </For>
                </ol>
              );
            case 'blockquote':
              return <blockquote>{element.content}</blockquote>;
            case 'hr':
              return <hr />;
            case 'code':
              return (
                <CodeBlock
                  code={element.content.code}
                  language={element.content.language}
                />
              );
            case 'table':
              return (
                <table class="markdown-table">
                  <thead>
                    <tr>
                      <For each={element.content[0]}>
                        {(cell) => <th>{cell}</th>}
                      </For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={element.content.slice(1)}>
                      {(row) => (
                        <tr>
                          <For each={row}>
                            {(cell) => <td>{cell}</td>}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              );
            case 'image':
              return (
                <div class="markdown-image-wrapper">
                  <img
                    src={element.content.src}
                    alt={element.content.alt}
                    class={expandedImages().has(element.content.src) ? 'expanded' : ''}
                    onClick={() => toggleImageExpand(element.content.src)}
                    loading="lazy"
                  />
                  <Show when={element.content.alt}>
                    <span class="image-caption">{element.content.alt}</span>
                  </Show>
                </div>
              );
            default:
              return null;
          }
        }}
      </For>
    </div>
  );
}
