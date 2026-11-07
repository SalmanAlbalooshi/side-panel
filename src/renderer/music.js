// Music: the cover sets the mood. Blurred cover behind, the cover's own colour for accents, a progress bar that
// moves smoothly and seeks on tap, level bars driven by the real sound output, and synced lyrics.
Object.assign(G, {
  shuffle: '<path d="M3 7h3c5 0 7 10 12 10h3M3 17h3c2 0 3.4-1.6 4.6-3.6M13.4 9.6C14.6 8 16 7 18 7h3M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3"/>',
  lyrics: '<path d="M4 6h16M4 10h10M4 14h16M4 18h8"/>'
});

const Music = {
  colors: new Map(), level: 0, shown: 0, lastLine: -1,
  // A strong colour from the cover: the most saturated mid-bright pixels, averaged.
  color(src) {
    if (!src) return null;
    const key = src.length + ":" + src.slice(-40);
    if (this.colors.has(key)) return this.colors.get(key);
    this.colors.set(key, null);
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 32;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32);
        const px = x.getImageData(0, 0, 32, 32).data;
        let best = [], all = [0, 0, 0, 0];
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const sat = mx ? (mx - mn) / mx : 0, lum = (mx + mn) / 2;
          all[0] += r; all[1] += g; all[2] += b; all[3]++;
          if (lum > 50 && lum < 215) best.push([sat * (1 - Math.abs(lum - 135) / 135), r, g, b]);
        }
        best.sort((a, b) => b[0] - a[0]);
        const top = best.slice(0, Math.max(8, Math.floor(best.length / 8)));
        let rgb = top.length && top[0][0] > 0.12 ? [0, 1, 2].map((k) => Math.round(top.reduce((s, p) => s + p[k + 1], 0) / top.length)) : [0, 1, 2].map((k) => Math.round(all[k] / all[3]));
        // keep it readable on a dark backdrop
        const l = (Math.max(...rgb) + Math.min(...rgb)) / 2;
        if (l < 150) rgb = rgb.map((v) => Math.min(255, Math.round(v + (150 - l))));
        this.colors.set(key, rgb.join(","));
        if (this.colors.size > 40) this.colors.delete(this.colors.keys().next().value);
        render(); if (D.ui.sheet === "music") drawSheet();
      } catch { }
    };
    img.src = src;
    return null;
  },
  // Where the song is right now, between the once-a-second updates.
  pos(cur) {
    if (!cur || !(cur.dur > 0)) return 0;
    let p = cur.pos || 0;
    if (cur.playing) { const base = cur.updatedAt && Math.abs((cur.at || 0) - cur.updatedAt) < 3600000 ? cur.updatedAt : cur.at || Date.now(); p += (Date.now() - base) / 1000 + (D.ui.seekNudge || 0); }
    return Math.max(0, Math.min(cur.dur, p));
  },
  lyricIndex(L, t) { let i = -1; for (let k = 0; k < L.length; k++) { if (L[k][0] <= t + 0.25) i = k; else break; } return i; },
  frame() {
    const cur = curMedia(D);
    if (cur) {
      const p = this.pos(cur);
      document.querySelectorAll("[data-prog]").forEach((el) => { el.style.width = (cur.dur > 0 ? Math.min(100, 100 * p / cur.dur) : 0) + "%"; });
      document.querySelectorAll("[data-ptime]").forEach((el) => { el.textContent = mmss(p); });
      const ly = D.live.lyrics, box = document.getElementById("lyr");
      if (box && ly && ly.synced && ly.synced.length && lyricsMatch(cur, ly)) {
        const i = this.lyricIndex(ly.synced, p);
        if ((i !== this.lastLine || box.dataset.drawn !== String(this.drawn)) && Date.now() > (this.userScroll || 0)) {
          box.dataset.drawn = String(this.drawn);
          box.querySelectorAll(".on,.past").forEach((e) => e.classList.remove("on", "past"));
          box.querySelectorAll("[data-l]").forEach((e) => { if (Number(e.dataset.l) < i) e.classList.add("past"); });
          const el = box.querySelector(`[data-l="${i}"]`);
          if (el) { el.classList.add("on"); this.autoScroll = true; box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.4 + el.clientHeight / 2, behavior: i === this.lastLine + 1 ? "smooth" : "auto" }); setTimeout(() => { this.autoScroll = false; }, 700); }
          this.lastLine = i;
        }
        const now = document.querySelector("[data-lyricnow]");
        if (now) now.textContent = i >= 0 ? ly.synced[i][1] : "";
      }
    }
    // level bars: the real output level, smoothed, each bar moving a little differently so it reads as music
    this.shown += (this.level - this.shown) * 0.35;
    // scale to the music's own loudness, so quiet listening still moves the bars
    this.peak = Math.max(this.level, (this.peak || 0.05) * 0.997, 0.02);
    const t = performance.now() / 1000;
    document.querySelectorAll(".lv").forEach((box) => {
      box.style.opacity = this.shown > 0.004 ? "1" : "0";
      [...box.children].forEach((b, k) => { const v = Math.min(1, (this.shown / this.peak) * 0.9 * (0.55 + 0.45 * Math.abs(Math.sin(t * (2.1 + k * 0.9) + k)))); b.style.transform = `scaleY(${Math.max(0.08, v)})`; });
    });
    requestAnimationFrame(() => this.frame());
  }
};
Music.levelsSeen = 0;
window.panel.onLevel((v) => { Music.level = Number(v) || 0; Music.levelsSeen++; });
setInterval(() => { if (!(curMedia(D) || {}).playing) Music.level = 0; }, 500);
requestAnimationFrame(() => Music.frame());
Music.drawn = 0;

// tap or drag on a progress bar to jump; while dragging, the time shows above your finger
let scrub = null;
const scrubAt = (bar, x, cur) => { const r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (x - r.left) / r.width)) * cur.dur; };
document.addEventListener("pointerdown", (e) => {
  const bar = e.target.closest("[data-seek]");
  if (!bar) return;
  const cur = curMedia(D);
  if (!cur || !cur.canSeek || !(cur.dur > 0)) { toast(cur ? "This app doesn't allow jumping" : ""); return; }
  e.preventDefault(); e.stopPropagation();
  scrub = { bar, cur, pos: scrubAt(bar, e.clientX, cur), id: e.pointerId };
  try { bar.setPointerCapture(e.pointerId); } catch { }
  bar.classList.add("scrubbing");
  const tip = document.createElement("div"); tip.className = "scrubtip"; document.body.appendChild(tip); scrub.tip = tip;
  showScrub(e.clientX);
}, true);
function showScrub(x) {
  // the bar can be redrawn while you drag: always measure the one on screen now
  if (!scrub.bar.isConnected) { const again = document.querySelector(scrub.bar.classList.contains("big") ? ".prog.big[data-seek]" : "[data-seek]"); if (again) { scrub.bar = again; again.classList.add("scrubbing"); } }
  const { bar, cur, tip } = scrub; scrub.pos = scrubAt(bar, x, cur);
  const r = bar.getBoundingClientRect();
  tip.textContent = mmss(scrub.pos); tip.style.left = Math.max(r.left, Math.min(r.right, x)) + "px"; tip.style.top = (r.top - 34) + "px";
  bar.querySelectorAll("[data-prog]").forEach((el) => { el.style.width = 100 * scrub.pos / cur.dur + "%"; });
  bar.style.setProperty("--knob", (100 * scrub.pos / cur.dur) + "%");
}
document.addEventListener("pointermove", (e) => { if (scrub) { e.preventDefault(); showScrub(e.clientX); } }, true);
const scrubEnd = (cancel) => {
  if (!scrub) return;
  const { cur, pos, bar, tip } = scrub; scrub = null; tip.remove(); bar.classList.remove("scrubbing");
  if (cancel) return;
  cur.pos = pos; cur.updatedAt = Date.now(); cur.at = Date.now(); D.ui.seekNudge = 0;
  // keep showing where you jumped to until the music app reports it (it can lag a second or two)
  D.ui.seekHold = { app: cur.app, pos, at: Date.now() };
  act("media", { action: "seek", app: cur.app, pos });
};
document.addEventListener("pointerup", () => scrubEnd(false), true);
document.addEventListener("pointercancel", () => scrubEnd(true), true);
// the music app's late reports don't pull the bar back to where it was before the jump
window.panel.onTick(() => {
  const h = D.ui.seekHold; if (!h) return;
  const s = ((D.live.media && D.live.media.sessions) || []).find((x) => x.app === h.app);
  const want = h.pos + (s && s.playing ? (Date.now() - h.at) / 1000 : 0);
  if (!s || Date.now() - h.at > 4000 || Math.abs((s.pos || 0) - want) < 2.5) { D.ui.seekHold = null; return; }
  s.pos = want; s.updatedAt = Date.now(); s.at = Date.now();
});
// arrow keys jump 10 seconds when the player is open
document.addEventListener("keydown", (e) => {
  if (D.ui.sheet !== "music" || !/^Arrow(Left|Right)$/.test(e.key) || /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || "")) return;
  const cur = curMedia(D); if (!cur || !cur.canSeek || !(cur.dur > 0)) return;
  const pos = Math.max(0, Math.min(cur.dur - 1, (cur.pos || 0) + (e.key === "ArrowRight" ? 10 : -10)));
  cur.pos = pos; cur.updatedAt = cur.at = Date.now(); D.ui.seekHold = { app: cur.app, pos, at: Date.now() };
  act("media", { action: "seek", app: cur.app, pos }); drawSheet();
});

const lvBars = (n) => `<span class="lv" aria-hidden="true">${"<i></i>".repeat(n || 5)}</span>`;
function musicVars(cur) {
  const art = cur ? imgSrc(cur.art) : "";
  const c = art ? Music.color(art) : null;
  return { art, c: c || "134,168,255", style: `--mc:${c || "134,168,255"}` };
}

W.music.render = function (w, D) {
  const m = D.live.media, a = D.live.audio;
  const ss = (m && m.sessions) || [];
  const cur = curMedia(D);
  const vol = a ? a.volume : 0;
  if (!cur) {
    const mk = Object.values(D.cfg.keySets).flat().find((k) => /spotify|music|youtube|vlc|media player/i.test(k.label));
    const pl = (D.cfg.playlists || []).slice(0, w.w >= 3 ? 3 : 2);
    return `${wt("music", "Music")}<div class="empty">Nothing playing.</div><div style="display:flex;gap:8px;flex-wrap:wrap">${mk ? `<button class="btn sm go" ${A("key", mk.id)}>${svg("pp", 16)}${esc(mk.label)}</button>` : ""}${pl.map((p) => `<button class="btn sm" ${A("playlist", p.id)}>${esc(p.label)}</button>`).join("")}<button class="btn sm" ${A("sheet", "music")}>${svg("music", 16)}${pl.length ? "More" : "Add a playlist"}</button></div>`;
  }
  const v = musicVars(cur);
  const big = w.h >= 2;
  const artSize = big ? (w.w >= 3 ? 132 : 104) : 62;
  const cover = v.art ? `<img class="cov" src="${v.art}" style="width:${artSize}px;height:${artSize}px" alt="">` : `<span class="cov none" style="width:${artSize}px;height:${artSize}px">${svg("music", Math.round(artSize / 2.6))}</span>`;
  const ly = D.live.lyrics;
  const lyricNow = big && ly && ly.synced && ly.synced.length ? `<div class="lnow" data-lyricnow></div>` : "";
  const prog = cur.dur > 0 ? `<div class="prog" data-seek><span class="trk"><i data-prog></i></span></div><div class="times"><span class="n" data-ptime>${mmss(cur.pos)}</span><span class="n">${mmss(cur.dur)}</span></div>` : "";
  const ctl = `<div class="ctl">${big && cur.canShuffle ? `<button class="ic sm${cur.shuffle ? " on" : ""}" ${A("media", { action: "shuffle", app: cur.app })} aria-label="Shuffle">${svg("shuffle", 18)}</button>` : ""}<button class="ic" ${A("media", { action: "prev", app: cur.app })} aria-label="Previous">${svg("prev", 22)}</button><button class="ic big" ${A("media", { action: "toggle", app: cur.app })} aria-label="Play or pause">${svg(cur.playing ? "pause" : "pp", 26, 2.2)}</button><button class="ic" ${A("media", { action: "next", app: cur.app })} aria-label="Next">${svg("next", 22)}</button>${big && cur.canRepeat ? `<button class="ic sm${cur.repeat && cur.repeat !== "none" ? " on" : ""}" ${A("media", { action: "repeat", app: cur.app })} aria-label="Repeat">${svg("repeat", 18)}${cur.repeat === "track" ? "<b class='one'>1</b>" : ""}</button>` : ""}</div>`;
  const volRow = big && w.w >= 2 ? `<div class="vrow"><button class="ic sm" ${A("mute", !(a && a.muted))} aria-label="Mute">${svg(a && a.muted ? "mute" : "speaker", 18)}</button><input type="range" min="0" max="100" value="${vol}" data-range="volume" aria-label="Volume"><span class="n">${vol}</span></div>` : "";
  return `<div class="mus${v.art ? " art" : ""}" style="${v.style}">${v.art ? `<div class="mbg" style="background-image:url('${v.art}')"></div>` : ""}
    <div class="mtop"><span class="mlab">${svg("music", 16)}${cur.playing ? "Now playing" : "Paused"}</span>${cur.playing ? lvBars(5) : ""}<button class="chip" ${A("musicOpen", "sources")} aria-label="Switch source">${esc(cur.name)}${ss.length > 1 ? " +" + (ss.length - 1) : ""}${svg("chev", 14)}</button></div>
    <button class="plain mmain" ${A("musicOpen", "")}>${cover}<span class="mtxt"><span class="mt">${esc(cur.title || "Unknown")}</span><span class="ma">${esc(cur.artist || "")}</span>${lyricNow}</span></button>
    ${prog}${ctl}${volRow}</div>`;
};

SHEETS.music = function (D) {
  const ss = (D.live.media && D.live.media.sessions) || [];
  const cur = curMedia(D);
  const a = D.live.audio || { volume: 0, apps: [] };
  const pl = D.cfg.playlists || [];
  const v = musicVars(cur);
  const ly = D.live.lyrics;
  const hasLy = !!(ly && ((ly.synced && ly.synced.length) || ly.plain));
  const tab = D.ui.musTab || (hasLy ? "lyrics" : "sources");
  Music.drawn++;
  const stage = cur ? `<div class="stage">
      ${v.art ? `<img class="bigcov" src="${v.art}" alt="Album cover">` : `<span class="bigcov none">${svg("music", 90)}</span>`}
      <div class="st-t">${esc(cur.title || "Unknown")}</div>
      <div class="st-a">${esc(cur.artist || "")}${cur.album && cur.album !== cur.title ? `<span> · ${esc(cur.album)}</span>` : ""}</div>
      ${cur.dur > 0 ? `<div class="prog big" data-seek title="${cur.canSeek ? "Tap to jump" : ""}"><span class="trk"><i data-prog></i></span></div><div class="times"><span class="n" data-ptime>${mmss(cur.pos)}</span><span class="n">${mmss(cur.dur)}</span></div>` : ""}
      <div class="ctl big">${cur.canShuffle ? `<button class="ic${cur.shuffle ? " on" : ""}" ${A("media", { action: "shuffle", app: cur.app })} aria-label="Shuffle">${svg("shuffle", 22)}</button>` : ""}<button class="ic" ${A("media", { action: "prev", app: cur.app })} aria-label="Previous">${svg("prev", 28)}</button><button class="ic big" ${A("media", { action: "toggle", app: cur.app })} aria-label="Play or pause">${svg(cur.playing ? "pause" : "pp", 32, 2.2)}</button><button class="ic" ${A("media", { action: "next", app: cur.app })} aria-label="Next">${svg("next", 28)}</button>${cur.canRepeat ? `<button class="ic${cur.repeat && cur.repeat !== "none" ? " on" : ""}" ${A("media", { action: "repeat", app: cur.app })} aria-label="Repeat">${svg("repeat", 22)}${cur.repeat === "track" ? "<b class='one'>1</b>" : ""}</button>` : ""}</div>
      <div class="vrow"><button class="ic sm" ${A("mute", !a.muted)} aria-label="Mute">${svg(a.muted ? "mute" : "speaker", 20)}</button><input type="range" min="0" max="100" value="${a.volume}" data-range="volume" aria-label="Volume"><button class="plain n vnum" ${A("mute", !a.muted)} title="Mute">${a.muted ? "Muted" : a.volume}</button>${cur.playing ? lvBars(7) : ""}</div>
    </div>` : `<div class="stage"><span class="bigcov none">${svg("music", 90)}</span><div class="st-t">Nothing playing</div><div class="st-a">Tap a playlist, or start music in any app.</div></div>`;
  const tabs = `<div class="seg mseg">${[["lyrics", "Lyrics"], ["sources", "Playing from" + (ss.length > 1 ? " (" + ss.length + ")" : "")], ["playlists", "Playlists"], ["apps", "App volume"]].map(([k, l]) => `<button class="${tab === k ? "on" : ""}" ${A("musTab", k)}>${l}</button>`).join("")}</div>`;
  let pane = "";
  if (tab === "lyrics") {
    if (!cur) pane = `<div class="empty">Lyrics show here while a song plays.</div>`;
    else if (D.cfg.lyrics === false) pane = `<div class="empty">Lyrics are off. Turn them on in Settings.</div>`;
    else if (!ly || ly.loading) pane = `<div class="empty">Looking for the lyrics...</div>`;
    else if (!lyricsMatch(cur, ly)) pane = `<div class="empty">Looking for the lyrics...</div>`;
    else if (ly.synced && ly.synced.length) pane = `<div class="lyr" id="lyr">${ly.synced.map((l, i) => `<div data-l="${i}" data-t="${l[0]}">${esc(l[1]) || "♪"}</div>`).join("")}<div style="height:55%"></div></div>${Date.now() < (Music.userScroll || 0) ? `<button class="btn sm lyrnow" ${A("lyricsNow")}>Back to now</button>` : ""}`;
    else if (ly.plain) pane = `<div class="lyr plain">${esc(ly.plain).replace(/\n/g, "<br>")}</div>`;
    else pane = `<div class="empty">${ly.instrumental ? "This one's instrumental." : "No lyrics found for this song."}</div>`;
  } else if (tab === "sources") {
    pane = ss.length ? ss.map((s) => `<button class="row src${cur && s.app === cur.app ? " sel" : ""}" ${A("mediaSource", s.app)}>${imgSrc(s.art) ? `<img src="${imgSrc(s.art)}" alt="">` : `<span class="noart">${svg("music", 22)}</span>`}<span class="grow"><b>${esc(s.name)}</b><span class="ell">${esc(s.title || "")}${s.artist ? " · " + esc(s.artist) : ""}</span></span><span class="tag${s.playing ? " on" : ""}">${s.playing ? "Playing" : "Paused"}</span></button>`).join("") : `<div class="empty">No app is playing right now.</div>`;
  } else if (tab === "playlists") {
    const u = D.ui.pl || {};
    pane = `<div class="plg">${pl.map((p) => `<div class="plt"><button class="plain" ${A("playlist", p.id)}><span class="pli">${svg(p.kind === "spotify" ? "music" : p.kind === "youtube" ? "pp" : "globe", 26)}</span><b>${esc(p.label)}</b><span>${esc(p.kindLabel || "")}</span></button><button class="x" ${A("removePlaylist", p.id)} aria-label="Remove ${esc(p.label)}">${svg("x", 14, 2.4)}</button></div>`).join("")}</div>${pl.length ? "" : `<div class="empty">No playlists yet.</div>`}
      <div class="pladd"><input type="text" id="plUrl" placeholder="Paste a playlist link: Spotify, YouTube Music, any site" value="${esc(u.url || "")}"><input type="text" id="plName" placeholder="Name (optional)" value="${esc(u.name || "")}"><button class="btn go" ${A("addPlaylist")}>Add</button></div><span class="m" style="font-size:12px">Or drag a playlist link from your browser onto this screen.</span>`;
  } else {
    pane = (a.apps || []).slice(0, 8).map((x) => `<label class="avol"><span>${esc(prettyProc(x.name))}</span><input type="range" min="0" max="100" value="${x.volume}" data-range="app" data-pid="${x.pid}"><span class="n">${x.volume}</span></label>`).join("") || `<div class="empty">No apps are making sound.</div>`;
  }
  const glance = cur && cur.playing && Date.now() - (D.ui.lastTouch || Date.now()) > 120000;
  if (glance) return `<div class="sheet msheet glance${v.art ? " art" : ""}" style="${v.style}" ${A("unglance")}>${v.art ? `<div class="mbg" style="background-image:url('${v.art}')"></div><img class="gcov" src="${v.art}" alt="">` : ""}<div class="gt">${esc(cur.title || "")}</div><div class="ga">${esc(cur.artist || "")}</div>${D.live.lyrics && lyricsMatch(cur, D.live.lyrics) ? `<div class="gl" data-lyricnow></div>` : ""}</div>`;
  return `<div class="shade" ${A("closeSheet")}></div><div class="sheet msheet${v.art ? " art" : ""}" style="${v.style}">${v.art ? `<div class="mbg" style="background-image:url('${v.art}')"></div>` : ""}<div class="grab"></div><div class="head"><h2>Music</h2>${cur ? `<span class="m" style="font-size:14px">From ${esc(cur.name)}</span>` : ""}<button class="btn" style="margin-left:auto;height:46px" ${A("closeSheet")}>Close</button></div><div class="body mbody">${stage}<div class="mside">${tabs}<div class="mpane">${pane}</div></div></div></div>`;
};
H.musicOpen = async (t) => {
  D.ui.musTab = t || null; Music.lastLine = -1;
  // Mini is too small for the player: open the full panel with it
  if (D.mini) { await H.expand(); for (let i = 0; i < 20 && D.mini; i++) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 300)); openSheet("music"); setTimeout(() => { if (!D.mini && D.ui.sheet !== "music") openSheet("music"); }, 700); return; }
  openSheet("music");
};
// lyrics belong to the song showing right now, never to the one before
function lyricsMatch(cur, ly) { return !!(cur && ly && ly.key === [cur.title, cur.artist].join("|").toLowerCase()); }
H.unglance = () => { D.ui.lastTouch = Date.now(); drawSheet(); };
document.addEventListener("pointerdown", () => { D.ui.lastTouch = Date.now(); }, true);
H.lyricsNow = () => { Music.userScroll = 0; Music.lastLine = -1; drawSheet(); };
document.addEventListener("click", (e) => {
  const line = e.target.closest("#lyr [data-t]"); if (!line) return;
  const cur = curMedia(D); if (!cur || !cur.canSeek) return;
  const pos = Number(line.dataset.t); cur.pos = pos; cur.updatedAt = Date.now(); cur.at = Date.now();
  Music.userScroll = 0; Music.lastLine = -1; act("media", { action: "seek", app: cur.app, pos });
}, true);
document.addEventListener("wheel", (e) => { if (e.target.closest("#lyr")) { Music.userScroll = Date.now() + 6000; } }, { passive: true, capture: true });
document.addEventListener("touchmove", (e) => { if (e.target.closest("#lyr")) { Music.userScroll = Date.now() + 6000; } }, { passive: true, capture: true });
H.musTab = (t) => { D.ui.musTab = t; Music.lastLine = -1; drawSheet(); };

// --knob-follow: the handle moves with the progress bar
setInterval(() => { if (scrub) return; for (const bar of document.querySelectorAll("[data-seek]")) { const i = bar.querySelector("[data-prog]"); if (i && i.style.width) bar.style.setProperty("--knob", i.style.width); } }, 250);
