// Watches one AI tab: is a reply being written right now? Reads only the page's buttons and title, never the chat.
(() => {
  const host = location.hostname;
  const site = /claude\.ai$/.test(host) ? "claude" : /chatgpt\.com$/.test(host) ? "chatgpt" : /gemini\.google\.com$/.test(host) ? "gemini" : null;
  if (!site) return;
  // Each site shows a Stop button while it writes. Selectors are best effort: sites change them.
  const STOP = {
    claude: 'button[aria-label="Stop response"], button[aria-label*="Stop" i][data-testid*="stop" i], fieldset button[aria-label*="stop" i]',
    chatgpt: 'button[data-testid="stop-button"], button[aria-label*="Stop streaming" i], button[aria-label*="Stop generating" i]',
    gemini: 'button[aria-label*="Stop response" i], button.stop, button[aria-label*="Stop" i][class*="send" i]'
  };
  let last = "", lastSent = 0;
  const report = () => {
    let generating = false;
    try { generating = !!document.querySelector(STOP[site]); } catch { }
    const state = generating ? "generating" : "done";
    const title = document.title || "";
    const key = state + "|" + title;
    if (key === last && Date.now() - lastSent < 30000) return; // heartbeat every 30s keeps the tab alive on the panel
    last = key; lastSent = Date.now();
    try { chrome.runtime.sendMessage({ type: "status", site, state, title }); } catch { }
  };
  new MutationObserver(() => { clearTimeout(report.t); report.t = setTimeout(report, 400); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-label", "data-testid"] });
  setInterval(report, 5000);
  addEventListener("pagehide", () => { try { chrome.runtime.sendMessage({ type: "status", site, state: "closed", title: "" }); } catch { } });
  report();
})();
