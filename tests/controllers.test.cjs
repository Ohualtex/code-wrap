"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const settle = () => new Promise((resolve) => setImmediate(resolve));

function event() {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    emit(...args) { for (const listener of listeners) listener(...args); },
    get size() { return listeners.length; },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function background(initial = {}) {
  const stored = { ...initial };
  const writes = [];
  const errors = [];
  const changed = event();
  const clicked = event();
  const installed = event();
  const startup = event();
  const toolbar = {};
  let failNextWrite = false;
  const chrome = {
    action: {
      onClicked: clicked,
      async setIcon({ path: icons }) { toolbar.icon = { ...icons }; },
      async setBadgeText({ text }) { toolbar.badge = text; },
      async setBadgeBackgroundColor({ color }) { toolbar.color = color; },
      async setTitle({ title }) { toolbar.title = title; },
    },
    storage: {
      onChanged: changed,
      local: {
        async get() { return { ...stored }; },
        async set(values) {
          if (failNextWrite) {
            failNextWrite = false;
            throw new Error("Storage unavailable");
          }
          const oldValue = stored.enabled;
          stored.enabled = values.enabled;
          writes.push(values.enabled);
          changed.emit({ enabled: { oldValue, newValue: values.enabled } }, "local");
        },
      },
    },
    runtime: { onInstalled: installed, onStartup: startup },
  };
  vm.runInNewContext(source("background.js"), {
    chrome, console: { error: (...args) => errors.push(args) },
  });
  return {
    stored, writes, errors, changed, clicked, installed, startup, toolbar,
    failWrite() { failNextWrite = true; },
  };
}

function content({ initial = {}, hostname = "chatgpt.com", rootPresent = true, read } = {}) {
  const attributes = new Map();
  const changed = event();
  const errors = [];
  const domEvents = new Map();
  const element = {
    setAttribute(key, value) { attributes.set(key, value); },
    removeAttribute(key) { attributes.delete(key); },
    toggleAttribute(key, force) {
      if (force) attributes.set(key, "");
      else attributes.delete(key);
    },
  };
  const document = {
    documentElement: rootPresent ? element : null,
    addEventListener(name, listener, options) { domEvents.set(name, { listener, options }); },
  };
  vm.runInNewContext(source("content.js"), {
    location: { hostname }, document,
    chrome: { storage: { onChanged: changed, local: { get: () => read || Promise.resolve(initial) } } },
    console: { error: (...args) => errors.push(args) },
  });
  return { attributes, changed, errors, domEvents, document, element };
}

test("manifest limits execution to the three approved HTTPS hosts", () => {
  const manifest = JSON.parse(source("manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts.length, 1);
  const script = manifest.content_scripts[0];
  assert.deepEqual(script.matches, [
    "https://chatgpt.com/*", "https://gemini.google.com/*", "https://claude.ai/*",
  ]);
  assert.notEqual(script.all_frames, true);
  assert.equal(script.run_at, "document_start");
  for (const file of [...script.js, ...script.css, manifest.background.service_worker]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);
  }
});

test("first run is on without writing an unnecessary default", async () => {
  const app = background();
  await settle();
  assert.equal(app.toolbar.badge, "");
  assert.equal(app.toolbar.icon[16], "icons/wrap-on-16.png");
  assert.equal(app.toolbar.title, "Code Wrap: wrapping on. Click to turn off.");
  assert.deepEqual(app.writes, []);
  app.clicked.emit();
  await settle();
  assert.equal(app.stored.enabled, false);
  assert.equal(app.toolbar.badge, "");
  assert.equal(app.toolbar.icon[16], "icons/wrap-off-16.png");
  assert.equal(app.toolbar.title, "Code Wrap: wrapping off. Click to turn on.");
});

test("rapid toolbar clicks are serialized without losing toggles", async () => {
  const app = background();
  for (let index = 0; index < 10; index += 1) app.clicked.emit();
  await settle();
  assert.deepEqual(app.writes, [false, true, false, true, false, true, false, true, false, true]);
  assert.equal(app.toolbar.badge, "");
  assert.equal(app.toolbar.icon[32], "icons/wrap-on-32.png");
});

test("a worker restart and install event preserve a saved off preference", async () => {
  const app = background({ enabled: false });
  app.startup.emit();
  app.installed.emit();
  await settle();
  assert.equal(app.toolbar.badge, "");
  assert.equal(app.toolbar.icon[16], "icons/wrap-off-16.png");
  assert.deepEqual(app.writes, []);
});

test("a failed write keeps the preference and a later click recovers", async () => {
  const app = background({ enabled: true });
  await settle();
  app.failWrite();
  app.clicked.emit();
  await settle();
  assert.equal(app.stored.enabled, true);
  assert.equal(app.toolbar.badge, "!");
  assert.equal(app.toolbar.icon[16], "icons/wrap-on-16.png");
  assert.equal(app.toolbar.title, "Code Wrap: could not update wrapping. Click to retry.");
  assert.equal(app.errors.length, 1);
  app.clicked.emit();
  await settle();
  assert.equal(app.stored.enabled, false);
  assert.equal(app.toolbar.badge, "");
  assert.equal(app.toolbar.icon[16], "icons/wrap-off-16.png");
});

test("toolbar icons follow settings changed outside the worker", async () => {
  const app = background();
  await settle();
  app.stored.enabled = false;
  app.changed.emit({ enabled: { newValue: false } }, "local");
  await settle();
  assert.equal(app.toolbar.icon[16], "icons/wrap-off-16.png");
  assert.equal(app.toolbar.title, "Code Wrap: wrapping off. Click to turn on.");
  delete app.stored.enabled;
  app.changed.emit({ enabled: { oldValue: false } }, "local");
  await settle();
  assert.equal(app.toolbar.icon[16], "icons/wrap-on-16.png");
});

test("both icon states ship valid RGBA PNGs at every advertised size", () => {
  const manifest = JSON.parse(source("manifest.json"));
  for (const size of [16, 32, 48, 128]) {
    assert.equal(manifest.icons[size], `icons/wrap-on-${size}.png`);
    assert.equal(manifest.action.default_icon[size], manifest.icons[size]);
    const states = ["on", "off"].map((state) => {
      const png = fs.readFileSync(path.join(root, "icons", `wrap-${state}-${size}.png`));
      assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert.equal(png.toString("ascii", 12, 16), "IHDR");
      assert.equal(png.readUInt32BE(16), size);
      assert.equal(png.readUInt32BE(20), size);
      assert.equal(png[24], 8);
      assert.equal(png[25], 6, "icons must include an alpha channel");
      return png;
    });
    assert.ok(!states[0].equals(states[1]), "on and off must have distinct graphics");
  }
});

test("each supported host gets its own scope; disabling removes both markers", async () => {
  for (const [hostname, site] of [
    ["chatgpt.com", "chatgpt"], ["gemini.google.com", "gemini"], ["claude.ai", "claude"],
  ]) {
    const app = content({ hostname });
    await settle();
    assert.equal(app.attributes.get("data-code-wrap-site"), site);
    assert.ok(app.attributes.has("data-code-wrap-enabled"));
    app.changed.emit({ enabled: { newValue: false } }, "local");
    assert.equal(app.attributes.size, 0);
  }
});

test("a delayed initial read cannot overwrite a newer off notification", async () => {
  const read = deferred();
  const app = content({ read: read.promise });
  app.changed.emit({ enabled: { newValue: false } }, "local");
  read.resolve({ enabled: true });
  await settle();
  assert.equal(app.attributes.size, 0);
});

test("a delayed initial read cannot overwrite a newer on notification", async () => {
  const read = deferred();
  const app = content({ read: read.promise });
  app.changed.emit({ enabled: { newValue: true } }, "local");
  read.resolve({ enabled: false });
  await settle();
  assert.ok(app.attributes.has("data-code-wrap-enabled"));
});

test("an absent document root is handled once the document is ready", async () => {
  const app = content({ rootPresent: false });
  await settle();
  assert.equal(app.attributes.size, 0);
  app.document.documentElement = app.element;
  const ready = app.domEvents.get("DOMContentLoaded");
  assert.equal(ready.options.once, true);
  ready.listener();
  assert.ok(app.attributes.has("data-code-wrap-enabled"));
});

test("unrelated storage events do not enable a disabled page; reset uses default on", async () => {
  const app = content({ initial: { enabled: false } });
  await settle();
  app.changed.emit({ enabled: { newValue: true } }, "sync");
  app.changed.emit({ other: { newValue: true } }, "local");
  assert.equal(app.attributes.size, 0);
  app.changed.emit({ enabled: { oldValue: false } }, "local");
  assert.ok(app.attributes.has("data-code-wrap-enabled"));
});

test("unsupported hosts are left alone", async () => {
  const app = content({ hostname: "unrelated.example.com" });
  await settle();
  assert.equal(app.changed.size, 0);
  assert.equal(app.attributes.size, 0);
});

test("a failed initial settings read leaves the page unchanged", async () => {
  const read = deferred();
  const app = content({ read: read.promise });
  read.reject(new Error("Storage unavailable"));
  await settle();
  assert.equal(app.attributes.size, 0);
  assert.equal(app.errors.length, 1);
});
