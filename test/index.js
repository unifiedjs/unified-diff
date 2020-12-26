'use strict'

var cp = require('child_process')
var path = require('path')
var promisify = require('util').promisify
var test = require('tape')
var rimraf = promisify(require('rimraf'))
var vfile = require('to-vfile')
var processor = require('./processor')()

var exec = promisify(cp.exec)

var range = process.env.TRAVIS_COMMIT_RANGE
var sha = process.env.GITHUB_SHA
var base = process.env.GITHUB_BASE_REF
var head = process.env.GITHUB_HEAD_REF

// Remove potential variables that we’re testing on CIs.
delete process.env.TRAVIS_COMMIT_RANGE
delete process.env.GITHUB_SHA
delete process.env.GITHUB_BASE_REF
delete process.env.GITHUB_HEAD_REF

var current = process.cwd()

process.chdir(path.join(current, 'test'))

test('diff() (travis)', function (t) {
  var stepOne = [
    'Lorem ipsum dolor sit amet.',
    '',
    'Lorem ipsum. Dolor sit amet.',
    ''
  ].join('\n')
  var stepTwo = stepOne + '\nLorem ipsum.'
  var stepThree = 'Lorem.\n' + stepOne + '\nLorem.'
  var other = 'Lorem ipsum.'
  var initial
  var final

  t.plan(7)

  exec('git init')
    // Set up.
    .then(() => exec('git config --global user.email').catch(setEmailAndName))
    // Add initial file.
    .then(() =>
      processor.process(vfile({path: 'example.txt', contents: stepOne}))
    )
    .then((file) => {
      t.deepEqual(
        file.messages.map(String),
        ['example.txt:1:1-1:6: No lorem!', 'example.txt:3:1-3:6: No lorem!'],
        'should set messages'
      )

      return vfile.write(file)
    })
    .then(() => exec('git add example.txt'))
    .then(() => exec('git commit -m one'))
    .then(() => exec('git rev-parse HEAD'))
    .then((result) => {
      initial = result.stdout.trim()
    })
    // Change files.
    .then(() => vfile.write({path: 'example.txt', contents: stepTwo}))
    .then(() => exec('git add example.txt'))
    .then(() => exec('git commit -m two'))
    .then(() => exec('git rev-parse HEAD'))
    .then((result) => {
      final = result.stdout.trim()
      process.env.TRAVIS_COMMIT_RANGE = [initial, final].join('...')
      return processor.process(vfile({path: 'example.txt', contents: stepTwo}))
    })
    .then((file) => {
      t.deepEqual(
        file.messages.map(String),
        ['example.txt:5:1-5:6: No lorem!'],
        'should show only messages for changed lines'
      )
    })
    // Again!
    .then(() =>
      processor.process(vfile({path: 'example.txt', contents: stepTwo}))
    )
    .then((file) => {
      t.deepEqual(
        file.messages.map(String),
        ['example.txt:5:1-5:6: No lorem!'],
        'should not recheck (coverage for optimisations)'
      )
    })
    // Unstaged files.
    .then(() =>
      processor.process(vfile({path: 'missing.txt', contents: other}))
    )
    .then((file) => {
      t.deepEqual(file.messages.map(String), [], 'should ignore unstaged files')
    })
    // New file.
    .then(() => vfile.write({path: 'example.txt', contents: stepThree}))
    .then(() => vfile.write({path: 'new.txt', contents: other}))
    .then(() => exec('git add example.txt new.txt'))
    .then(() => exec('git commit -m three'))
    .then(() => exec('git rev-parse HEAD'))
    .then((result) => {
      final = result.stdout.trim()

      process.env.TRAVIS_COMMIT_RANGE = [initial, final].join('...')

      return processor.process(
        vfile({path: 'example.txt', contents: stepThree})
      )
    })
    .then((file) => {
      t.deepEqual(
        file.messages.map(String),
        ['example.txt:1:1-1:6: No lorem!', 'example.txt:6:1-6:6: No lorem!'],
        'should deal with multiple patches'
      )

      return processor.process(vfile({path: 'new.txt', contents: other}))
    })
    .then((file) => {
      t.deepEqual(
        file.messages.map(String),
        ['new.txt:1:1-1:6: No lorem!'],
        'should deal with new files'
      )

      return processor.process(vfile({path: 'new.txt', contents: other}))
    })
    // Restore
    .then(restore, restore)
    .then(
      () => t.pass('should pass'),
      (error) => t.ifErr(error, 'should not fail')
    )

  function restore() {
    delete process.env.TRAVIS_COMMIT_RANGE
    return rimraf('.git')
      .then(() => rimraf('new.txt'))
      .then(() => rimraf('example.txt'))
  }
})

test('diff() (GitHub Actions)', function (t) {
  var stepOne = [
    'Lorem ipsum dolor sit amet.',
    '',
    'Lorem ipsum. Dolor sit amet.',
    ''
  ].join('\n')
  var stepTwo = stepOne + '\nLorem ipsum.\n'
  var stepThree = 'Lorem.\n\n' + stepOne + '\nAlpha bravo.\n'
  var stepFour = stepThree + '\nIpsum lorem.\n'
  var main

  t.plan(3)

  exec('git init')
    // Add initial file.
    .then(() => vfile.write({path: 'example.txt', contents: stepOne}))
    .then(() => exec('git add example.txt'))
    .then(() => exec('git commit -m one'))
    // Change file.
    .then(() => vfile.write({path: 'example.txt', contents: stepTwo}))
    .then(() => exec('git add example.txt'))
    .then(() => exec('git commit -m two'))
    .then(() => exec('git rev-parse HEAD'))
    .then((result) => {
      process.env.GITHUB_SHA = result.stdout.trim()
      return processor.process(vfile({path: 'example.txt', contents: stepTwo}))
    })
    .then((file) => {
      t.deepEqual(
        file.messages.map(String),
        ['example.txt:5:1-5:6: No lorem!'],
        'should show only messages for this commit'
      )
    })
    // A PR.
    .then(() => exec('git branch --show-current'))
    .then((result) => {
      main = result.stdout.trim()
      exec('git checkout -b other-branch')
    })
    // Change file.
    .then(() => vfile.write({path: 'example.txt', contents: stepThree}))
    .then(() => exec('git add example.txt'))
    .then(() => exec('git commit -m three'))
    .then(() => vfile.write({path: 'example.txt', contents: stepFour}))
    .then(() => exec('git add example.txt'))
    .then(() => exec('git commit -m four'))
    .then(() => exec('git rev-parse HEAD'))
    .then((result) => {
      process.env.GITHUB_SHA = result.stdout.trim()
      process.env.GITHUB_BASE_REF = 'refs/heads/' + main
      process.env.GITHUB_HEAD_REF = 'refs/heads/other-branch'
      return processor.process(vfile({path: 'example.txt', contents: stepFour}))
    })
    .then((file) => {
      t.deepEqual(
        file.messages.map(String),
        ['example.txt:1:1-1:6: No lorem!', 'example.txt:9:7-9:12: No lorem!'],
        'should deal with PRs'
      )
    })
    // Restore
    .then(restore, restore)
    .then(
      () => t.pass('should pass'),
      (error) => t.ifErr(error, 'should not fail')
    )

  function restore() {
    delete process.env.GITHUB_SHA
    delete process.env.GITHUB_BASE_REF
    delete process.env.GITHUB_HEAD_REF
    return rimraf('.git').then(() => rimraf('example.txt'))
  }
})

process.on('exit', function () {
  process.env.TRAVIS_COMMIT_RANGE = range
  process.env.GITHUB_SHA = sha
  process.env.GITHUB_BASE_REF = base
  process.env.GITHUB_HEAD_REF = head
  process.chdir(path.join(current))
})

function setEmailAndName() {
  return exec('git config --global user.email info@example.com').then(setEmail)
}

function setEmail() {
  return exec('git config --global user.name Ex Ample')
}
