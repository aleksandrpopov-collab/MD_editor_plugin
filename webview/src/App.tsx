import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { CodeBlockCM } from './extensions/CodeBlockCM'
import { InlineMathMD, BlockMathMD } from './extensions/MathMarkdown'
import { SlashCommand } from './extensions/SlashCommand'
import { Markdown } from 'tiptap-markdown'
import 'katex/dist/katex.min.css'
import debounce from 'lodash.debounce'
import { InlineMenu } from './components/InlineMenu'
import { TableControls } from './components/TableControls'

interface AppProps {
  initialMarkdown: string;
}

// tiptap-markdown attaches a `markdown` storage but does not augment core's
// Storage type, so we access it through a small typed helper.
const getMarkdown = (editor: Editor): string =>
  (editor.storage as unknown as Record<string, { getMarkdown: () => string }>).markdown.getMarkdown();

export default function App({ initialMarkdown }: AppProps) {
  // Tailwind Typography needs `prose-invert` only on dark backgrounds. The
  // IDE theme is reflected on <html data-theme>; we mirror it into React state
  // so a live theme switch re-renders the editor with the right prose variant.
  const [isDark, setIsDark] = useState(
    () => document.documentElement.dataset.theme !== 'light',
  );

  useEffect(() => {
    const onTheme = (e: Event) => setIsDark((e as CustomEvent<boolean>).detail);
    window.addEventListener('mdeditor:theme', onTheme);
    return () => window.removeEventListener('mdeditor:theme', onTheme);
  }, []);

  // Debounced save to IDE
  const saveToIde = useRef(debounce((md: string) => {
    if (window.cefQuery) {
      window.cefQuery({
        request: JSON.stringify({
          action: 'saveDocument',
          payload: { markdown: md }
        }),
        onSuccess: function() {},
        onFailure: function() {}
      });
      
      // Also register a command for IntelliJ's Undo history
      window.cefQuery({
        request: JSON.stringify({
          action: 'registerCommand',
          payload: { commandName: 'Редактирование Markdown' }
        }),
        onSuccess: function() {},
        onFailure: function() {}
      });
    }
  }, 500)).current;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false }),
      CodeBlockCM,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Type '/' for commands or start typing..." }),
      Table.configure({ resizable: true, lastColumnResizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      InlineMathMD,
      BlockMathMD,
      SlashCommand,
      Markdown,
    ],
    content: initialMarkdown,
    onUpdate: ({ editor }: { editor: Editor }) => {
      // Convert current editor state to markdown
      const md = getMarkdown(editor);
      saveToIde(md);
    },
  });

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const newMd = e.detail;
      if (editor && newMd !== getMarkdown(editor)) {
        // Parse incoming markdown and update without emitting update event
        editor.commands.setContent(newMd, { emitUpdate: false });
      }
    };
    
    const handleUndo = () => {
      editor?.commands.undo();
    };

    const handleRedo = () => {
      editor?.commands.redo();
    };

    // Dev-only helper for debugging/round-trip testing the markdown output.
    if (import.meta.env.DEV && editor) {
      (window as unknown as { __mdedGetMarkdown?: () => string }).__mdedGetMarkdown = () => getMarkdown(editor);
    }

    window.addEventListener('mdeditor:update', handleUpdate);
    window.addEventListener('mdeditor:undo', handleUndo);
    window.addEventListener('mdeditor:redo', handleRedo);

    return () => {
      window.removeEventListener('mdeditor:update', handleUpdate);
      window.removeEventListener('mdeditor:undo', handleUndo);
      window.removeEventListener('mdeditor:redo', handleRedo);
    };
  }, [editor]);

  return (
    <div className="min-h-screen p-8 bg-[var(--bg-color)] text-[var(--text-color)]">
      <InlineMenu editor={editor} />
      <TableControls editor={editor} />
      <EditorContent
        editor={editor}
        className={`prose ${isDark ? 'prose-invert' : ''} max-w-4xl mx-auto focus:outline-none`}
      />
    </div>
  )
}
