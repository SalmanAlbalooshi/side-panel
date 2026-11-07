// First start, made for anyone: it looks at how this PC is used, suggests keys and layouts with reasons,
// and asks only what it can't know. Replaces the old "pick a profile" setup.
const SETUP_KINDS = { office: "Work", dev: "Coding", game: "Games", media: "Music and video", chat: "Chat", create: "Creative", browser: "Browser", other: "" };
function useHint(a) {
  if (a.focusMin >= 60) return Math.round(a.focusMin / 60) + " h used";
  if (a.focusMin > 0) return a.focusMin + " min used";
  if (a.runs > 0) return "Opened " + a.runs + (a.runs === 1 ? " time" : " times");
  return SETUP_KINDS[a.kind] || "On this PC";
}

SHEETS.setup = function (D) {
  const u = D.ui.setup;
  const s = u.data;
  const dots = `<div style="display:flex;gap:6px">${[1, 2, 3].map((i) => `<span style="width:40px;height:6px;border-radius:3px;background:${i <= u.step ? "var(--ink)" : "var(--rule)"}"></span>`).join("")}</div>`;
  let inner = "", next = "Next";
  if (!s) inner = `<div style="display:flex;gap:22px;align-items:center;margin-top:40px">${companion(D.cfg.companion === "none" ? "pip" : D.cfg.companion, 120, "working")}<div><div style="font-size:30px;font-weight:700">Getting to know this PC</div><div class="m" style="font-size:17px;margin-top:6px">Finding your apps and the ones you use most. This stays on this PC.</div></div></div>`;
  else if (u.step === 1) {
    u.apps = u.apps || s.apps.filter((a) => a.pick).map((a) => a.appId || a.path || a.name);
    Icons.want(s.apps);
    const n = u.apps.length;
    inner = `<div class="setrow" style="margin-bottom:14px"><span style="font-size:20px;font-weight:700">Hi, I'm Blink. What should I call you?<span class="sub">I'll use it now and then. You can change it in Settings.</span></span><input type="text" id="setupName" dir="auto" maxlength="30" value="${esc(u.name || D.cfg.userName || "")}" placeholder="Your first name" style="height:48px;width:220px;font-size:18px"></div>
      <div style="font-size:28px;font-weight:700">Your apps, one tap away</div><div class="m" style="font-size:16px;margin:4px 0 14px">The ones you use most are picked. Tap to add or remove. Read from Windows on this PC; nothing is sent anywhere.</div>
      <div class="sgrid">${s.apps.map((a) => { const id = a.appId || a.path || a.name; const on = u.apps.includes(id); return `<button class="tile${on ? " sel" : ""}" ${A("setupApp", id)}>${a.icon ? `<img src="${a.icon}" alt="">` : svg(guessGlyph(a.name), 26)}<span class="l">${esc(a.name.replace(/^(Microsoft|Google) /, ""))}</span><span class="i">${esc(useHint(a))}</span>${on ? `<span class="tick">${svg("tick", 16, 3)}</span>` : ""}</button>`; }).join("")}</div>
      <div class="m" style="font-size:14px;margin-top:10px">${n} picked. You can add websites, people, shortcuts and folders later.</div>`;
  } else if (u.step === 2) {
    u.tpls = u.tpls || s.templates.filter((t) => t.pick).map((t) => t.id);
    inner = `<div style="font-size:28px;font-weight:700">Screens for your day</div><div class="m" style="font-size:16px;margin:4px 0 14px">Each one is a layout you can switch to, or that switches by itself. Picked from how you use this PC; change any time.</div>
      <div class="tgrid">${s.templates.map((t) => { const on = u.tpls.includes(t.id); return `<button class="tcard${on ? " sel" : ""}" ${A("setupTpl", t.id)}><span class="tn">${esc(t.name)}${on ? svg("tick", 18, 3) : ""}</span><span class="td">${esc(t.desc)}</span>${t.reason ? `<span class="tr">${esc(t.reason)}</span>` : ""}</button>`; }).join("")}</div>
      ${s.recentGames.length && u.tpls.includes("gaming") ? `<div class="m" style="font-size:14px;margin-top:10px">Gaming gets keys for ${esc(s.recentGames.slice(0, 3).map((g) => g.name).join(", "))}.</div>` : ""}`;
  } else {
    const cc = D.providers.find((p) => p.id === "claude-code");
    u.screen = u.screen || (s.touch ? "touch" : "mini");
    next = "Start";
    inner = `<div style="font-size:28px;font-weight:700">Last two things</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:16px">
        <div><span class="m" style="font-size:14px;font-weight:600">Where the panel lives</span>
          ${s.touch ? `<div class="card" style="margin-top:8px"><b>On your touch screen</b><span class="m">Full screen there. It never takes focus from your work or games.</span></div>` : `
          <button class="tcard${u.screen === "mini" ? " sel" : ""}" style="margin-top:8px;width:100%" ${A("setupScreen", "mini")}><span class="tn">Mini, in a corner${u.screen === "mini" ? svg("tick", 18, 3) : ""}</span><span class="td">Small, always on top, never takes focus. Expand it for the full panel.</span><span class="tr">Best with normal monitors</span></button>
          <button class="tcard${u.screen === "window" ? " sel" : ""}" style="margin-top:8px;width:100%" ${A("setupScreen", "window")}><span class="tn">A normal window${u.screen === "window" ? svg("tick", 18, 3) : ""}</span><span class="td">Move and size it like any app.</span></button>
          <span class="m" style="font-size:13px;display:block;margin-top:8px">Plug in a small touch screen any time; the panel moves there by itself.</span>`}</div>
        <div><span class="m" style="font-size:14px;font-weight:600">Your AI</span>
          ${cc ? `<div class="setrow"><span>Claude Code<span class="sub">${D.hooks.user ? "Connected" : "See what Claude Code is doing and approve from here. Your Claude settings are backed up first."}</span></span>${D.hooks.user ? `<span style="color:var(--ok);font-weight:700">Done</span>` : `<button class="btn sm" ${A("connectClaude")}>Connect</button>`}</div>` : `<div class="setrow"><span>No AI tools found<span class="sub">Ask still opens Claude, ChatGPT and Gemini in your browser.</span></span></div>`}
          <div class="setrow"><span>Browser AI tabs<span class="sub">See when claude.ai or ChatGPT finishes. Set up later in Settings.</span></span></div>
        </div></div>`;
  }
  const nav = s ? `<div style="display:flex;gap:10px;margin-top:18px">${u.step > 1 ? `<button class="btn" ${A("setupBack")}>Back</button>` : ""}<button class="btn go" style="min-width:160px" ${A("setupNext")}${u.step === 1 && !(u.apps || []).length ? " disabled" : ""}${u.step === 2 && !(u.tpls || []).length ? " disabled" : ""}>${next}</button></div>` : "";
  return `<div class="sheet" style="top:0;border-radius:0"><div class="head"><h2>Set up your panel</h2><span class="m" style="font-size:14px">Step ${u.step} of 3. About a minute.</span><span style="margin-left:auto">${dots}</span></div><div class="body">${inner}${nav}</div></div>`;
};

const setupLoad = () => { if (D.ui.setup.loading || D.ui.setup.data) return; D.ui.setup.loading = true; act("smartSetup").then((r) => { D.ui.setup.data = r; D.ui.setup.loading = false; if (D.ui.sheet === "setup") drawSheet(); }); };
const oldOpen = openSheet;
// load the suggestions the moment setup opens
window.panel.onTick(() => { if (D.ui.sheet === "setup") setupLoad(); });
Object.assign(H, {
  setupApp: (id) => { const u = D.ui.setup; u.apps = u.apps.includes(id) ? u.apps.filter((x) => x !== id) : u.apps.concat(id); drawSheet(); },
  setupTpl: (id) => { const u = D.ui.setup; u.tpls = u.tpls.includes(id) ? u.tpls.filter((x) => x !== id) : u.tpls.concat(id); drawSheet(); },
  setupScreen: (v) => { D.ui.setup.screen = v; drawSheet(); },
  setupBack: () => { D.ui.setup.step = Math.max(1, D.ui.setup.step - 1); drawSheet(); },
  setupNext: async () => {
    const u = D.ui.setup;
    if (!u.data) return;
    const nm = $("#setupName"); if (nm) u.name = nm.value.trim();
    if (u.step < 3) { u.step++; drawSheet(); return; }
    await act("finishSetup", { apps: u.apps, templates: u.tpls, screen: u.screen, name: u.name });
    D.cfg.setupDone = true; D.ui.sheet = null; $("#layer").innerHTML = ""; toast(u.name ? "All set, " + u.name + "." : "All set."); if (u.name) { D.cfg.userName = u.name; try { localStorage.setItem("nameAsked", "1"); } catch { } }
  },
  // Layouts sheet: a new layout starts from a template (or blank)
  layoutNew: async () => { D.ui.tplPick = !D.ui.tplPick; if (!D.ui.templates) { const r = await act("templates"); D.ui.templates = r.templates; } drawSheet(); },
  layoutTpl: async (id) => {
    D.ui.tplPick = false;
    if (id === "blank") { let i = 1; while (D.cfg.layouts.find((l) => l.name === "Layout " + i)) i++; D.cfg.layouts.push({ name: "Layout " + i, widgets: [], rules: [] }); D.ui.layoutSel = "Layout " + i; await cfgSave(); drawSheet(); return; }
    const r = await act("layoutFromTemplate", { id });
    if (r.error) { toast(r.error); return; }
    D.ui.layoutSel = r.name; D.ui.holdCfgUntil = 0; toast("Added " + r.name);
  }
});
