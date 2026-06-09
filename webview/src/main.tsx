import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

let root: ReactDOM.Root | null = null;

declare global {
  interface Window {
    MDEdBridge: {
      initDocument: (payload: { markdown: string, theme?: ThemePayload }) => void;
      updateContent: (payload: { markdown: string }) => void;
      updateTheme: (payload: ThemePayload) => void;
      triggerUndo: () => void;
      triggerRedo: () => void;
    };
    cefQuery?: (request: any) => void;
  }
}

interface ThemePayload { isDark?: boolean }

// We support two fixed palettes (dark/light); the IDE only tells us `isDark`.
// The palette itself lives in CSS via :root / :root[data-theme="light"].
const applyTheme = (theme?: ThemePayload) => {
  const isDark = theme?.isDark ?? true;
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  // Let React components (e.g. prose-invert toggle) react to live changes.
  window.dispatchEvent(new CustomEvent('mdeditor:theme', { detail: isDark }));
};

window.MDEdBridge = {
  initDocument: (payload) => {
    applyTheme(payload.theme);

    if (!root) {
      root = ReactDOM.createRoot(document.getElementById('root')!);
      root.render(
        <React.StrictMode>
          <App initialMarkdown={payload.markdown} />
        </React.StrictMode>
      )
    } else {
      window.dispatchEvent(new CustomEvent('mdeditor:update', { detail: payload.markdown }));
    }
  },
  updateContent: (payload) => {
    window.dispatchEvent(new CustomEvent('mdeditor:update', { detail: payload.markdown }));
  },
  updateTheme: (payload) => {
    applyTheme(payload);
  },
  triggerUndo: () => {
    window.dispatchEvent(new CustomEvent('mdeditor:undo'));
  },
  triggerRedo: () => {
    window.dispatchEvent(new CustomEvent('mdeditor:redo'));
  }
}

// Automatically start in DEV mode if not inside IDE
if (import.meta.env.DEV) {
  setTimeout(() => {
    if (!root) {
      window.MDEdBridge.initDocument({
        markdown: '# Привет!\nЭто тестовый **Markdown** для режима разработки.',
        theme: {}
      });
    }
  }, 1000);
}
