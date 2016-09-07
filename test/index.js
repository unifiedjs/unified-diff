/**
 * @author Titus Wormer
 * @copyright 2016 Titus Wormer
 * @license MIT
 * @module unified-diff
 * @fileoverview Test suite for `unified-diff`.
 */

'use strict';

/* Dependencies. */
var fs = require('fs');
var path = require('path');
var trough = require('trough');
var test = require('tape');
var execa = require('execa');
var rimraf = require('rimraf');
var vfile = require('to-vfile');
var processor = require('./processor')();

/* Tests. */
test('travisDiff()', function (t) {
  var current = process.cwd();
  var range = process.env.TRAVIS_COMMIT_RANGE;
  var stepOne = [
    'Lorem ipsum dolor sit amet.',
    '',
    'Lorem ipsum. Dolor sit amet.',
    ''
  ].join('\n');
  var stepTwo = stepOne + '\nLorem ipsum.';
  var stepThree = 'Lorem.\n' + stepOne + '\nLorem.';
  var other = 'Lorem ipsum.';
  var initial;

  delete process.env.TRAVIS_COMMIT_RANGE;

  t.plan(7);

  process.chdir(path.join(current, 'test'));

  trough()
    .use(function () {
      return execa('git', ['init']);
    })
    .use(function (result, next) {
      var file = vfile({path: 'example.txt', contents: stepOne});

      processor.process(file, function (err) {
        if (err) {
          return next(err);
        }

        t.deepEqual(
          file.messages.map(String),
          [
            'example.txt:1:1-1:6: No lorem!',
            'example.txt:3:1-3:6: No lorem!'
          ],
          'should set messages'
        );

        fs.writeFile(file.path, file.contents, next);
      });
    })
    .use(function () {
      return execa('git', ['config', '--global', 'user.email'])
        .catch(function () {
          return execa('git', ['config', '--global', 'user.email', 'info@example.com'])
            .then(function () {
              return execa('git', ['config', '--global', 'user.name', 'Ex Ample']);
            });
        });
    })
    .use(function () {
      return execa('git', ['add', 'example.txt']);
    })
    .use(function () {
      return execa('git', ['commit', '-m', 'one']);
    })
    .use(function () {
      return execa('git', ['rev-parse', 'HEAD']);
    })
    .use(function (result, next) {
      var file = vfile({path: 'example.txt', contents: stepTwo});

      initial = result.stdout;

      fs.writeFile(file.path, file.contents, next);
    })
    .use(function () {
      return execa('git', ['add', 'example.txt']);
    })
    .use(function () {
      return execa('git', ['commit', '-m', 'two']);
    })
    .use(function () {
      return execa('git', ['rev-parse', 'HEAD']);
    })
    .use(function (result, next) {
      var file = vfile({path: 'example.txt', contents: stepTwo});

      process.env.TRAVIS_COMMIT_RANGE = [initial, result.stdout].join('...');

      processor.process(file, function (err) {
        t.deepEqual(
          file.messages.join(''),
          'example.txt:5:1-5:6: No lorem!',
          'should show only messages for changed lines'
        );

        next(err);
      });
    })
    .use(function (result, next) {
      var file = vfile({path: 'example.txt', contents: stepTwo});

      processor.process(file, function (err) {
        t.deepEqual(
          file.messages.join(''),
          'example.txt:5:1-5:6: No lorem!',
          'should not recheck (coverage for optimisations)'
        );

        next(err);
      });
    })
    .use(function (result, next) {
      var file = vfile({path: 'missing.txt', contents: other});

      processor.process(file, function (err) {
        t.deepEqual(file.messages, [], 'should ignore unstaged files');
        next(err);
      });
    })
    .use(function (result, next) {
      var file = vfile({path: 'new.txt', contents: other});
      fs.writeFile(file.path, file.contents, next);
    })
    .use(function (result, next) {
      var file = vfile({path: 'example.txt', contents: stepThree});
      fs.writeFile(file.path, file.contents, next);
    })
    .use(function () {
      return execa('git', ['add', 'example.txt', 'new.txt']);
    })
    .use(function () {
      return execa('git', ['commit', '-m', 'three']);
    })
    .use(function () {
      return execa('git', ['rev-parse', 'HEAD']);
    })
    .use(function (result, next) {
      var file = vfile({path: 'example.txt', contents: stepTwo});

      process.env.TRAVIS_COMMIT_RANGE = [initial, result.stdout].join('...');

      processor.process(file, function (err) {
        t.deepEqual(
          file.messages.map(String),
          [
            'example.txt:1:1-1:6: No lorem!',
            'example.txt:5:1-5:6: No lorem!'
          ],
          'should deal with multiple patches'
        );

        next(err);
      });
    })
    .use(function (result, next) {
      var file = vfile({path: 'new.txt', contents: other});

      processor.process(file, function (err) {
        t.deepEqual(
          file.messages.join(''),
          'new.txt:1:1-1:6: No lorem!',
          'should deal with new files'
        );

        next(err);
      });
    })
    .use(function () {
      process.env.TRAVIS_COMMIT_RANGE = range;
    })
    .use(function (result, next) {
      rimraf('.git', next);
    })
    .use(function (result, next) {
      rimraf('new.txt', next);
    })
    .use(function (result, next) {
      rimraf('example.txt', next);
    })
    .run(function (err) {
      t.ifErr(err, 'should not fail');
    });
});
