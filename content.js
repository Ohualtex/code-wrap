"use strict";

(() => {
  const attribute = "data-code-wrap-enabled";
  const siteAttribute = "data-code-wrap-site";
  const site = {
    "chatgpt.com": "chatgpt",
    "gemini.google.com": "gemini",
    "claude.ai": "claude",
  }[location.hostname];
  if (!site) {
    return;
  }
  let revision = 0;
  let enabled = false;

  function render() {
    if (document.documentElement) {
      if (enabled) {
        document.documentElement.setAttribute(siteAttribute, site);
      } else {
        document.documentElement.removeAttribute(siteAttribute);
      }
      document.documentElement.toggleAttribute(attribute, enabled);
    }
  }

  function apply(value) {
    enabled = value !== false;
    render();
  }

  // At document_start the root can be absent. This one-shot event avoids polling.
  document.addEventListener("DOMContentLoaded", render, { once: true });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && Object.hasOwn(changes, "enabled")) {
      revision += 1;
      apply(changes.enabled.newValue);
    }
  });

  const initialRevision = revision;
  chrome.storage.local.get("enabled").then(
    (result) => {
      // A change received while this read was pending is more recent.
      if (revision === initialRevision) {
        apply(result.enabled);
      }
    },
    (error) => console.error("Code Wrap could not read its setting.", error),
  );
})();
