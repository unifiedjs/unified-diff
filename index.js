/**
 * @author Titus Wormer
 * @copyright 2016 Titus Wormer
 * @license MIT
 * @module unified:diff
 * @fileoverview Ignore unrelated messages.
 */

'use strict';

/* Dependencies. */
var path = require('path');
var gitDiffTree = require('git-diff-tree');
var findUp = require('vfile-find-up');
var has = require('has');

/* Expose. */
module.exports = diff;

var previousRange;

function diff() {
  var cache = {};

  return transform;

  function transform(tree, file, next) {
    var base = file.dirname;
    var commitRange = process.env.TRAVIS_COMMIT_RANGE;
    var range = (commitRange || '').split(/\.{3}/);

    if (!base || !commitRange || range.length !== 2) {
      return next();
    }

    if (commitRange !== previousRange) {
      cache = {};
      previousRange = commitRange;
    }

    if (has(cache, base)) {
      tick(cache[base]);
    } else {
      findUp.one('.git', file.dirname, function (err, git) {
        /* istanbul ignore if - never happens */
        if (err) {
          return next(err);
        }

        /* istanbul ignore if - not testable in a Git repo... */
        if (!git) {
          return next(new Error('Not in a git repository'));
        }

        cache[base] = git.dirname;
        tick(git.dirname);
      });
    }

    function tick(root) {
      var diffs = {};

      gitDiffTree(path.join(root, '.git'), {originalRev: range[0], rev: range[1]})
        .on('error', next)
        .on('data', ondata)
        .on('end', onend);

      function ondata(type, data) {
        var info = type === 'patch' && parse(data);
        var fp;

        if (info) {
          fp = path.resolve(root, info.path);

          /* istanbul ignore else - long diffs. */
          if (!(fp in diffs)) {
            diffs[fp] = [];
          }

          diffs[fp] = diffs[fp].concat(info.ranges);
        }
      }

      function onend() {
        tock(diffs);
      }

      function tock(patches) {
        var fp = path.resolve(file.cwd, file.path);
        var ranges = patches[fp];

        /* Unchanged file. */
        if (!ranges || !ranges.length) {
          file.messages = [];
          return next();
        }

        file.messages = file.messages.filter(function (message) {
          var line = message.line;

          return ranges.some(function (range) {
            return line >= range[0] && line <= range[1];
          });
        });

        next();
      }
    }
  }
}

function parse(data) {
  var lines = data.lines;
  var line = lines[0];
  var re = /^@@ -([0-9]+),?([0-9]+)? \+([0-9]+),?([0-9]+)? @@/;
  var match = line.match(re);
  var result = {path: data.bPath};
  var ranges = [];
  var start;
  var index;
  var length;
  var position;
  var no;

  /* istanbul ignore if - should not happen, maybe if
   * Git returns weird diffs? */
  if (!match) {
    return;
  }

  index = 0;
  length = lines.length;
  start = parseInt(match[3], 10) - 1;
  result.ranges = ranges;

  while (++index < length) {
    line = lines[index];

    if (line.charAt(0) !== '+') {
      position = null;
      continue;
    }

    no = start + index;

    if (position === null || position === undefined) {
      position = ranges.length;
      ranges.push([no, no]);
    } else {
      ranges[position][1] = no;
    }
  }

  return result;
}
