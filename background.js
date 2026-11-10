"use strict";

const themeDocument = "theme.html";
let pending = Promise.resolve();
let darkTheme = true;

function updateIcon(enabled) {
  const state = enabled ? "on" : "off";
  const variant = darkTheme ? "" : "-light";
  const path = Object.fromEntries([16, 32, 48, 128].map((size) => [
    size, `icons/wrap-${state}${variant}-${size}.png`,
  ]));
  return chrome.action.setIcon({ path });
}

async function updateAction(enabled) {
  const state = enabled ? "on" : "off";
  await Promise.all([
    updateIcon(enabled),
    chrome.action.setBadgeText({ text: "" }),
    chrome.action.setTitle({
      title: `Code Wrap: wrapping ${state}. Click to turn ${enabled ? "off" : "on"}.`,
    }),
  ]);
}

async function readTheme() {
  if (!chrome.offscreen?.createDocument || !chrome.runtime.getContexts) return;

  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(themeDocument)],
    });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: themeDocument,
        reasons: ["MATCH_MEDIA"],
        justification: "Choose a readable toolbar icon for the preferred color scheme.",
      });
    }
    const response = await chrome.runtime.sendMessage({ type: "get-color-scheme" });
    if (typeof response?.dark === "boolean") darkTheme = response.dark;
  } catch (error) {
    console.warn("Code Wrap could not read the preferred color scheme.", error);
  }
}

async function refreshAction() {
  const { enabled } = await chrome.storage.local.get("enabled");
  await updateAction(enabled !== false);
}

function enqueue(operation) {
  // Serialize reads and writes so rapid clicks cannot overwrite one another.
  pending = pending.then(operation).catch(async (error) => {
    console.error("Code Wrap could not update its setting.", error);
    try {
      await Promise.all([
        chrome.action.setBadgeText({ text: "!" }),
        chrome.action.setBadgeBackgroundColor({ color: "#B3261E" }),
        chrome.action.setTitle({ title: "Code Wrap: could not update wrapping. Click to retry." }),
      ]);
    } catch (actionError) {
      console.error("Code Wrap could not update its toolbar status.", actionError);
    }
  });
}

chrome.action.onClicked.addListener(() => {
  enqueue(async () => {
    const { enabled } = await chrome.storage.local.get("enabled");
    const nextEnabled = enabled === false;
    await chrome.storage.local.set({ enabled: nextEnabled });
    await updateAction(nextEnabled);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && Object.hasOwn(changes, "enabled")) {
    enqueue(refreshAction);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL(themeDocument)
      || message?.type !== "color-scheme-changed" || typeof message.dark !== "boolean") return;

  enqueue(async () => {
    darkTheme = message.dark;
    try {
      const { enabled } = await chrome.storage.local.get("enabled");
      await updateIcon(enabled !== false);
    } catch (error) {
      console.warn("Code Wrap could not refresh the toolbar icon color.", error);
    }
  });
});

chrome.runtime.onInstalled.addListener(() => enqueue(refreshAction));
chrome.runtime.onStartup.addListener(() => enqueue(refreshAction));
enqueue(async () => {
  await readTheme();
  await refreshAction();
});
