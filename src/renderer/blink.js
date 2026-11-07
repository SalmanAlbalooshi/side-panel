// Blink: the default companion. An ink-and-paper character with real eyes, brows, a small mouth and little feet.
// Moods follow the panel: idle, working, asking (needs your OK), done, failed, sleeping. Poke it and it answers.
// It talks in comic bubbles only when something changes, never on a timer.
const BK_LINES = {
  asking: ["I need your OK on something.", "Quick one: this needs your OK.", "Your call on this one."],
  done: ["All done. Take a look when you're ready.", "That's finished.", "Done, it's ready for you."],
  failed: ["Hmm, that one didn't work.", "Something went wrong there.", "That one failed. Want to take a look?"],
  working: ["On it.", "Working on it."]
};
const BK_JOKES = ["Hey, stop poking me!", "That tickles.", "I'm working here.", "Boop received.", "Ow. Rude.", "Okay, I'm awake.", "You again?", "I bruise easily, you know.", "Poke me once more. I dare you."];
const BK_GRUMPY = ["Seriously?", "Poke limit reached.", "I'm filing a complaint."];

function blinkFace(size, state) {
  const s = state || "idle";
  const happy = s === "done", sleep = s === "sleeping", ask = s === "asking", fail = s === "failed", work = s === "working";
  // eyes: open with pupils, happy arcs, or closed lines
  const eye = (cx) => happy
    ? `<path d="M${cx - 6} ${30} Q${cx} ${23} ${cx + 6} ${30}" class="bk-ink" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : sleep
      ? `<path d="M${cx - 6} 29 Q${cx} 32 ${cx + 6} 29" class="bk-ink" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
      : `<g class="bk-eye"><ellipse cx="${cx}" cy="28" rx="${ask ? 7 : 6.2}" ry="${ask ? 8.2 : 7.2}" fill="#fff" class="bk-line" stroke-width="1.6"/>
         <g class="bk-pupil${work ? " bk-scan" : s === "idle" ? " bk-look" : ""}"><circle cx="${cx + (fail ? 0 : 0.5)}" cy="${fail ? 31 : 29}" r="${ask ? 2.6 : 3.1}" class="bk-fill-ink"/><circle cx="${cx + 1.6}" cy="${fail ? 29.6 : 27.6}" r="0.9" fill="#fff"/></g>
         <rect class="bk-lid" x="${cx - 8}" y="18" width="16" height="10" class="bk-fill-paper"/></g>`;
  // brows: angle carries the feeling
  const browA = ask ? -8 : fail ? 16 : work ? 7 : 0, browY = ask ? -3 : work ? 1 : 0;
  const brow = (cx, dir) => sleep || happy ? "" : `<path d="M${cx - 5} 18 L${cx + 5} 18" class="bk-ink" stroke-width="2.2" stroke-linecap="round" transform="translate(0 ${browY}) rotate(${dir * browA} ${cx} 18)"/>`;
  const mouth = happy ? `<path d="M27 40 Q32 45 37 40" class="bk-ink" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    : ask ? `<ellipse cx="32" cy="42" rx="2.4" ry="3" class="bk-fill-ink"/>`
    : fail ? `<path d="M27 44 Q32 39.5 37 44" class="bk-ink" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    : sleep ? `<ellipse cx="32" cy="42" rx="1.8" ry="1.4" class="bk-fill-ink"/>`
    : `<path d="M28.5 42 Q32 43.5 35.5 42" class="bk-ink" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  const cheeks = happy || s === "poked" ? `<ellipse cx="17.5" cy="37" rx="3.6" ry="2.2" class="bk-blush"/><ellipse cx="46.5" cy="37" rx="3.6" ry="2.2" class="bk-blush"/>` : "";
  // a small sign above the head, drawn in the same ink
  const sign = ask ? `<g class="bk-sign"><path d="M51 3 L51 11" class="bk-amber" stroke-width="3.2" stroke-linecap="round"/><circle cx="51" cy="15" r="1.8" class="bk-fill-amber"/></g>`
    : work ? `<g class="bk-dots"><circle cx="45" cy="9" r="1.7" class="bk-fill-ink"/><circle cx="50.5" cy="7" r="1.7" class="bk-fill-ink"/><circle cx="56" cy="5" r="1.7" class="bk-fill-ink"/></g>`
    : fail ? `<path d="M46 9 q2 -4 4 0 q2 -4 4 0 q2 -4 4 0" class="bk-ink" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
    : happy ? `<path d="M52 6 L53 9 L56 10 L53 11 L52 14 L51 11 L48 10 L51 9 Z" class="bk-fill-amber"/>`
    : sleep ? `<text x="47" y="11" class="bk-z">z</text>` : "";
  return `<span class="bk bk-${s}" ${A("poke")} role="img" aria-label="Blink, ${s}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <g class="bk-body">
      <ellipse cx="24" cy="57" rx="5" ry="3" class="bk-fill-paper bk-line bk-footL" stroke-width="2"/><ellipse cx="40" cy="57" rx="5" ry="3" class="bk-fill-paper bk-line bk-footR" stroke-width="2"/>
      <path d="M32 9 C45 8.5 55.5 16.5 55.5 31 C55.5 45.5 46.5 55 32 55 C17.5 55 8.5 46 8.5 31.5 C8.5 17 19 9.5 32 9 Z" class="bk-fill-paper bk-line" stroke-width="2.4"/>
      ${size >= 40 ? cheeks : ""}${eye(24)}${eye(40)}${size >= 40 ? brow(24, 1) + brow(40, -1) : ""}${mouth}
    </g>${size >= 40 ? sign : ""}</svg></span>`;
}
// Blink is the default; Pip and Clawd stay as options
const companionOld = companion;
companion = function (skin, size, state) {
  if (skin === "blink" || !skin) return blinkFace(size, state);
  return companionOld(skin, size, state);
};

// Comic bubble next to a Blink on screen
function bkSay(el, text) {
  if (!el || !text) return;
  if (D.mini && D.ui.miniAsk) return; // the answer is already on screen in Mini; no bubble on top of it
  document.querySelectorAll(".bk-bubble").forEach((b) => b.remove());
  const r = el.getBoundingClientRect();
  if (!r.width) return;
  const b = document.createElement("div");
  b.className = "bk-bubble"; b.dir = "auto"; b.textContent = text;
  document.body.appendChild(b);
  const w = b.offsetWidth, h = b.offsetHeight, left = Math.min(window.innerWidth - w - 8, r.right - 6);
  const bar = document.querySelector(".top"), barBottom = bar && el.closest(".top") ? bar.getBoundingClientRect().bottom : 0;
  const below = r.top - h - 6 < Math.max(6, barBottom);
  const top = below ? Math.max(r.bottom, barBottom) + 10 : r.top - h - 6;
  if (below) b.classList.add("below");
  b.style.left = Math.max(6, left) + "px"; b.style.top = top + "px";
  if (left < r.right - 6) b.classList.add("flip");
  clearTimeout(bkSay.t); bkSay.t = setTimeout(() => b.remove(), Math.min(6000, 3000 + text.split(" ").length * 400));
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
let bkPokes = [];
H.poke = (_a, el) => {
  const bk = el && el.closest ? el.closest(".bk") : document.querySelector(".bk");
  if (!bk) return;
  bkPokes = bkPokes.filter((t) => Date.now() - t < 4000).concat(Date.now());
  const grumpy = bkPokes.length >= 5;
  bk.classList.remove("bk-poked", "bk-grumpy"); void bk.offsetWidth; bk.classList.add(grumpy ? "bk-grumpy" : "bk-poked");
  setTimeout(() => bk.classList.remove("bk-poked", "bk-grumpy"), grumpy ? 1600 : 600);
  bkSay(bk, grumpy ? pick(BK_GRUMPY) : pick(BK_JOKES));
};
// Speak when the panel's mood changes (not on a timer; quiet in games, Focus and the calm screen)
let bkLast = null, bkLastAt = 0;
function bkMood() {
  const ss = ((D.claude && D.claude.sessions) || []).filter((s) => s.state !== "ended");
  if ((D.claude && D.claude.approvals || []).length || ss.some((s) => s.state === "waiting")) return "asking";
  if (ss.some((s) => s.state === "failed" && Date.now() - s.updated < 10 * 60000)) return "failed";
  if (ss.some((s) => s.state === "working")) return "working";
  if (ss.some((s) => s.state === "yourturn" && Date.now() - s.updated < 30 * 60000)) return "done";
  return "idle";
}
function bkTick() {
  if (!D.cfg || (D.cfg.companion && D.cfg.companion !== "blink")) return;
  const m = bkMood();
  if (bkLast === null) { bkLast = m; return; }
  if (m === bkLast) return;
  const prev = bkLast; bkLast = m;
  const talk = D.cfg.companionTalk || "all";
  if (talk === "off" || !BK_LINES[m]) return;
  if (talk === "important" && !["asking", "failed"].includes(m)) return;
  if (D.live.inGame || (D.ui.focus && D.ui.focus.running) || D.live.away) return;
  if (m === "working" && prev !== "idle") return;
  if (!["asking", "failed"].includes(m) && Date.now() - bkLastAt < 60000) return;
  bkLastAt = Date.now();
  setTimeout(() => { const el = [...document.querySelectorAll(".bk")].find((x) => x.getBoundingClientRect().width > 0); const line = pick(BK_LINES[m]); if (el) bkSay(el, line); if (typeof speak === "function" && m !== "working") speak(line); }, 120);
}
window.panel.onTick(() => setTimeout(bkTick, 60));

// light on the PC: when nobody has touched the PC for 2 minutes, or a game is on, idle animations rest.
// Anything that needs you (asking, failed) keeps moving.
window.panel.onTick(() => { const calm = !!(D.live && ((D.live.idleSec || 0) > 120 || D.live.inGame)); if (document.body.classList.contains("calm") !== calm) document.body.classList.toggle("calm", calm); });

let bkAwaySince = 0;
window.panel.onTick(() => {
  if (!D.live || D.test) return;
  const idle = D.live.idleSec || 0;
  if (idle > 20 * 60) { if (!bkAwaySince) bkAwaySince = Date.now() - idle * 1000; return; }
  if (!bkAwaySince || idle > 5) return;
  const since = bkAwaySince; bkAwaySince = 0;
  const ss = ((D.claude && D.claude.sessions) || []).filter((x) => x.updated > since);
  const done = ss.filter((x) => ["yourturn", "done"].includes(x.state)).length, need = ((D.claude && D.claude.approvals) || []).length;
  const ms = ((D.live.meeting && D.live.meeting.meetings) || []).filter((m) => new Date(m.start) > Date.now() && new Date(m.start) - Date.now() < 30 * 60000);
  const bits = [];
  if (need) bits.push(need === 1 ? "one thing needs your OK" : need + " things need your OK");
  if (done) bits.push(done === 1 ? "a task finished" : done + " tasks finished");
  if (ms.length) bits.push("your next meeting's at " + new Date(ms[0].start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  if (!bits.length) return;
  const line = "Welcome back" + (D.cfg.userName ? ", " + D.cfg.userName : "") + ". " + bits.join(", ").replace(/, ([^,]*)$/, " and $1") + ".";
  const el = [...document.querySelectorAll(".bk")].find((x) => x.getBoundingClientRect().width > 0);
  if (el) bkSay(el, line);
  if (typeof speak === "function") speak(line, true);
});
