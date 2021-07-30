import {unified} from 'unified'
import retextEnglish from 'retext-english'
import retextStringify from 'retext-stringify'
import {visit} from 'unist-util-visit'
import {toString} from 'nlcst-to-string'
import unifiedDiff from '../index.js'

export const processor = unified()
  .use(retextEnglish)
  .use(retextStringify)
  .use(() => (tree, file) => {
    visit(tree, 'WordNode', (node) => {
      if (/lorem/i.test(toString(node))) {
        file.message('No lorem!', node)
      }
    })
  })
  .use(unifiedDiff)
  .freeze()
