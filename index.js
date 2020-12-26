'use strict'

var path = require('path')
var gitDiffTree = require('git-diff-tree')
var findUp = require('vfile-find-up')

module.exports = diff

var own = {}.hasOwnProperty

var previousRange

function diff() {
  var cache = {}

  return transform

  function transform(tree, file, next) {
    var base = file.dirname
    var commitRange
    var range

    // Looks like Travis.
    if (process.env.TRAVIS_COMMIT_RANGE) {
      commitRange = process.env.TRAVIS_COMMIT_RANGE
      range = commitRange.split(/\.{3}/)
    }
    // Looks like GH Actions.
    else if (process.env.GITHUB_SHA) {
      range =
        // This is a PR: check the whole PR.
        // Refs take the form `refs/heads/main`.
        process.env.GITHUB_BASE_REF && process.env.GITHUB_HEAD_REF
          ? [
              process.env.GITHUB_BASE_REF.split('/').pop(),
              process.env.GITHUB_HEAD_REF.split('/').pop()
            ]
          : [process.env.GITHUB_SHA + '^1', process.env.GITHUB_SHA]
      commitRange = range.join('...')
    }

    if (!base || !commitRange || range.length !== 2) {
      return next()
    }

    if (commitRange !== previousRange) {
      cache = {}
      previousRange = commitRange
    }

    if (own.call(cache, base)) {
      tick(cache[base])
    } else {
      findUp.one('.git', file.dirname, ongit)
    }

    function ongit(err, git) {
      /* istanbul ignore if - Never happens */
      if (err) {
        return next(err)
      }

      /* istanbul ignore if - Not testable in a Git repo… */
      if (!git) {
        return next(new Error('Not in a git repository'))
      }

      cache[base] = git.dirname
      tick(git.dirname)
    }

    function tick(root) {
      var diffs = {}
      var revs = {originalRev: range[0], rev: range[1]}

      gitDiffTree(path.join(root, '.git'), revs)
        .on('error', next)
        .on('data', ondata)
        .on('end', onend)

      function ondata(type, data) {
        var info = type === 'patch' && parse(data)
        var fp

        if (info) {
          fp = path.resolve(root, info.path)

          /* istanbul ignore else - long diffs. */
          if (!(fp in diffs)) {
            diffs[fp] = []
          }

          diffs[fp] = diffs[fp].concat(info.ranges)
        }
      }

      function onend() {
        tock(diffs)
      }

      function tock(patches) {
        var fp = path.resolve(file.cwd, file.path)
        var ranges = patches[fp]

        // Unchanged file.
        if (!ranges || ranges.length === 0) {
          file.messages = []
          return next()
        }

        file.messages = file.messages.filter(filter)

        next()

        function filter(message) {
          var line = message.line

          return ranges.some(some)

          function some(range) {
            return line >= range[0] && line <= range[1]
          }
        }
      }
    }
  }
}

function parse(data) {
  var lines = data.lines
  var line = lines[0]
  var re = /^@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/
  var match = line.match(re)
  var result = {path: data.bPath}
  var ranges = []
  var start
  var index
  var length
  var position
  var no

  /* istanbul ignore if - Should not happen, maybe if Git returns weird diffs? */
  if (!match) {
    return
  }

  index = 0
  length = lines.length
  start = parseInt(match[3], 10) - 1
  result.ranges = ranges

  while (++index < length) {
    line = lines[index]

    if (line.charAt(0) !== '+') {
      position = null
      continue
    }

    no = start + index

    if (position === null || position === undefined) {
      position = ranges.length
      ranges.push([no, no])
    } else {
      ranges[position][1] = no
    }
  }

  return result
}
