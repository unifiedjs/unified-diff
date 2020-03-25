'use strict'

var cp = require('child_process')
var path = require('path')
var promisify = require('util').promisify
var test = require('tape')
var rimraf = promisify(require('rimraf'))
var vfile = require('to-vfile')
var processor = require('./processor')()

var exec = promisify(cp.exec)

test('diff()', function (t) {
  var current = process.cwd()
  var range = process.env.TRAVIS_COMMIT_RANGE
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

  delete process.env.TRAVIS_COMMIT_RANGE

  t.plan(7)

  process.chdir(path.join(current, 'test'))

  exec('git init')
    // Set up.
    .then(() => {
      return exec('git config --global user.email').catch(oncatch)

      function oncatch() {
        return exec('git config --global user.email info@example.com').then(
          onemail
        )
      }

      function onemail() {
        return exec('git config --global user.name Ex Ample')
      }
    })
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
      return vfile.write({path: 'example.txt', contents: stepTwo})
    })
    // Changed files.
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

      return file
    })
    // Again!
    .then(() => {
      return processor.process(vfile({path: 'example.txt', contents: stepTwo}))
    })
    .then((file) => {
      t.deepEqual(
        file.messages.map(String),
        ['example.txt:5:1-5:6: No lorem!'],
        'should not recheck (coverage for optimisations)'
      )
    })
    // Unstages files.
    .then(() => {
      return processor.process(vfile({path: 'missing.txt', contents: other}))
    })
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
    process.env.TRAVIS_COMMIT_RANGE = range
    return rimraf('.git')
      .then(() => rimraf('new.txt'))
      .then(() => rimraf('example.txt'))
  }
})
