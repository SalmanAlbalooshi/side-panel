// One-off patch: log-based Claude sessions, AI today widget, hide sessions.
const fs = require("fs");
const path = require("path");
const R = (f) => path.join(__dirname, "..", f);
const edit = (f, a, b) => { let s = fs.readFileSync(R(f), "utf8"); if (!s.includes(a)) throw new Error("missing in " + f + ": " + a.slice(0, 70)); s = s.replace(a, b); fs.writeFileSync(R(f), s); };

edit("src/claude-hooks.js", "module.exports = { ClaudeHub,", "module.exports = { describe, ClaudeHub,");

edit("src/main.js", 'const { CustomWidgets } = require("./custom-widgets");', 'const { CustomWidgets } = require("./custom-widgets");\nconst claudeLogs = require("./claude-logs");');
edit("src/main.js", '  poll("meeting",', `  poll("claudeLogs", async () => { const ids = new Set(hub ? [...hub.sessions.keys()] : []); live.logSessions = claudeLogs.recentSessions(ids); }, 4000);
  poll("aiToday", async () => { live.aiToday = await claudeLogs.today(); }, 10 * 60000);
  poll("meeting",`);
edit("src/main.js", "  const snap = hub ? hub.snapshot() : null;\n  const sets = {};", `  const snap = hub ? hub.snapshot() : null;
  if (snap && live.logSessions) {
    const order = { waiting: 0, yourturn: 1, working: 2, idle: 3, ended: 4 };
    const fromLogs = live.logSessions.map((s) => ({ id: s.id, source: "log", provider: s.entry === "claude-desktop" ? "Claude Code app" : "Claude Code", project: s.project, cwd: s.cwd, state: s.state, now: s.now, ask: s.ask, summary: s.summary, title: s.title, started: s.started || s.updated, updated: s.updated, plan: s.plan.filter((p) => p.status !== "deleted"), done: s.plan.filter((p) => p.status === "completed").length, total: s.plan.length, files: s.files, feed: [] }));
    snap.sessions = snap.sessions.concat(fromLogs).sort((a, b) => (order[a.state] ?? 5) - (order[b.state] ?? 5) || b.updated - a.updated);
  }
  const sets = {};`);
edit("src/main.js", `  openSession: async (s) => {
`, `  openSession: async (s) => {
    if (s.app && helper) { const ra = await helper.call("win.activate", { match: "", proc: "claude" }).catch(() => ({})); if (ra && ra.ok) return { ok: true, toast: "Opened the Claude app" }; }
`);

edit("src/renderer/widgets.js", '  working: ["var(--live)", "Working"],', '  working: ["var(--live)", "Working"], idle: ["var(--mute)", "Idle"],');
edit("src/renderer/widgets.js", '      const ss = c.sessions.filter((s) => s.state !== "ended");', '      const ss = c.sessions.filter((s) => s.state !== "ended" && !(D.ui.hiddenSessions || []).includes(s.id));');
edit("src/renderer/widgets.js", "      return `<div style=\"display:flex;align-items:center;gap:12px\">${face}",
  "      if (ss.length && !D.hooks.user && D.providers.some((p) => p.id === \"claude-code\")) body += `<button class=\"row\" style=\"min-height:34px;border:0;color:var(--live);font-size:13px\" ${A(\"connectClaude\")}>${svg(\"plug\", 14)}Connect Claude Code to approve from here</button>`;\n      return `<div style=\"display:flex;align-items:center;gap:12px\">${face}");
edit("src/renderer/widgets.js", "  needs: {", `  aitoday: {
    title: "AI today", icon: "bolt", size: [1, 1],
    render(w, D) {
      const t = D.live.aiToday;
      if (!t) return wt("bolt", "AI today") + '<div class="empty">Counting...</div>';
      const hrs = t.activeMin >= 60 ? Math.floor(t.activeMin / 60) + "h " + (t.activeMin % 60) + "m" : t.activeMin + " min";
      const tok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
      if (w.w === 1 && w.h === 1) return wt("bolt", "AI today") + '<span class="n" style="font-size:40px;line-height:.9">' + hrs + '</span><span class="m" style="font-size:13px">' + t.sessions + " sessions. " + t.prompts + " asks</span>";
      const stat = (l, v) => '<div><div class="m" style="font-size:13px">' + l + '</div><span class="n" style="font-size:44px;line-height:.9">' + v + "</span></div>";
      const top = w.h >= 2 ? t.top.map((p) => '<div class="row" style="min-height:34px"><span class="dot" style="background:var(--live)"></span><span>' + esc(p.name) + '</span><span class="t">' + p.sessions + " sessions</span></div>").join("") : "";
      return wt("bolt", "AI today", "Claude Code on this PC") + '<div style="display:flex;gap:22px;flex-wrap:wrap">' + stat("Active", hrs) + stat("Sessions", t.sessions) + stat("Your asks", t.prompts) + stat("Written", tok(t.outTokens)) + "</div>" + top;
    }
  },
  needs: {`);

edit("src/renderer/sheets.js", "    const ss = c.sessions;", "    const ss = c.sessions.filter((s) => !(D.ui.hiddenSessions || []).includes(s.id));");
edit("src/renderer/sheets.js",
  ': `<button class="btn sm" ${A("openSession", { project: s.project })}>Open on main screen</button>${s.state === "yourturn" || s.state === "ended" ? `<button class="btn sm" ${A("copy", s.summary || s.now)}>Copy summary</button><button class="btn sm" ${A("dismissSession", s.id)}>Dismiss</button>` : ""}`;',
  ': `<button class="btn sm" ${A("openSession", { project: s.project, app: /app/.test(s.provider) })}>Open on main screen</button>${s.summary ? `<button class="btn sm" ${A("copy", s.summary)}>Copy summary</button>` : ""}${s.state !== "working" ? `<button class="btn sm" ${A("hideSession", s.id)}>Hide</button>` : ""}${s.source === "log" && s.state === "waiting" && !D.hooks.user ? `<span class="m" style="font-size:12px;align-self:center">Connect Claude Code to approve from here</span>` : ""}`;');
edit("src/renderer/app.js", '  dismissSession: (id) => act("dismissSession", id),', '  dismissSession: (id) => act("dismissSession", id),\n  hideSession: (id) => { D.ui.hiddenSessions = (D.ui.hiddenSessions || []).concat(id); act("dismissSession", id); drawSheet(); render(); },');
edit("src/config.js", 'Developer: [W("ai", 1, 1, 3, 2), W("music", 4, 1, 2, 2), W("clock", 6, 1, 1, 1), W("pc", 6, 2, 1, 1),', 'Developer: [W("ai", 1, 1, 3, 2), W("music", 4, 1, 2, 2), W("clock", 6, 1, 1, 1), W("aitoday", 6, 2, 1, 1),');
console.log("patched");
