import { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { Bold, Italic, Strikethrough, Code, Link as LinkIcon } from 'lucide-react'

export function InlineMenu({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  const toggleLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    if (url === null) return // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <BubbleMenu editor={editor} className="flex overflow-hidden bg-[var(--surface-bg)] border border-[var(--border-color)] rounded shadow-lg text-[var(--text-color)]">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-2 hover:bg-[var(--surface-hover)] ${"$"}{editor.isActive('bold') ? 'bg-[var(--surface-hover)] text-[var(--accent-color)]' : ''}`}
      >
        <Bold size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-2 hover:bg-[var(--surface-hover)] ${"$"}{editor.isActive('italic') ? 'bg-[var(--surface-hover)] text-[var(--accent-color)]' : ''}`}
      >
        <Italic size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-2 hover:bg-[var(--surface-hover)] ${"$"}{editor.isActive('strike') ? 'bg-[var(--surface-hover)] text-[var(--accent-color)]' : ''}`}
      >
        <Strikethrough size={16} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        className={`p-2 hover:bg-[var(--surface-hover)] ${"$"}{editor.isActive('code') ? 'bg-[var(--surface-hover)] text-[var(--accent-color)]' : ''}`}
      >
        <Code size={16} />
      </button>
      <button
        onClick={toggleLink}
        className={`p-2 hover:bg-[var(--surface-hover)] ${"$"}{editor.isActive('link') ? 'bg-[var(--surface-hover)] text-[var(--accent-color)]' : ''}`}
      >
        <LinkIcon size={16} />
      </button>
    </BubbleMenu>
  )
}
