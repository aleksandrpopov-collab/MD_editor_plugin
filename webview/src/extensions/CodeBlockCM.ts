import { CodeBlock } from '@tiptap/extension-code-block'
import type { NodeViewRendererProps } from '@tiptap/core'
import { TextSelection, Selection } from '@tiptap/pm/state'
import type { EditorView as PMEditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { exitCode } from '@tiptap/pm/commands'

import {
  EditorView as CMEditorView,
  keymap as cmKeymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
} from '@codemirror/view'
import { EditorState as CMEditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentUnit,
  type LanguageSupport,
} from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'

import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { css as cssLang } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'

// Languages offered in the dropdown. `value` is what we persist in the
// code-block `language` attribute (and therefore the markdown fence info).
const LANGUAGES: { label: string; value: string; support?: () => LanguageSupport }[] = [
  { label: 'Plain text', value: 'text' },
  { label: 'JavaScript', value: 'javascript', support: () => javascript() },
  { label: 'TypeScript', value: 'typescript', support: () => javascript({ typescript: true }) },
  { label: 'JSX', value: 'jsx', support: () => javascript({ jsx: true }) },
  { label: 'Python', value: 'python', support: () => python() },
  { label: 'JSON', value: 'json', support: () => json() },
  { label: 'CSS', value: 'css', support: () => cssLang() },
  { label: 'HTML', value: 'html', support: () => html() },
  { label: 'Markdown', value: 'markdown', support: () => markdown() },
]

function languageExtension(value: string) {
  const entry = LANGUAGES.find(l => l.value === value)
  return entry?.support ? entry.support() : []
}

class CodeBlockView {
  dom: HTMLElement
  cm: CMEditorView
  private node: PMNode
  private view: PMEditorView
  private getPos: () => number | undefined
  private updating = false
  private languageConf = new Compartment()

  constructor(props: NodeViewRendererProps) {
    this.node = props.node
    this.view = props.editor.view
    this.getPos = props.getPos as () => number | undefined

    const initialLang = (this.node.attrs.language as string) || 'text'

    // --- CodeMirror editor ---
    this.cm = new CMEditorView({
      doc: this.node.textContent,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        indentUnit.of('  '),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        this.languageConf.of(languageExtension(initialLang)),
        oneDark,
        cmKeymap.of([
          ...this.codeMirrorKeymap(),
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        CMEditorView.updateListener.of(update => this.forwardUpdate(update)),
      ],
    })

    // --- Wrapper + header (language select, copy button, toast) ---
    this.dom = document.createElement('div')
    this.dom.className = 'cm-codeblock'

    const header = document.createElement('div')
    header.className = 'cm-codeblock-header'
    header.contentEditable = 'false'

    const select = document.createElement('select')
    select.className = 'cm-codeblock-lang'
    for (const lang of LANGUAGES) {
      const opt = document.createElement('option')
      opt.value = lang.value
      opt.textContent = lang.label
      if (lang.value === initialLang) opt.selected = true
      select.appendChild(opt)
    }
    select.addEventListener('change', () => this.setLanguage(select.value))
    // Prevent the select from stealing/forwarding events to ProseMirror.
    select.addEventListener('mousedown', e => e.stopPropagation())

    const copyBtn = document.createElement('button')
    copyBtn.className = 'cm-codeblock-copy'
    copyBtn.type = 'button'
    copyBtn.textContent = 'Copy'
    copyBtn.addEventListener('mousedown', e => e.preventDefault())
    copyBtn.addEventListener('click', () => this.copy())

    header.appendChild(select)
    header.appendChild(copyBtn)
    this.dom.appendChild(header)
    this.dom.appendChild(this.cm.dom)
  }

  /** Push CodeMirror document/selection changes back into ProseMirror. */
  private forwardUpdate(update: { docChanged: boolean; state: CMEditorState; changes: any; selectionSet: boolean }) {
    if (this.updating || !this.cm.hasFocus) return
    const pos = this.getPos()
    if (pos === undefined) return
    let offset = pos + 1
    const { main } = update.state.selection
    const selFrom = offset + main.from
    const selTo = offset + main.to
    const pmSel = this.view.state.selection

    if (update.docChanged || pmSel.from !== selFrom || pmSel.to !== selTo) {
      const tr = this.view.state.tr
      update.changes.iterChanges((fromA: number, toA: number, _fromB: number, _toB: number, text: { length: number; toString: () => string }) => {
        if (text.length) {
          tr.replaceWith(offset + fromA, offset + toA, this.view.state.schema.text(text.toString()))
        } else {
          tr.delete(offset + fromA, offset + toA)
        }
        offset += (toA - fromA)
      })
      tr.setSelection(TextSelection.create(tr.doc, selFrom, selTo))
      this.view.dispatch(tr)
    }
  }

  /** Called by ProseMirror when it wants to place the selection in this view. */
  setSelection(anchor: number, head: number) {
    this.cm.focus()
    this.updating = true
    this.cm.dispatch({ selection: { anchor, head } })
    this.updating = false
  }

  private codeMirrorKeymap() {
    const view = this.view
    return [
      { key: 'ArrowUp', run: () => this.maybeEscape('line', -1) },
      { key: 'ArrowLeft', run: () => this.maybeEscape('char', -1) },
      { key: 'ArrowDown', run: () => this.maybeEscape('line', 1) },
      { key: 'ArrowRight', run: () => this.maybeEscape('char', 1) },
      {
        key: 'Ctrl-Enter',
        run: () => {
          if (!exitCode(view.state, view.dispatch)) return false
          view.focus()
          return true
        },
      },
      {
        key: 'Backspace',
        run: () => {
          const ranges = this.cm.state.selection.ranges
          // Only intercept when at the very start with an empty selection;
          // let CodeMirror handle everything else.
          if (ranges.length > 1) return false
          const sel = ranges[0]
          if (!(sel.empty && sel.from === 0)) return false
          // Lift the (now empty) code block out by deleting it from PM.
          const pos = this.getPos()
          if (pos === undefined) return false
          const tr = view.state.tr.delete(pos, pos + this.node.nodeSize)
          view.dispatch(tr)
          view.focus()
          return true
        },
      },
    ]
  }

  /** Move the selection out of the code block when arrowing past its edges. */
  private maybeEscape(unit: 'line' | 'char', dir: 1 | -1): boolean {
    const state = this.cm.state
    const { main } = state.selection
    if (!main.empty) return false
    if (unit === 'line') {
      const line = state.doc.lineAt(main.head)
      if (dir < 0 ? line.from > 0 : line.to < state.doc.length) return false
    } else {
      if (dir < 0 ? main.from > 0 : main.to < state.doc.length) return false
    }
    const pos = this.getPos()
    if (pos === undefined) return false
    const targetPos = pos + (dir < 0 ? 0 : this.node.nodeSize)
    const selection = Selection.near(this.view.state.doc.resolve(targetPos), dir)
    const tr = this.view.state.tr.setSelection(selection).scrollIntoView()
    this.view.dispatch(tr)
    this.view.focus()
    return true
  }

  private setLanguage(value: string) {
    const pos = this.getPos()
    if (pos !== undefined) {
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        language: value,
      })
      this.view.dispatch(tr)
    }
    this.cm.dispatch({ effects: this.languageConf.reconfigure(languageExtension(value)) })
  }

  private copy() {
    const text = this.cm.state.doc.toString()
    const done = () => this.showToast('code copied to clipboard')
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, done)
    } else {
      done()
    }
  }

  private showToast(message: string) {
    const toast = document.createElement('div')
    toast.className = 'cm-codeblock-toast'
    toast.textContent = message
    this.dom.appendChild(toast)
    // Force reflow so the transition runs, then fade out and remove.
    requestAnimationFrame(() => toast.classList.add('visible'))
    setTimeout(() => {
      toast.classList.remove('visible')
      setTimeout(() => toast.remove(), 300)
    }, 1600)
  }

  /** Sync external (ProseMirror) document changes into CodeMirror. */
  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    const oldNode = this.node
    this.node = node
    if (this.updating) return true

    // Language attribute changed from the outside.
    if (node.attrs.language !== oldNode.attrs.language) {
      const select = this.dom.querySelector('select.cm-codeblock-lang') as HTMLSelectElement | null
      if (select) select.value = node.attrs.language || 'text'
      this.cm.dispatch({ effects: this.languageConf.reconfigure(languageExtension(node.attrs.language || 'text')) })
    }

    const newText = node.textContent
    const curText = this.cm.state.doc.toString()
    if (newText !== curText) {
      // Minimal diff to preserve cursor where possible.
      let start = 0
      let oldEnd = curText.length
      let newEnd = newText.length
      while (start < oldEnd && start < newEnd && curText[start] === newText[start]) start++
      while (oldEnd > start && newEnd > start && curText[oldEnd - 1] === newText[newEnd - 1]) {
        oldEnd--
        newEnd--
      }
      this.updating = true
      this.cm.dispatch({
        changes: { from: start, to: oldEnd, insert: newText.slice(start, newEnd) },
      })
      this.updating = false
    }
    return true
  }

  selectNode() {
    this.cm.focus()
  }

  stopEvent(event: Event): boolean {
    // Let our header controls (select/button) work; otherwise CodeMirror owns events.
    const target = event.target as HTMLElement | null
    if (target && target.closest('.cm-codeblock-header')) return false
    return true
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy() {
    this.cm.destroy()
  }
}

/**
 * Code block backed by a real CodeMirror 6 editor (syntax highlighting,
 * language switching, copy-to-clipboard). Keeps the `codeBlock` node name so
 * tiptap-markdown round-trips it as a fenced ``` block.
 */
export const CodeBlockCM = CodeBlock.extend({
  addNodeView() {
    return (props: NodeViewRendererProps) => new CodeBlockView(props)
  },
})

export default CodeBlockCM
