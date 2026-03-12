import { createSignal, createEffect, onMount } from 'solid-js';

const THEME_STORAGE_KEY = 'ooda-agent-theme';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = createSignal<Theme>('dark');

  onMount(() => {
    // 从 localStorage 读取主题设置
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      // 检测系统主题偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialTheme = prefersDark ? 'dark' : 'light';
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  });

  createEffect(() => {
    const currentTheme = theme();
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  });

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      class="theme-toggle"
      onClick={toggleTheme}
      title={theme() === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      aria-label={theme() === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
    >
      {theme() === 'dark' ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

export function getCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
}

export function setTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
