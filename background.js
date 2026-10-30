"use strict";

let pending = Promise.resolve();

async function updateAction(enabled) {
  await Promise.all([
    chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" }),
    chrome.action.setBadgeBackgroundColor({ color: enabled ? "#176B45" : "#596273" }),
    chrome.action.setTitle({
      title: `Code Wrap: ${enabled ? "on" : "off"} on all supported sites. Click to ${enabled ? "disable" : "enable"}.`,
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
        chrome.action.setTitle({ title: "Code Wrap: setting unavailable. Click to retry." }),
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
