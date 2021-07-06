import retext from 'retext'
import visit from 'unist-util-visit'
import toString from 'nlcst-to-string'
import unifiedDiff from '../index.js'

export const processor = retext().use(lorem).use(unifiedDiff).freeze()

function lorem() {
  return transformer

  function transformer(tree, file) {
    visit(tree, 'WordNode', visitor)

    function visitor(node) {
      if (/lorem/i.test(toString(node))) {
        file.message('No lorem!', node)
      }
    }
  }
}
