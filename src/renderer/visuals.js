// Small visuals inside Blink's answers: one number, a few bars, a line over time, progress, steps, a timeline.
// The AI only sends data (a ```blink-card``` block of JSON); the panel checks it and draws it in its own style.
// Anything wrong (unknown type, text where a number goes, too many items) is dropped and the text answer stands.
const CARD_TYPES = new Set(["stat", "bar", "line", "ring", "steps", "timeline"]);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
const cut = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10));

function blinkCard(raw) {
  let c; try { c = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return ""; }
  if (!c || typeof c !== "object" || !CARD_TYPES.has(c.type)) return "";
  const title = cut(c.title, 60), unit = cut(c.unit, 8);
  const head = title ? `<div class="vc-t">${esc(title)}</div>` : "";
  try {
    if (c.type === "stat") {
      const v = c.value; const shown = num(v) !== null ? fmt(num(v)) : cut(v, 12); if (!shown) return "";
      return `<div class="vcard">${head}<div class="vc-stat"><b>${esc(shown)}</b>${unit ? `<span>${esc(unit)}</span>` : ""}</div>${c.note ? `<div class="vc-n m">${esc(cut(c.note, 80))}</div>` : ""}</div>`;
    }
    if (c.type === "ring") {
      const v = num(c.value), max = num(c.max) || 100; if (v === null || max <= 0) return "";
      const p = Math.max(0, Math.min(1, v / max)), r = 34, L = 2 * Math.PI * r;
      return `<div class="vcard vc-row">${`<svg viewBox="0 0 84 84" width="84" height="84" role="img" aria-label="${esc(Math.round(p * 100) + "%")}"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--key)" stroke-width="9"/><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--live)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(p * L).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 42 42)"/><text x="42" y="47" text-anchor="middle" font-size="17" font-weight="700" fill="var(--ink)">${Math.round(p * 100)}%</text></svg>`}<div>${head}<div class="m">${esc(fmt(v))}${unit ? " " + esc(unit) : ""} of ${esc(fmt(max))}${unit ? " " + esc(unit) : ""}</div>${c.note ? `<div class="vc-n m">${esc(cut(c.note, 80))}</div>` : ""}</div></div>`;
    }
    if (c.type === "bar") {
      const items = (Array.isArray(c.items) ? c.items : []).map((x) => (Array.isArray(x) ? [cut(x[0], 18), num(x[1])] : [cut(x && x.label, 18), num(x && x.value)])).filter((x) => x[0] && x[1] !== null).slice(0, 7);
      if (items.length < 2) return "";
      const max = Math.max(...items.map((x) => Math.abs(x[1]))) || 1;
      return `<div class="vcard">${head}<div class="vc-bars">${items.map(([l, v]) => `<div class="vc-bar"><span class="l ell">${esc(l)}</span><span class="b"><i style="width:${Math.max(2, Math.round((Math.abs(v) / max) * 100))}%"></i></span><span class="v">${esc(fmt(v))}${unit ? esc(unit) : ""}</span></div>`).join("")}</div></div>`;
    }
    if (c.type === "line") {
      const pts = (Array.isArray(c.points) ? c.points : []).map((x) => (Array.isArray(x) ? [cut(x[0], 8), num(x[1])] : [cut(x && x.label, 8), num(x && x.value)])).filter((x) => x[1] !== null).slice(0, 24);
      if (pts.length < 2) return "";
      const W = 320, H = 110, pad = 14, vs = pts.map((p) => p[1]), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
      const xy = pts.map((p, i) => [pad + (i * (W - 2 * pad)) / (pts.length - 1), H - pad - ((p[1] - lo) / span) * (H - 2 * pad - 14)]);
      const path = xy.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
      const hiI = vs.indexOf(hi), loI = vs.indexOf(lo);
      const lab = (i, below) => `<text x="${xy[i][0].toFixed(1)}" y="${(xy[i][1] + (below ? 16 : -7)).toFixed(1)}" text-anchor="middle" font-size="12" fill="var(--ink)">${esc(fmt(vs[i]))}${esc(unit)}</text>`;
      return `<div class="vcard">${head}<svg viewBox="0 0 ${W} ${H + 16}" width="100%" role="img" aria-label="${esc(title || "Chart")}"><path d="${path}" fill="none" stroke="var(--live)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${xy.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--live)"/>`).join("")}${lab(hiI, false)}${loI !== hiI ? lab(loI, true) : ""}<text x="${pad}" y="${H + 12}" font-size="12" fill="var(--mute)">${esc(pts[0][0])}</text><text x="${W - pad}" y="${H + 12}" font-size="12" text-anchor="end" fill="var(--mute)">${esc(pts[pts.length - 1][0])}</text></svg></div>`;
    }
    if (c.type === "steps") {
      const st = (Array.isArray(c.steps) ? c.steps : []).map((x) => cut(x, 120)).filter(Boolean).slice(0, 6);
      if (!st.length) return "";
      return `<div class="vcard">${head}<ol class="vc-steps">${st.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`;
    }
    if (c.type === "timeline") {
      const it = (Array.isArray(c.items) ? c.items : []).map((x) => (Array.isArray(x) ? [cut(x[0], 12), cut(x[1], 70)] : [cut(x && x.time, 12), cut(x && x.text, 70)])).filter((x) => x[0] && x[1]).slice(0, 8);
      if (!it.length) return "";
      return `<div class="vcard">${head}<div class="vc-tl">${it.map(([t, x]) => `<div class="vc-ti"><span class="tm">${esc(t)}</span><span class="dot"></span><span class="tx">${esc(x)}</span></div>`).join("")}</div></div>`;
    }
  } catch { return ""; }
  return "";
}
