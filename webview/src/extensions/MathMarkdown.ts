import { InlineMath, BlockMath } from '@tiptap/extension-mathematics'
import type MarkdownIt from 'markdown-it'

// --- markdown serialization helpers -----------------------------------------

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * markdown-it inline rule for `$...$`. Emits a token that renders to
 * `<span data-type="inline-math" data-latex="...">` so the InlineMath node's
 * parseHTML picks it up. Guards against currency (`$100`) and empty `$$`.
 */
function inlineMathRule(state: any, silent: boolean): boolean {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false

  let pos = start + 1
  if (pos >= state.posMax) return false
  const afterOpen = state.src.charCodeAt(pos)
  if (afterOpen === 0x20 /* space */ || afterOpen === 0x24 /* $$ -> block */) return false

  let found = -1
  while (pos < state.posMax) {
    const code = state.src.charCodeAt(pos)
    if (code === 0x5c /* \ */) { pos += 2; continue }
    if (code === 0x24 /* $ */) { found = pos; break }
    pos++
  }
  if (found < 0 || found === start + 1) return false
  if (state.src.charCodeAt(found - 1) === 0x20) return false // space before close
  const afterClose = state.src.charCodeAt(found + 1)
  if (afterClose >= 0x30 && afterClose <= 0x39) return false // digit -> currency

  if (!silent) {
    const token = state.push('math_inline', 'math', 0)
    token.markup = '$'
    token.content = state.src.slice(start + 1, found)
  }
  state.pos = found + 1
  return true
}

/** markdown-it block rule for `$$ ... $$` (single- or multi-line). */
function blockMathRule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
  const begin = state.bMarks[startLine] + state.tShift[startLine]
  const lineMax = state.eMarks[startLine]
  if (begin + 2 > lineMax) return false
  if (state.src.slice(begin, begin + 2) !== '$$') return false
  if (silent) return true

  const firstLine = state.src.slice(begin + 2, lineMax)
  let content: string
  let nextLine = startLine

  const trimmedFirst = firstLine.trim()
  if (trimmedFirst.endsWith('$$') && trimmedFirst.length >= 2) {
    // Closes on the same line: $$ x^2 $$
    content = trimmedFirst.slice(0, -2)
  } else {
    content = firstLine
    let closed = false
    while (!closed) {
      nextLine++
      if (nextLine >= endLine) break
      const ls = state.bMarks[nextLine] + state.tShift[nextLine]
      const le = state.eMarks[nextLine]
      const line = state.src.slice(ls, le)
      const idx = line.indexOf('$$')
      if (idx >= 0) {
        content += '\n' + line.slice(0, idx)
        closed = true
      } else {
        content += '\n' + line
      }
    }
  }

  state.line = nextLine + 1
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.markup = '$$'
  token.content = content.trim()
  token.map = [startLine, state.line]
  return true
}

/** Registers the math rules once per markdown-it instance. */
function setupMathMarkdownIt(md: MarkdownIt) {
  const flagged = md as MarkdownIt & { __mathRulesInstalled?: boolean }
  if (flagged.__mathRulesInstalled) return
  flagged.__mathRulesInstalled = true

  md.inline.ruler.after('escape', 'math_inline', inlineMathRule)
  md.block.ruler.before('fence', 'math_block', blockMathRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })

  md.renderer.rules.math_inline = (tokens, idx) =>
    `<span data-type="inline-math" data-latex="${escapeAttr(tokens[idx].content)}"></span>`
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div data-type="block-math" data-latex="${escapeAttr(tokens[idx].content)}"></div>\n`
}

// --- extended nodes with markdown round-trip ---------------------------------

export const InlineMathMD = InlineMath.extend({
  addStorage() {
    return {
      ...(this.parent?.() ?? {}),
      markdown: {
        serialize(state: any, node: any) {
          state.write('$' + (node.attrs.latex ?? '') + '$')
        },
        parse: {
          setup(markdownit: MarkdownIt) {
            setupMathMarkdownIt(markdownit)
          },
        },
      },
    }
  },
})

export const BlockMathMD = BlockMath.extend({
  addStorage() {
    return {
      ...(this.parent?.() ?? {}),
      markdown: {
        serialize(state: any, node: any) {
          state.write('$$\n')
          state.text(node.attrs.latex ?? '', false)
          state.ensureNewLine()
          state.write('$$')
          state.closeBlock(node)
        },
        parse: {
          setup(markdownit: MarkdownIt) {
            setupMathMarkdownIt(markdownit)
          },
        },
      },
    }
  },
})
