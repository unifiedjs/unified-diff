# unified-diff

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[**unified**][unified] plugin to ignore unrelated messages.
Currently works in PRs on Travis and GitHub Actions.

When working with natural language, having tools that check cumbersome tasks
can be very useful (think [alex][] or [retext][] plugins).
However, natural language isn’t as strict as code.
Integrating natural language checking in a CI often doesn’t work well due to
false positives.
It’s possible to add a long list of exceptions, but this soon becomes
unmanageable.

This plugin solves that problem, when in CIs, by ignoring any messages on
unchanged lines.
When run outside supported CIs this plugin doesn’t do anything.

## Install

[npm][]:

```sh
npm install unified-diff
```

## Use

Say we have this `readme.md`.
Note the `an an`.

```markdown
This is an an example.
```

Then, someone creates a PR which adds the following diff:

```diff
diff --git a/readme.md b/readme.md
index 360b225..5a96b86 100644
--- a/readme.md
+++ b/readme.md
@@ -1 +1,3 @@
 This is an an example.
+
+Some more more text. A error.
```

We have some natural language checking in `lint.js`:

```js
var diff = require('unified-diff')
var vfile = require('to-vfile')
var unified = require('unified')
var markdown = require('remark-parse')
var stringify = require('remark-stringify')
var remark2retext = require('remark-retext')
var english = require('retext-english')
var repetition = require('retext-repeated-words')
var article = require('retext-indefinite-article')
var report = require('vfile-reporter')

vfile.read('readme.md', function (err, file) {
  if (err) throw err

  unified()
    .use(markdown)
    .use(remark2retext, unified().use(english).use(repetition).use(article))
    .use(stringify)
    .use(diff)
    .process(file, function (err) {
      console.error(report(err || file))
      process.exit(err || file.messages.length ? 1 : 0)
    })
})
```

`lint.js` is hooked up to run on Travis in `.travis.yml` like so:

```yml
# ...
script:
- npm test
- node lint.js
# ...
```

(or in an equivalent GH Actions workflow file)

When run in CI, we’ll see the following printed on **stderr**(4).
Note that `an an` on L1 is not included because it’s unrelated to this PR.

```txt
readme.md
   3:6-3:15  warning  Expected `more` once, not twice   retext-repeated-words      retext-repeated-words
  3:22-3:23  warning  Use `An` before `error`, not `A`  retext-indefinite-article  retext-indefinite-article

⚠ 2 warnings
```

As there are messages, the build exits with `1`, thus failing CI.
The user sees this and amends the PR to the following:

```diff
diff --git a/readme.md b/readme.md
index 360b225..5a96b86 100644
--- a/readme.md
+++ b/readme.md
@@ -1 +1,3 @@
 This is an an example.
+
+Some more text. An error.
```

This time our lint task exits successfully, even though L1 would normally emit
an error, but it’s unrelated to the PR.

## API

### `processor.use(diff)`

Ignore messages emitted by plugins before `diff` for lines that did not change.

There are no options.
If there’s a `TRAVIS_COMMIT_RANGE`, `GITHUB_BASE_REF` and `GITHUB_HEAD_REF`, or
`GITHUB_SHA` environment variable, then this plugin runs, otherwise it does
nothing.

###### TODO

*   [ ] Add support for other CIs (ping if you want to work on this)
*   [ ] Add non-CI support (I’m not yet sure how though)

PRs welcome!

## Contribute

See [`contributing.md`][contributing] in [`unifiedjs/.github`][health] for ways
to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/unifiedjs/unified-diff/workflows/main/badge.svg

[build]: https://github.com/unifiedjs/unified-diff/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/unifiedjs/unified-diff.svg

[coverage]: https://codecov.io/github/unifiedjs/unified-diff

[downloads-badge]: https://img.shields.io/npm/dm/unified-diff.svg

[downloads]: https://www.npmjs.com/package/unified-diff

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/unifiedjs/unified/discussions

[npm]: https://docs.npmjs.com/cli/install

[health]: https://github.com/unifiedjs/.github

[contributing]: https://github.com/unifiedjs/.github/blob/HEAD/contributing.md

[support]: https://github.com/unifiedjs/.github/blob/HEAD/support.md

[coc]: https://github.com/unifiedjs/.github/blob/HEAD/code-of-conduct.md

[license]: license

[author]: https://wooorm.com

[unified]: https://github.com/unifiedjs/unified

[alex]: https://github.com/wooorm/alex

[retext]: https://github.com/retextjs/retext/blob/HEAD/doc/plugins.md#list-of-plugins
