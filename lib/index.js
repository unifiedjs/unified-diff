import process from 'node:process'
import path from 'node:path'
// @ts-expect-error: hush
import gitDiffTree from 'git-diff-tree'
import {findUp} from 'vfile-find-up'

const own = {}.hasOwnProperty

/** @type {string} */
let previousRange

/** @type {import('unified').Plugin<[]>} */
export default function diff() {
  /** @type {Record<string, string>} */
  let cache = {}

  return function (_, file, next) {
    const base = file.dirname
    /** @type {string|undefined} */
    let commitRange
    /** @type {Array<string>|undefined} */
    let range

    // Looks like Travis.
    if (process.env.TRAVIS_COMMIT_RANGE) {
      commitRange = process.env.TRAVIS_COMMIT_RANGE
      range = commitRange.split(/\.{3}/)
    }
    // Looks like GH Actions.
    else if (process.env.GITHUB_SHA) {
      // @ts-expect-error: fine.
      range =
        // This is a PR: check the whole PR.
        // Refs take the form `refs/heads/main`.
        process.env.GITHUB_BASE_REF && process.env.GITHUB_HEAD_REF
          ? [
              process.env.GITHUB_BASE_REF.split('/').pop(),
              process.env.GITHUB_HEAD_REF.split('/').pop()
            ]
          : [process.env.GITHUB_SHA + '^1', process.env.GITHUB_SHA]
      // @ts-expect-error: We definitely just defined this
      commitRange = range.join('...')
    }

    if (
      !base ||
      !commitRange ||
      !range ||
      !file.dirname ||
      range.length !== 2
    ) {
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
      findUp('.git', file.dirname, (error, git) => {
        // Never happens.
        /* c8 ignore next */
        if (error) return next(error)

        // Not testable in a Git repo…
        /* c8 ignore next 3 */
        if (!git || !git.dirname) {
          return next(new Error('Not in a git repository'))
        }

        cache[base] = git.dirname
        tick(git.dirname)
      })
    }

    /**
     * @param {string} root
     */
    function tick(root) {
      /** @type {Record<string, Array<[number, number]>>} */
      const diffs = {}

      gitDiffTree(path.join(root, '.git'), {
        // @ts-expect-error: fine.
        originalRev: range[0],
        // @ts-expect-error: fine.
        rev: range[1]
      })
        .on('error', next)
        .on(
          'data',
          /**
           * @param {string} type
           * @param {{lines: string, aPath: string, bPath: string}} data
           */
          (type, data) => {
            if (type !== 'patch') return

            const lines = data.lines
            const re = /^@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/
            const match = lines[0].match(re)

            // Should not happen, maybe if Git returns weird diffs?
            /* c8 ignore next */
            if (!match) return

            /** @type {Array<[number, number]>} */
            const ranges = []
            const start = Number.parseInt(match[3], 10) - 1
            let index = 0
            /** @type {number|undefined} */
            let position

            while (++index < lines.length) {
              const line = lines[index]

              if (line.charAt(0) === '+') {
                const no = start + index

                if (position === undefined) {
                  position = ranges.length
                  ranges.push([no, no])
                } else {
                  ranges[position][1] = no
                }
              } else {
                position = undefined
              }
            }

            const fp = path.resolve(root, data.bPath)

            // Long diffs.
            /* c8 ignore next */
            if (!(fp in diffs)) diffs[fp] = []

            diffs[fp].push(...ranges)
          }
        )
        .on('end', () => {
          const fp = path.resolve(file.cwd, file.path)
          const ranges = diffs[fp]

          // Unchanged file.
          if (!ranges || ranges.length === 0) {
            file.messages = []
            return next()
          }

          file.messages = file.messages.filter((message) =>
            ranges.some(
              (range) =>
                message.line &&
                message.line >= range[0] &&
                message.line <= range[1]
            )
          )

          next()
        })
    }
  }
}
