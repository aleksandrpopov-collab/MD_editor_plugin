import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'

export interface SlashItem {
  title: string;
  description: string;
  icon: ReactNode;
  /** Runs the block transformation; receives the editor + the `/query` range. */
  command: (props: { editor: any; range: any }) => void;
  /** Extra keywords (e.g. English aliases) used for filtering. */
  aliases?: string[];
}

export interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashMenuProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>((props, ref) => {
  const [selected, setSelected] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => setSelected(0), [props.items])

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = containerRef.current?.querySelector(`[data-index="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (!props.items.length) return false
      if (event.key === 'ArrowUp') {
        setSelected(s => (s + props.items.length - 1) % props.items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected(s => (s + 1) % props.items.length)
        return true
      }
      if (event.key === 'Enter') {
        const item = props.items[selected]
        if (item) props.command(item)
        return true
      }
      return false
    },
  }), [props.items, props.command, selected])

  if (!props.items.length) return null

  return (
    <div ref={containerRef} className="slash-menu">
      {props.items.map((item, index) => (
        <button
          key={item.title}
          data-index={index}
          className={`slash-menu-item ${index === selected ? 'is-selected' : ''}`}
          onMouseEnter={() => setSelected(index)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => props.command(item)}
        >
          <span className="slash-menu-icon">{item.icon}</span>
          <span className="slash-menu-text">
            <span className="slash-menu-title">{item.title}</span>
            <span className="slash-menu-desc">{item.description}</span>
          </span>
        </button>
      ))}
    </div>
  )
})

SlashMenu.displayName = 'SlashMenu'
