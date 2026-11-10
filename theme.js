"use strict";

const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id === chrome.runtime.id && message?.type === "get-color-scheme") {
    sendResponse({ dark: colorScheme.matches });
  }
});

colorScheme.addEventListener("change", ({ matches }) => {
  chrome.runtime.sendMessage({ type: "color-scheme-changed", dark: matches }).catch((error) => {
    console.warn("Code Wrap could not send the preferred color scheme.", error);
  });
});
