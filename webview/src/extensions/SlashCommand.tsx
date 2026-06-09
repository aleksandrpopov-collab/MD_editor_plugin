import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import {
  Heading1, Heading2, Heading3, Text as TextIcon, List, ListOrdered, CheckSquare,
  Table as TableIcon, CodeSquare, Quote, Minus, Sigma,
} from 'lucide-react'
import { SlashMenu, type SlashItem, type SlashMenuRef } from '../components/SlashMenu'

const ICON = 18

// The block catalogue offered by the `/` menu. Titles are English; `aliases`
// add short/Russian keywords so `/ta`, `/code`, `/spisok`, etc. all filter.
const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Heading 1', description: 'Large section heading', icon: <Heading1 size={ICON} />, aliases: ['h1', 'heading', 'zagolovok'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2', description: 'Medium heading', icon: <Heading2 size={ICON} />, aliases: ['h2', 'heading'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3', description: 'Small heading', icon: <Heading3 size={ICON} />, aliases: ['h3', 'heading'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Text', description: 'Plain paragraph', icon: <TextIcon size={ICON} />, aliases: ['text', 'paragraph', 'tekst'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Bullet List', description: 'Simple bulleted list', icon: <List size={ICON} />, aliases: ['list', 'bullet', 'spisok'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered List', description: 'Ordered list with numbers', icon: <ListOrdered size={ICON} />, aliases: ['ordered', 'numbered', 'ol', 'number', 'nomer'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Checklist', description: 'Task list with checkboxes', icon: <CheckSquare size={ICON} />, aliases: ['todo', 'task', 'checklist', 'chek'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Table', description: '3×3 table', icon: <TableIcon size={ICON} />, aliases: ['table', 'tablica'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: 'Code Block', description: 'Syntax highlighting (CodeMirror)', icon: <CodeSquare size={ICON} />, aliases: ['code', 'kod'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('codeBlock').run(),
  },
  {
    title: 'Quote', description: 'Highlighted blockquote', icon: <Quote size={ICON} />, aliases: ['quote', 'citata', 'blockquote'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Formula', description: 'Math block (KaTeX)', icon: <Sigma size={ICON} />, aliases: ['math', 'formula', 'katex', 'tex'],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertBlockMath({ latex: 'e = mc^2' }).run(),
  },
  {
    title: 'Divider', description: 'Horizontal rule', icon: <Minus size={ICON} />, aliases: ['divider', 'hr', 'razdelitel'],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]

function filterItems(query: string): SlashItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter(item =>
    item.title.toLowerCase().includes(q) ||
    item.aliases?.some(a => a.toLowerCase().includes(q)),
  )
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        // A space ends the suggestion (closes menu, leaves a literal '/').
        allowSpaces: false,
        startOfLine: false,
        items: ({ query }) => filterItems(query),
        command: ({ editor, range, props }) => props.command({ editor, range }),
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null
          let popup: HTMLDivElement | null = null

          const positionAt = (rect: DOMRect | null | undefined) => {
            if (!popup || !rect) return
            // Position below the caret; flip above if near the viewport bottom.
            const menuHeight = popup.offsetHeight || 320
            const below = rect.bottom + 6
            const top = below + menuHeight > window.innerHeight && rect.top > menuHeight
              ? rect.top - menuHeight - 6
              : below
            popup.style.top = `${top}px`
            popup.style.left = `${rect.left}px`
          }

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: (item: SlashItem) => props.command(item) },
                editor: props.editor,
              })
              popup = document.createElement('div')
              popup.className = 'slash-menu-popup'
              popup.appendChild(component.element)
              document.body.appendChild(popup)
              positionAt(props.clientRect?.())
            },
            onUpdate: (props) => {
              component?.updateProps({ items: props.items, command: (item: SlashItem) => props.command(item) })
              positionAt(props.clientRect?.())
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                popup?.remove()
                return true
              }
              return component?.ref?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              popup?.remove()
              popup = null
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})

export default SlashCommand
