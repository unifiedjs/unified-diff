import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import fsDefault, {promises as fs} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import {promisify} from 'node:util'
import {write} from 'to-vfile'
import {VFile} from 'vfile'
import {processor} from './processor.js'

const exec = promisify(childProcess.exec)

const range = process.env.TRAVIS_COMMIT_RANGE
const sha = process.env.GITHUB_SHA
const base = process.env.GITHUB_BASE_REF
const head = process.env.GITHUB_HEAD_REF

// Remove potential variables that we’re testing on CIs.
delete process.env.TRAVIS_COMMIT_RANGE
delete process.env.GITHUB_SHA
delete process.env.GITHUB_BASE_REF
delete process.env.GITHUB_HEAD_REF

const current = process.cwd()

process.chdir(path.join(current, 'test'))

process.on('exit', function () {
  // Has to be sync.
  fsDefault.rmSync(new URL('.git', import.meta.url), {
    force: true,
    recursive: true
  })
  fsDefault.rmSync(new URL('example.txt', import.meta.url), {force: true})
  process.env.TRAVIS_COMMIT_RANGE = range
  process.env.GITHUB_SHA = sha
  process.env.GITHUB_BASE_REF = base
  process.env.GITHUB_HEAD_REF = head
  process.chdir(path.join(current))
})

test('unifiedDiff', async function (t) {
  await t.test('should expose the public api', async function () {
    assert.deepEqual(Object.keys(await import('unified-diff')).sort(), [
      'default'
    ])
  })
})

test('unifiedDiff (travis)', async function (t) {
  const stepOne = [
    'Lorem ipsum dolor sit amet.',
    '',
    'Lorem ipsum. Dolor sit amet.',
    ''
  ].join('\n')
  const stepTwo = stepOne + '\nLorem ipsum.'
  const stepThree = 'Lorem.\n' + stepOne + '\nLorem.'
  const other = 'Lorem ipsum.'

  await exec('git init')

  // Set up.
  try {
    await exec('git config --global user.email')
  } catch {
    await exec('git config --global user.email info@example.com')
    await exec('git config --global user.name Ex Ample')
  }

  // Add initial file.
  const fileOne = new VFile({path: 'example.txt', value: stepOne})

  await processor().process(fileOne)

  await t.test('should show messages if not on disk', async function () {
    assert.deepEqual(fileOne.messages.map(String), [
      'example.txt:1:1-1:6: No lorem!',
      'example.txt:3:1-3:6: No lorem!'
    ])
  })

  await write(fileOne)

  await exec('git add example.txt')
  await exec('git commit -m one')
  const resultInitial = await exec('git rev-parse HEAD')
  const initial = resultInitial.stdout.trim()

  // Change files.
  await write({path: 'example.txt', value: stepTwo})
  await exec('git add example.txt')
  await exec('git commit -m two')
  const resultFinal = await exec('git rev-parse HEAD')
  const final = resultFinal.stdout.trim()
  process.env.TRAVIS_COMMIT_RANGE = [initial, final].join('...')

  const fileTwo = await processor().process(
    new VFile({path: 'example.txt', value: stepTwo})
  )

  await t.test(
    'should show only messages for changed lines',
    async function () {
      assert.deepEqual(fileTwo.messages.map(String), [
        'example.txt:5:1-5:6: No lorem!'
      ])
    }
  )

  // Again!
  const fileAgain = await processor().process(
    new VFile({path: 'example.txt', value: stepTwo})
  )

  await t.test(
    'should not recheck (coverage for optimisations)',
    async function () {
      assert.deepEqual(fileAgain.messages.map(String), [
        'example.txt:5:1-5:6: No lorem!'
      ])
    }
  )

  // Unstaged files.
  const fileMissing = await processor().process(
    new VFile({path: 'missing.txt', value: other})
  )

  await t.test('should ignore unstaged files', async function () {
    assert.deepEqual(fileMissing.messages.map(String), [])
  })

  // New file.
  await write({path: 'example.txt', value: stepThree})
  await write({path: 'new.txt', value: other})
  await exec('git add example.txt new.txt')
  await exec('git commit -m three')
  const resultNew = await exec('git rev-parse HEAD')

  process.env.TRAVIS_COMMIT_RANGE = initial + '...' + resultNew.stdout.trim()

  const fileNew = await processor().process(
    new VFile({path: 'example.txt', value: stepThree})
  )

  await t.test('should deal with multiple patches', async function () {
    assert.deepEqual(fileNew.messages.map(String), [
      'example.txt:1:1-1:6: No lorem!',
      'example.txt:6:1-6:6: No lorem!'
    ])
  })

  const fileNewTwo = await processor().process(
    new VFile({path: 'new.txt', value: other})
  )

  await t.test('should deal with new files', async function () {
    assert.deepEqual(fileNewTwo.messages.map(String), [
      'new.txt:1:1-1:6: No lorem!'
    ])
  })

  delete process.env.TRAVIS_COMMIT_RANGE

  await fs.rm(new URL('.git', import.meta.url), {
    recursive: true
  })
  await fs.rm(new URL('example.txt', import.meta.url))
  await fs.rm(new URL('new.txt', import.meta.url))
})

test('unifiedDiff (GitHub Actions)', async function (t) {
  const stepOne = [
    'Lorem ipsum dolor sit amet.',
    '',
    'Lorem ipsum. Dolor sit amet.',
    ''
  ].join('\n')
  const stepTwo = stepOne + '\nLorem ipsum.\n'
  const stepThree = 'Lorem.\n\n' + stepOne + '\nAlpha bravo.\n'
  const stepFour = stepThree + '\nIpsum lorem.\n'

  await exec('git init')
  // Add initial file.
  await write({path: 'example.txt', value: stepOne})
  await exec('git add example.txt')
  await exec('git commit -m one')

  // Change file.
  await write({path: 'example.txt', value: stepTwo})
  await exec('git add example.txt')
  await exec('git commit -m two')
  const resultInitial = await exec('git rev-parse HEAD')

  process.env.GITHUB_SHA = resultInitial.stdout.trim()

  const fileInitial = await processor().process(
    new VFile({path: 'example.txt', value: stepTwo})
  )

  await t.test('should show only messages for this commit', async function () {
    assert.deepEqual(fileInitial.messages.map(String), [
      'example.txt:5:1-5:6: No lorem!'
    ])
  })

  const resultCurrent = await exec('git branch --show-current')
  const main = resultCurrent.stdout.trim()

  await exec('git checkout -b other-branch')

  // Change file.
  await write({path: 'example.txt', value: stepThree})
  await exec('git add example.txt')
  await exec('git commit -m three')
  await write({path: 'example.txt', value: stepFour})
  await exec('git add example.txt')
  await exec('git commit -m four')
  const final = await exec('git rev-parse HEAD')

  process.env.GITHUB_SHA = final.stdout.trim()
  process.env.GITHUB_BASE_REF = 'refs/heads/' + main
  process.env.GITHUB_HEAD_REF = 'refs/heads/other-branch'

  const fileFour = await processor().process(
    new VFile({path: 'example.txt', value: stepFour})
  )

  await t.test('should deal with PRs', async function () {
    assert.deepEqual(fileFour.messages.map(String), [
      'example.txt:1:1-1:6: No lorem!',
      'example.txt:9:7-9:12: No lorem!'
    ])
  })

  delete process.env.GITHUB_SHA
  delete process.env.GITHUB_BASE_REF
  delete process.env.GITHUB_HEAD_REF

  await fs.rm(new URL('.git', import.meta.url), {
    recursive: true
  })
  await fs.rm(new URL('example.txt', import.meta.url))
})
