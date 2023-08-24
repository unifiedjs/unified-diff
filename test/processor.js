/**
 * @typedef {import('nlcst').Root} Root
 */

import {toString} from 'nlcst-to-string'
import {ParseEnglish} from 'parse-english'
import {unified} from 'unified'
import {visit} from 'unist-util-visit'
import unifiedDiff from '../index.js'

// To do: use `retext-english`, `retext-stringify` when they are released.
// import retextEnglish from 'retext-english'
// import retextStringify from 'retext-stringify'

export const processor = unified()
  .use(
    /** @type {import('unified').Plugin<[], string, Root>} */
    // @ts-expect-error: TS doesn’t understand `this`.
    function () {
      this.parser = parser
      /** @type {import('unified').Parser<Root>} */
      function parser(value) {
        const parser = new ParseEnglish()
        const node = parser.parse(value)
        return node
      }
    }
  )
  .use(
    /** @type {import('unified').Plugin<[], Root, string>} */
    // @ts-expect-error: TS doesn’t understand `this`.
    function () {
      // @ts-expect-error: TS doesn’t understand `this`.
      this.compiler = compiler
      /** @type {import('unified').Compiler<Root, string>} */
      function compiler(node) {
        return toString(node)
      }
    }
  )
  .use(function () {
    /**
     * @param {Root} tree
     *   Tree.
     * @returns {undefined}
     *   Nothing.
     */
    return function (tree, file) {
      visit(tree, 'WordNode', function (node) {
        if (/lorem/i.test(toString(node))) {
          file.message('No lorem!', node)
        }
      })
    }
  })
  .use(unifiedDiff)
  .freeze()
