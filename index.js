import path from 'path'
import gitDiffTree from 'git-diff-tree'
import findUp from 'vfile-find-up'

var own = {}.hasOwnProperty

var previousRange

export default function diff() {
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

    /* c8 ignore next 3 */
    if (own.call(cache, base)) {
      tick(cache[base])
    } else {
      findUp.one('.git', file.dirname, ongit)
    }

    function ongit(error, git) {
      // Never happens.
      /* c8 ignore next 3 */
      if (error) {
        return next(error)
      }

      // Not testable in a Git repo…
      /* c8 ignore next 3 */
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

          // Long diffs.
          /* c8 ignore next 3 */
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

        file.messages = file.messages.filter((message) =>
          ranges.some(
            (range) => message.line >= range[0] && message.line <= range[1]
          )
        )

        next()
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

  // Should not happen, maybe if Git returns weird diffs?
  /* c8 ignore next 3 */
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
