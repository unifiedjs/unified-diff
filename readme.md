# unified-diff

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[unified][]** plugin to ignore unrelated messages in GitHub Actions and
Travis.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`unified().use(unifiedDiff)`](#unifieduseunifieddiff)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a [unified][] plugin to ignore unrelated lint messages in a CI.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**vfile** is the virtual file interface used in unified which manages messages.
This is a unified plugin that filters messages on the vfile.

## When should I use this?

You can use this plugin when you are dealing with a large, existing project.

Using tools that check whether things follow a style guide is typically very
useful.
However, it can be hard to start using something in a large existing project.
This plugin helps, because it ignores messages that occur in lines that are not
touched by a PR in a CI.
When this plugin is used outside of a supported CIs, it doesn’t do anything.

## Install

This package is [ESM only][esm].
In Node.js (version 12.20+, 14.14+, 16.0+, or 18.0+), install with [npm][]:

```sh
npm install unified-diff
```

In Deno with [`esm.sh`][esmsh]:

```js
import unifiedDiff from 'https://esm.sh/unified-diff@4'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import unifiedDiff from 'https://esm.sh/unified-diff@4?bundle'
</script>
```

## Use

Say our document `example.md` contains:

```markdown
This is an an example.
```

> 👉 **Note**: `an an` is a typo.

…and our module `example.js` looks as follows:

```js
import {read} from 'to-vfile'
import {reporter} from 'vfile-reporter'
import {unified} from 'unified'
import unifiedDiff from 'unified-diff'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkRetext from 'remark-retext'
import retextEnglish from 'retext-english'
import retextRepeatedWords from 'retext-repeated-words'
import retextIndefiniteArticle from 'retext-indefinite-article'

const file = unified()
  .use(remarkParse)
  .use(
    remarkRetext,
    unified()
      .use(retextEnglish)
      .use(retextRepeatedWords)
      .use(retextIndefiniteArticle)
  )
  .use(remarkStringify)
  .use(unifiedDiff)
  .process(await read('example.md'))

console.error(reporter(file))
process.exit(file.messages.length > 0 ? 1 : 0)
```

…and our Travis configuration `.travis.yml` contains:

```yml
# …
script:
- npm test
- node example.js
# …
```

> 👉 **Note**: an equivalent GH Actions workflow file is also supported.

Then, say someone creates a PR which adds the following diff:

```diff
diff --git a/example.md b/example.md
index 360b225..5a96b86 100644
--- a/example.md
+++ b/example.md
@@ -1 +1,3 @@
 This is an an example.
+
+Some more more text. A error.
```

> 👉 **Note**: `more more` and `A` before `error` are typos.

When run in CI, we’ll see the following printed on **stderr**(4).

```txt
example.md
   3:6-3:15  warning  Expected `more` once, not twice   retext-repeated-words      retext-repeated-words
  3:22-3:23  warning  Use `An` before `error`, not `A`  retext-indefinite-article  retext-indefinite-article

⚠ 2 warnings
```

> 👉 **Note**: `an an` on L1 is not included because it’s unrelated to this PR.

The build exits with `1` as there are messages, thus failing CI.
The user sees this and amends the PR to the following:

```diff
diff --git a/example.md b/example.md
index 360b225..5a96b86 100644
--- a/example.md
+++ b/example.md
@@ -1 +1,3 @@
 This is an an example.
+
+Some more text. An error.
```

This time our lint task exits successfully, even though L1 would normally emit
an error, but it’s unrelated to the PR.

## API

This package exports no identifiers.
The default export is `unifiedDiff`.

### `unified().use(unifiedDiff)`

Ignore unrelated messages in GitHub Actions and Travis.

There are no options.
If there’s a `TRAVIS_COMMIT_RANGE`, `GITHUB_BASE_REF` and `GITHUB_HEAD_REF`, or
`GITHUB_SHA` environment variable, then this plugin runs, otherwise it does
nothing.

###### To do

*   [ ] Add support for other CIs (ping if you want to work on this)
*   [ ] Add non-CI support (I’m not sure how though)

PRs welcome!

## Types

This package is fully typed with [TypeScript][].
There are no additional exported types.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, 16.0+, and 18.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

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

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[esmsh]: https://esm.sh

[typescript]: https://www.typescriptlang.org

[health]: https://github.com/unifiedjs/.github

[contributing]: https://github.com/unifiedjs/.github/blob/main/contributing.md

[support]: https://github.com/unifiedjs/.github/blob/main/support.md

[coc]: https://github.com/unifiedjs/.github/blob/main/code-of-conduct.md

[license]: license

[author]: https://wooorm.com

[unified]: https://github.com/unifiedjs/unified
