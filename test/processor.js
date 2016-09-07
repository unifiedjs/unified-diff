/**
 * @author Titus Wormer
 * @copyright 2016 Titus Wormer
 * @license MIT
 * @module unified-diff
 * @fileoverview Test suite for `unified-diff`.
 */

'use strict';

/* Dependencies. */
var retext = require('retext');
var visit = require('unist-util-visit');
var toString = require('nlcst-to-string');
var diff = require('..');

module.exports = retext()
  .use(lorem)
  .use(diff)
  .abstract();

function lorem() {
  return transformer;

  function transformer(tree, file) {
    visit(tree, 'WordNode', visitor);

    function visitor(node) {
      if (/lorem/i.test(toString(node))) {
        file.warn('No lorem!', node);
      }
    }
  }
}
