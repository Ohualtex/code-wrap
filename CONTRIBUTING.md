# Contributing to Code Wrap

## Report a bug

Open a [bug report](https://github.com/Ohualtex/code-wrap/issues/new?template=bug_report.md)
with the affected site, your Chrome and Code Wrap versions, and steps to
reproduce the issue. Mention whether the site's built-in word-wrap setting is
on or off, if available. Use sample code and remove private chat content from
screenshots.

## Set up locally

Clone the repository and follow the [local installation steps](README.md#install-locally)
to load it in Google Chrome. After editing the extension, reload it on
`chrome://extensions` and refresh the test tab.

## Test your change

Run these checks with Node.js:

```sh
node --test tests/controllers.test.cjs
node --check background.js
node --check content.js
```

For a site-specific change, use a test conversation with a long line in a classic
code block. Check that the line wraps when Code Wrap is on, that copying
preserves the original text, and that turning Code Wrap off restores the site's
display settings. Keep selectors scoped to classic response code blocks.
When adding a site, limit the extension's access to the required host.

## Open a pull request

Keep the change focused. Describe what changed, which sites you tested, and
how you verified the behavior. Link the related issue if there is one.
