// Passes tab states to the Side Panel on this PC (127.0.0.1 only). Holds the pairing key.
const BASE = "http://127.0.0.1:47822";

async function key() { const r = await chrome.storage.local.get("key"); return r.key || null; }

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "status" && sender.tab) {
    key().then((k) => {
      if (!k) return;
      fetch(BASE + "/web/status", { method: "POST", headers: { "Content-Type": "application/json", "X-Side-Panel-Web": k }, body: JSON.stringify({ site: msg.site, state: msg.state, title: msg.title, tab: sender.tab.id }) })
        .then((r) => { if (r.status === 401) chrome.storage.local.set({ problem: "The panel forgot this browser. Connect again." }); else chrome.storage.local.remove("problem"); })
        .catch(() => { });
    });
    return false;
  }
  if (msg.type === "pair") {
    fetch(BASE + "/web/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (r.ok && j.token) { await chrome.storage.local.set({ key: j.token }); await chrome.storage.local.remove("problem"); reply({ ok: true }); } else reply({ error: j.error || "Not connected" }); })
      .catch(() => reply({ error: "The Side Panel isn't running on this PC" }));
    return true;
  }
  if (msg.type === "check") {
    key().then((k) => {
      if (!k) return reply({ paired: false });
      fetch(BASE + "/web/ping", { method: "POST", headers: { "Content-Type": "application/json", "X-Side-Panel-Web": k }, body: "{}" })
        .then((r) => reply({ paired: r.ok, running: true })).catch(() => reply({ paired: true, running: false }));
    });
    return true;
  }
});
// Connect by itself right after install (the panel accepts it without a tap for a few minutes after you start setup).
async function autoPair() {
  if (await key()) return;
  try {
    const r = await fetch(BASE + "/web/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.token) { await chrome.storage.local.set({ key: j.token }); await chrome.storage.local.remove("problem"); }
  } catch { }
}
chrome.runtime.onInstalled.addListener(() => { autoPair(); });
chrome.runtime.onStartup.addListener(() => { autoPair(); });
chrome.tabs.onRemoved.addListener((tabId) => {
  key().then((k) => { if (k) fetch(BASE + "/web/status", { method: "POST", headers: { "Content-Type": "application/json", "X-Side-Panel-Web": k }, body: JSON.stringify({ site: "claude", state: "closed", tab: tabId }) }).catch(() => { }); });
});
