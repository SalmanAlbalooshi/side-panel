// One-off patch: ambient screen, mouse/keyboard, chime, global shortcut, touch zoom lock, log text fixes.
const fs = require("fs");
const path = require("path");
const R = (f) => path.join(__dirname, "..", f);
const edit = (f, a, b) => { let s = fs.readFileSync(R(f), "utf8"); if (!s.includes(a)) throw new Error("missing in " + f + ": " + a.slice(0, 70)); s = s.replace(a, b); fs.writeFileSync(R(f), s); };

// --- log reader: ignore system/tool injections; better project names
edit("src/claude-logs.js", "if (t && !/^<(command|local-command|system)/.test(t.trim()) && !e.isMeta)", "if (t && !/^\\s*(<|\\[SYSTEM|Caveat:)/.test(t) && !e.isMeta)");
edit("src/claude-logs.js", '    const name = base(proj.cwd) || "session";', '    const name = base(proj.cwd) || path.basename(path.dirname(f.p)).split("-").filter(Boolean).pop() || "session";');

// --- main: idle detection, global shortcut, zoom lock, autoplay for the chime
edit("src/main.js", 'const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, desktopCapturer, clipboard, session } = require("electron");',
  'const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, desktopCapturer, clipboard, session, powerMonitor, globalShortcut } = require("electron");');
edit("src/main.js", "webPreferences: { preload: path.join(__dirname, \"preload.js\"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }",
  "webPreferences: { preload: path.join(__dirname, \"preload.js\"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: \"no-user-gesture-required\" }");
edit("src/main.js", '  win.loadFile(path.join(__dirname, "renderer", "index.html"));',
  '  win.loadFile(path.join(__dirname, "renderer", "index.html"));\n  win.webContents.on("did-finish-load", () => { try { win.webContents.setVisualZoomLevelLimits(1, 1); } catch { } });');
edit("src/main.js", '  poll("stats", async () => { live.stats = sys.stats(); }, 2000);',
  '  poll("stats", async () => { live.stats = sys.stats(); live.idleSec = powerMonitor.getSystemIdleTime(); live.away = !live.inGame && live.idleSec >= (cfg.ambientAfterMin || 5) * 60 && cfg.ambient !== false; }, 2000);');
edit("src/main.js", "  startPolling();\n", `  startPolling();
  if (!TEST) {
    try {
      globalShortcut.register("Control+Alt+Space", () => { if (!win) return; if (win.__sideScreen) win.setFocusable(true); win.showInactive(); win.focus(); win.webContents.send("open", "ask"); });
    } catch { }
  }
`);
edit("src/main.js", 'app.on("before-quit", () => { if (helper) helper.stop(); });', 'app.on("before-quit", () => { if (helper) helper.stop(); try { globalShortcut.unregisterAll(); } catch { } });');
edit("src/config.js", "    startWithWindows: false,", "    startWithWindows: false,\n    ambient: true,\n    ambientAfterMin: 5,\n    chime: true,");

// --- renderer: open "ask" from the shortcut properly
edit("src/renderer/app.js", 'window.panel.onOpen((what) => openSheet(what === "settings" ? "screens" : what));', 'window.panel.onOpen((what) => { D.ui.wakeUntil = Date.now() + 120000; openSheet(what === "settings" ? "screens" : what); });');

// --- renderer: ambient screen + chime + mouse/keyboard
edit("src/renderer/app.js", "function render() {\n  if (!D.cfg) return;", `function ambientHTML() {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  const ss = ((D.claude && D.claude.sessions) || []).filter((s) => s.state !== "ended" && s.state !== "idle").slice(0, 4);
  const m = D.live.media && (D.live.media.sessions || []).find((x) => x.playing);
  const col = { working: "var(--live)", waiting: "var(--wait)", yourturn: "var(--ok)" };
  const crew = ss.map((s) => \`<div style="display:flex;flex-direction:column;align-items:center;gap:8px;width:200px">\${companion(D.cfg.companion === "none" ? "pip" : D.cfg.companion, 120, s.state === "waiting" ? "asking" : s.state === "working" ? "working" : "done")}<span style="font-size:17px;font-weight:700;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${esc(s.project)}</span><span style="font-size:14px;color:\${col[s.state] || "var(--mute)"}">\${esc((STATE[s.state] || ["", s.state])[1])}</span></div>\`).join("");
  return \`<div class="ambient" \${A("wake")}>
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div class="n" style="font-size:150px;line-height:.85">\${p(d.getHours())}:\${p(d.getMinutes())}</div><div style="font-size:24px;margin-top:10px">\${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div></div>
    \${D.cfg.quotes && D.quote ? \`<div style="max-width:420px;text-align:right;font-size:18px;line-height:1.4" class="m">\${esc(D.quote[0])}<br><span style="font-size:14px">\${esc(D.quote[1])}</span></div>\` : ""}</div>
    <div style="display:flex;gap:30px;align-items:flex-end;justify-content:center;flex:1 1 auto;padding-bottom:20px">\${crew || \`<div class="m" style="font-size:20px">No AI sessions running</div>\`}</div>
    <div style="display:flex;align-items:center;gap:14px;font-size:18px">\${m ? svg("music", 22) + esc(m.title) + (m.artist ? '<span class="m">' + esc(m.artist) + "</span>" : "") : ""}<span class="m" style="margin-left:auto">Tap anywhere to wake</span></div>
  </div>\`;
}
let lastApprovalCount = 0;
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[660, 0], [880, 0.16]].forEach(([f, t]) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.4); });
    setTimeout(() => ctx.close(), 1200);
  } catch { }
}
function render() {
  if (!D.cfg) return;
  const nApprovals = ((D.claude && D.claude.approvals) || []).length;
  if (nApprovals > lastApprovalCount && D.cfg.chime !== false && !D.live.inGame) chime();
  lastApprovalCount = nApprovals;
  const away = D.live.away && !D.ui.editing && !D.ui.sheet && !(D.attention || []).some((x) => x.urgent) && Date.now() > (D.ui.wakeUntil || 0);
  if (away) { applyTheme(); document.body.classList.toggle("windowed", !D.sideScreen); $("#app").innerHTML = ambientHTML(); return; }`);
edit("src/renderer/app.js", "const H = {", "const H = {\n  wake: () => { D.ui.wakeUntil = Date.now() + 120000; render(); },");

// keyboard + right-click + wheel
edit("src/renderer/app.js", "// ---------- drop an app", `// ---------- mouse and keyboard ----------
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (D.ui.sheet || D.ui.editing) return;
  if (e.target.closest(".w")) { D.ui.editing = D.cfg.activeLayout; render(); toast("Editing. Drag widgets, tap Done when finished"); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (D.ui.sheet) closeSheet(); else if (D.ui.editing) H.editDone(); }
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && D.ui.sheet === "ask") H.askSend();
});
document.addEventListener("wheel", (e) => {
  const w = e.target.closest(".w"); if (!w || D.ui.editing) return;
  const id = w.dataset.wid; const L = activeLayout(); const def = L.widgets.find((x) => x.id === id);
  if (!def || !["music", "sound"].includes(def.type)) return;
  e.preventDefault();
  H.volStep(e.deltaY < 0 ? 2 : -2);
}, { passive: false });

// ---------- drop an app`);

// css for ambient + hover polish for mouse users
const css = `
/* ambient screen when you step away */
.ambient{position:fixed;inset:0;display:flex;flex-direction:column;padding:40px 48px 30px;gap:10px;background:var(--bg);cursor:pointer}
/* mouse users get hover feedback; touch screens don't hover */
@media (hover:hover){.k:hover,.tile:hover{background:var(--keyp)}.btn:hover{filter:brightness(1.06)}.row:hover{background:color-mix(in srgb,var(--key) 60%,transparent)}.ic:hover{background:var(--rule)}}
.k,.btn,.tile,.ic,.row,.seg button,.lay,.sw{cursor:pointer}
`;
fs.appendFileSync(R("src/renderer/styles.css"), css);
console.log("patched");
