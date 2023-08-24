/**
 * @typedef {import('vfile').VFile} VFile
 */

/**
 * @typedef {'patch' | 'stats' | 'raw'} DiffType
 *
 * @typedef PatchData
 *   Data of a patch.
 * @property {string} aPath
 *   From.
 * @property {string} bPath
 *   To.
 * @property {Array<string>} lines
 *   Changes.
 * @property {boolean} isBlacklisted
 *   No idea.
 *
 * @typedef {[originalRev: string, rev: string]} Range
 *   Range of two refs (such as commits).
 *
 * @typedef {[from: number, to: number]} Diff
 *   Diff range, two line numbers between which there’s been a change.
 */

import path from 'node:path'
import process from 'node:process'
import {ok as assert} from 'devlop'
// @ts-expect-error: not typed.
import gitDiffTree from 'git-diff-tree'
import {findUp} from 'vfile-find-up'

// This is mostly to enable the tests to mimick different CIs.
// Normally, a Node process exits between CI runs.
/** @type {string} */
let previousRange

/**
 * @returns
 *   Transform.
 */
export default function unifiedDiff() {
  /** @type {Map<string, string>} */
  let cache = new Map()

  /**
   * @param {unknown} _
   *   Tree.
   * @param {VFile} file
   *   File.
   * @returns {Promise<undefined>}
   *   Promise to nothing.
   */
  return async function (_, file) {
    const base = file.dirname
    /** @type {string | undefined} */
    let commitRange
    /** @type {Range | undefined} */
    let range

    // Looks like Travis.
    if (process.env.TRAVIS_COMMIT_RANGE) {
      commitRange = process.env.TRAVIS_COMMIT_RANGE
      // Cast because we check `length` later.
      range = /** @type {Range} */ (commitRange.split(/\.{3}/))
    }
    // Looks like GH Actions.
    else if (process.env.GITHUB_SHA) {
      const sha = process.env.GITHUB_SHA
      const base = process.env.GITHUB_BASE_REF
      const head = process.env.GITHUB_HEAD_REF

      if (base && head) {
        const baseTail = base.split('/').pop()
        const headTail = head.split('/').pop()
        assert(baseTail)
        assert(headTail)
        range = [baseTail, headTail]
      } else {
        range = [sha + '^1', sha]
      }

      commitRange = range.join('...')
    }

    if (
      !base ||
      !commitRange ||
      !range ||
      !file.dirname ||
      range.length !== 2
    ) {
      return
    }

    // Reset cache.
    if (previousRange !== commitRange) {
      cache = new Map()
      previousRange = commitRange
    }

    let gitFolder = cache.get(base)

    if (!gitFolder) {
      const gitFolderFile = await findUp('.git', file.dirname)

      /* c8 ignore next 3 -- not testable in a Git repo… */
      if (!gitFolderFile || !gitFolderFile.dirname) {
        throw new Error('Not in a git repository')
      }

      cache.set(base, gitFolderFile.dirname)
      gitFolder = gitFolderFile.dirname
    }

    const diffs = await checkGit(gitFolder, range)
    const ranges = diffs.get(path.resolve(file.cwd, file.path))

    // Unchanged file: drop all messages.
    if (!ranges || ranges.length === 0) {
      file.messages.length = 0
      return
    }

    file.messages = file.messages.filter(function (message) {
      return ranges.some(function (range) {
        return (
          message.line && message.line >= range[0] && message.line <= range[1]
        )
      })
    })
  }
}

/**
 * Check a folder.
 *
 * @param {string} root
 *   Folder.
 * @param {Range} range
 *   Range.
 * @returns {Promise<Map<string, Array<Diff>>>}
 *   Nothing.
 */
function checkGit(root, range) {
  return new Promise(function (resolve, reject) {
    /** @type {Map<string, Array<Diff>>} */
    const diffs = new Map()
    const [originalRev, rev] = range

    gitDiffTree(path.join(root, '.git'), {originalRev, rev})
      .on('error', reject)
      .on(
        'data',
        /**
         * @param {DiffType} type
         *   Data type.
         * @param {PatchData} data
         *   Data.
         * @returns {undefined}
         *   Nothing.
         */
        function (type, data) {
          if (type !== 'patch') return

          const lines = data.lines
          const re = /^@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/
          const match = lines[0].match(re)

          /* c8 ignore next -- should not happen, maybe if Git returns weird diffs? */
          if (!match) return

          /** @type {Array<Diff>} */
          const ranges = []
          const start = Number.parseInt(match[3], 10) - 1
          let index = 0
          /** @type {number | undefined} */
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

          let list = diffs.get(fp)

          if (!list) {
            list = []
            diffs.set(fp, list)
          }

          list.push(...ranges)
        }
      )
      .on('end', function () {
        resolve(diffs)
      })
  })
}
