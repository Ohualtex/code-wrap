"use strict";

let pending = Promise.resolve();

async function updateAction(enabled) {
  const state = enabled ? "on" : "off";
  await Promise.all([
    chrome.action.setIcon({
      path: {
        16: `icons/wrap-${state}-16.png`,
        32: `icons/wrap-${state}-32.png`,
        48: `icons/wrap-${state}-48.png`,
        128: `icons/wrap-${state}-128.png`,
      },
    }),
    chrome.action.setBadgeText({ text: "" }),
    chrome.action.setTitle({
      title: `Code Wrap: wrapping ${state}. Click to turn ${enabled ? "off" : "on"}.`,
    }),
  ]);
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

chrome.runtime.onInstalled.addListener(() => enqueue(refreshAction));
chrome.runtime.onStartup.addListener(() => enqueue(refreshAction));
enqueue(refreshAction);
