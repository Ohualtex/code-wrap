# Code Wrap

A small Manifest V3 extension that automatically wraps long lines in classic
response code blocks on **ChatGPT**, **Google Gemini**, and **Claude**.

## Install locally

1. Open `chrome://extensions` in Chrome, `edge://extensions` in Edge, or
   `brave://extensions` in Brave.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this folder (the one containing
   `manifest.json`).
4. Refresh any supported pages that were already open when you installed or
   reloaded the extension. New pages are handled automatically.
5. Pin Code Wrap to the toolbar if you want quick access to its switch.

There is no build step and no package installation.

## Use

Code Wrap is on by default. Click its toolbar icon to toggle wrapping across
all three supported sites and all their open tabs. A bent return arrow means
wrapping is on; a straight right arrow means it is off. Hover over the icon to
see the current state and what clicking will do. Your choice is saved locally
and survives a browser restart.
A **!** badge means the setting could not be updated; click again to retry.

The monochrome icons have transparent backgrounds. SVG sources and PNG outputs
at 16, 32, 48, and 128 pixels are included in `icons/`.

When off, Code Wrap's styles no longer apply. Each site resumes its own current
layout, including any native wrapping preference you selected on that site.

Only identified classic response code blocks are eligible. Normal paragraphs,
inline code, tables, editable areas, Monaco, CodeMirror, and writing editors are
outside the scope. Claude Artifacts are not supported. An unrecognized code
block layout is left alone rather than targeted with a broad fallback.

## Privacy and implementation

- Works only on `https://chatgpt.com/*`, `https://gemini.google.com/*`, and
  `https://claude.ai/*` in the top-level document.
- Uses the `storage` permission only, to save a single global `enabled` setting.
- Does not read, rewrite, save, or transmit conversation text.
- Does not intercept copy actions, rewrite code, or add newline characters.
- Uses site-specific CSS and a small settings controller. No polling, DOM
  observer, external dependencies, analytics, server, or network requests.

Wrapping is visual: long tokens can break across display lines, and code blocks
become taller. The source text remains unchanged. Native copy controls and manual
selection still need verification when a site's renderer changes.

## Compatibility and validation

The initial selectors were inspected in Chrome on October 30, 2026. Sites may
change their markup or offer different layouts to different accounts. Current
coverage includes ChatGPT's highlighted `pre > code` blocks and its plain-text
blocks without `pre`, Gemini's `code-block` components, and Claude's classic
response blocks. Older or different renderers are not automatically covered.

The extension targets current Chromium browsers. Edge and Brave have not yet
been verified. Live extension acceptance testing is pending local installation;
DOM inspection alone is not proof that every acceptance criterion passes.

Run the dependency-free controller tests and syntax checks with Node.js:

```sh
node --test tests/controllers.test.cjs
node --check background.js
node --check content.js
```

For a live check, use disposable new chats containing a long JavaScript call,
a long URL, single-line JSON, indented code, inline code, a paragraph, and a table.
Verify wrapping during streaming, original copy output, unchanged excluded areas,
and restoration when disabled. Also check navigation, refresh, multiple tabs,
narrow windows, and browser restart. A disappearing scrollbar alone does not
prove that text remains visible.
