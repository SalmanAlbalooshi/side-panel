// Web AI bridge: a small browser extension tells the panel when a claude.ai / chatgpt.com / gemini tab is
// writing a reply or has finished. Only the tab title and the state travel, never the chat text.
// Pairing: the extension asks, you tap Allow on the panel, the extension gets a key it sends with every update.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { webUrl } = require("./ai");

const PORT = Number(process.env.SP_WEB_PORT) || 47822; // tests use their own port so they never touch a running panel
const SITES = { claude: "Claude (web)", chatgpt: "ChatGPT (web)", gemini: "Gemini (web)" };
let tokenFile = null, token = null, onChange = () => { };
const tabs = new Map(); // id -> session-like object
let pendingPair = null;  // { at, res }
const hidden = new Set();  // tabs you hid; forgotten when the tab closes (tab ids are reused after a browser restart)
let pairedOrigin = null;
let server = null, listening = false;

function loadToken() {
  try { const j = JSON.parse(fs.readFileSync(tokenFile, "utf8")); token = j.token || null; pairedOrigin = j.origin || null; } catch { token = null; pairedOrigin = null; }
}
function okToken(t) {
  if (!token || typeof t !== "string" || t.length !== token.length) return false;
  return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(token));
}
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

function start(opts) {
  tokenFile = path.join(opts.dataDir, "web-token");
  onChange = opts.onChange || onChange;
  loadToken();
  server = http.createServer((req, res) => handle(req, res));
  server.headersTimeout = 10000;
  server.requestTimeout = 90000;
  server.maxConnections = 32;
  server.on("error", () => { listening = false; setTimeout(() => { try { server.listen(PORT, "127.0.0.1"); } catch { } }, 15000); });
  server.on("listening", () => { listening = true; });
  server.listen(PORT, "127.0.0.1");
  setInterval(() => { // tabs that stop reporting fade out
    let changed = false;
    for (const [id, t] of tabs) if (Date.now() - t.seen > 90000) { tabs.delete(id); changed = true; }
    if (changed) onChange();
  }, 30000);
}

function send(res, code, body, origin) {
  const h = { "Content-Type": "application/json" };
  if (origin) { h["Access-Control-Allow-Origin"] = origin; h["Access-Control-Allow-Headers"] = "Content-Type, X-Side-Panel-Web"; h["Access-Control-Allow-Methods"] = "POST, OPTIONS"; }
  res.writeHead(code, h); res.end(JSON.stringify(body || {}));
}

function handle(req, res) {
  const origin = req.headers.origin || "";
  // only the extension may talk here: web pages (http/https origins) are refused outright
  const extOrigin = /^(chrome|moz|edge)-extension:\/\/[a-z0-9-]+$/i.test(origin) ? origin : "";
  if (origin && !extOrigin) return send(res, 403, { error: "origin" });
  if (req.method === "OPTIONS") return send(res, 200, {}, extOrigin);
  if (req.method !== "POST") return send(res, 405, {}, extOrigin);
  const chunks = []; let size = 0;
  req.on("data", (c) => { size += c.length; if (size > 64 * 1024) { req.destroy(); return; } chunks.push(c); });
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return send(res, 400, { error: "json" }, extOrigin); }
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};
    // only the extension that was paired may send updates
    const fromPaired = !pairedOrigin || extOrigin === pairedOrigin;
    if (req.url === "/web/pair") {
      if (!extOrigin) return send(res, 403, { error: "origin" });
      return pair(res, extOrigin);
    }
    if (req.url === "/web/ping") return send(res, okToken(req.headers["x-side-panel-web"]) && fromPaired ? 200 : 401, { ok: true }, extOrigin);
    if (req.url === "/web/status") {
      if (!okToken(req.headers["x-side-panel-web"]) || !fromPaired) return send(res, 401, { error: "pair again" }, extOrigin);
      try { update(body); } catch { }
      return send(res, 200, { ok: true }, extOrigin);
    }
    send(res, 404, {}, extOrigin);
  });
}

// For a few minutes after you tap Set up on the panel, the first extension that asks is accepted without a tap.
let autoUntil = 0;
function autoAllow(ms) { autoUntil = Date.now() + ms; }
function pair(res, origin) {
  // one request at a time: a second one can't swap itself in while you're deciding
  if (pendingPair) return send(res, 409, { error: "Another browser is already asking. Answer it on the panel first" }, origin);
  pendingPair = { at: Date.now(), res, origin };
  if (Date.now() < autoUntil) { autoUntil = 0; return answerPair(true); }
  const mine = pendingPair;
  res.on("close", () => { if (pendingPair === mine) { pendingPair = null; onChange(); } });
  setTimeout(() => { if (pendingPair === mine) { pendingPair = null; send(res, 408, { error: "No answer on the panel" }, origin); onChange(); } }, 60000);
  onChange();
}
function answerPair(allow) {
  const p = pendingPair; pendingPair = null;
  if (!p) return { error: "No browser is asking" };
  if (!allow) { send(p.res, 403, { error: "Declined on the panel" }, p.origin); return { ok: true }; }
  token = crypto.randomBytes(24).toString("hex");
  pairedOrigin = p.origin || null;
  try { fs.writeFileSync(tokenFile, JSON.stringify({ token, origin: pairedOrigin })); } catch { }
  send(p.res, 200, { token }, p.origin);
  return { ok: true, toast: "Browser connected" };
}

function update(b) {
  const tab = String(b.tab | 0);
  if (b.state === "closed") { for (const s of Object.keys(SITES)) { tabs.delete("web:" + s + ":" + tab); hidden.delete("web:" + s + ":" + tab); } onChange(); return; }
  const site = SITES[b.site] ? b.site : null;
  if (!site) return;
  const id = "web:" + site + ":" + tab;
  if (hidden.has(id)) return;
  const prev = tabs.get(id);
  const state = b.state === "generating" ? "working" : b.state === "done" ? "yourturn" : "idle";
  const title = clean(b.title, 80).replace(/\s*[-|]\s*(Claude|ChatGPT|Gemini)\s*$/i, "") || SITES[site];
  const now = Date.now();
  const t = prev || { id, source: "web", provider: SITES[site], site, started: now, feed: [], plan: [], files: 0, done: 0, total: 0 };
  // sites rename a chat right after a reply; only a state change counts as news
  const changed = !prev || prev.state !== state;
  const retitled = prev && prev.project !== title;
  // "done" only means something if it was writing first; a tab you just opened stays idle
  const finished = prev && prev.state === "working" && state === "yourturn";
  Object.assign(t, {
    project: title, title, seen: now,
    state: state === "yourturn" && !(finished || (prev && prev.state === "yourturn")) ? "idle" : state,
    now: state === "working" ? "Writing a reply" : finished || (prev && prev.state === "yourturn" && state === "yourturn") ? "Reply ready" : "Open",
    summary: finished || (prev && prev.state === "yourturn" && state === "yourturn") ? "Reply ready in your browser" : ""
  });
  if (changed) t.updated = now;
  tabs.set(id, t);
  if (tabs.size > 30) tabs.delete(tabs.keys().next().value);
  if (changed || retitled) onChange();
}
function hide(id) { hidden.add(id); if (hidden.size > 200) hidden.delete(hidden.values().next().value); tabs.delete(id); onChange(); }

function sessions() { return [...tabs.values()].filter((t) => t.state !== "idle" || Date.now() - t.updated < 10 * 60000); }
function status() { return { listening, paired: !!token, asking: !!pendingPair, tabs: tabs.size }; }

// Asking a web AI: Claude and ChatGPT accept the question in the link; Gemini doesn't, so it goes on the clipboard.
function ask(id, q, { shell, clipboard }) {
  q = String(q || "").slice(0, 6000);
  if (id === "copilot-web") { clipboard.writeText(q); shell.openExternal(webUrl(id, q)); return { ok: true, web: true, toast: "Copilot opened on your main screen. Your question is copied: press Ctrl+V" }; }
  if (id === "gemini-web") { clipboard.writeText(q); shell.openExternal(webUrl(id, q)); return { ok: true, web: true, toast: "Gemini opened on your main screen. Your question is copied: press Ctrl+V" }; }
  shell.openExternal(webUrl(id, q));
  return { ok: true, web: true, toast: "Opened on your main screen" };
}

module.exports = { start, sessions, status, answerPair, ask, update, hide, autoAllow, PORT };
