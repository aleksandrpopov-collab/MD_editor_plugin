import { useEffect, useState } from 'react'
import { Editor } from '@tiptap/react'
import {
  Columns3, Rows3, Trash2,
  ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, ArrowDownToLine,
} from 'lucide-react'

interface Rect {
  top: number;
  left: number;
}

/**
 * Floating toolbar that appears anchored to the top-left of the table the
 * caret is currently inside. Provides add/delete column & row controls plus
 * delete-table. Column borders themselves are drag-resizable via the Table
 * extension's `resizable: true` option (handled by ProseMirror tables).
 */
export function TableControls({ editor }: { editor: Editor | null }) {
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (!editor) return

    const update = () => {
      // Only show when the selection is inside a table.
      if (!editor.isActive('table')) {
        setRect(null)
        return
      }
      const { from } = editor.state.selection
      const dom = editor.view.domAtPos(from).node as Node | null
      const el = (dom instanceof HTMLElement ? dom : dom?.parentElement) ?? null
      const table = el?.closest('table') ?? null
      if (!table) {
        setRect(null)
        return
      }
      const r = table.getBoundingClientRect()
      setRect({ top: r.top, left: r.left })
    }

    update()
    editor.on('selectionUpdate', update)
    editor.on('transaction', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)

    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editor])

  if (!editor || !rect) return null

  const btn = "p-1.5 hover:bg-[var(--surface-hover)] rounded text-[var(--text-color)] disabled:opacity-30 disabled:cursor-not-allowed"

  return (
    <div
      className="fixed z-50 flex gap-0.5 bg-[var(--surface-bg)] border border-[var(--border-color)] p-1 rounded shadow-lg"
      style={{ top: rect.top - 40, left: rect.left }}
      // Keep editor focus/selection when clicking a control.
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className={btn} title="Добавить колонку слева"
        onClick={() => editor.chain().focus().addColumnBefore().run()}>
        <ArrowLeftToLine size={16} />
      </button>
      <button className={btn} title="Добавить колонку справа"
        onClick={() => editor.chain().focus().addColumnAfter().run()}>
        <ArrowRightToLine size={16} />
      </button>
      <button className={btn} title="Удалить колонку"
        onClick={() => editor.chain().focus().deleteColumn().run()}>
        <Columns3 size={16} /><Trash2 size={12} className="-ml-1 -mt-2" />
      </button>

      <span className="w-px bg-[var(--border-color)] mx-1" />

      <button className={btn} title="Добавить строку сверху"
        onClick={() => editor.chain().focus().addRowBefore().run()}>
        <ArrowUpToLine size={16} />
      </button>
      <button className={btn} title="Добавить строку снизу"
        onClick={() => editor.chain().focus().addRowAfter().run()}>
        <ArrowDownToLine size={16} />
      </button>
      <button className={btn} title="Удалить строку"
        onClick={() => editor.chain().focus().deleteRow().run()}>
        <Rows3 size={16} /><Trash2 size={12} className="-ml-1 -mt-2" />
      </button>

      <span className="w-px bg-[var(--border-color)] mx-1" />

      <button className={btn} title="Удалить таблицу"
        onClick={() => editor.chain().focus().deleteTable().run()}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}
