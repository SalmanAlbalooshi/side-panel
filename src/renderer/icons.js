// Line glyphs and the two companions (Pip, default; Clawd, personal skin).
const G = {
  game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5"/><circle cx="16" cy="11.5" r="1"/><circle cx="18.5" cy="14" r="1"/>',
  play: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9v6l5-3z"/>',
  chat: '<path d="M4 5h16v10H9l-5 4z"/>',
  gpt: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  gem: '<path d="M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>',
  claude: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
  codex: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  term: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 19c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 13.2c2.9.3 5 2.6 5 5.8"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4"/>',
  prev: '<path d="M6 5v14M19 5l-10 7 10 7z"/>', next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>', pp: '<path d="M8 5v14l11-7z"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micoff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18"/>',
  chev: '<path d="M6 9l6 6 6-6"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1"/>', tick: '<path d="M5 12l4 4 10-10"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/>',
  wand: '<path d="M4 20L16 8M14 4v3M18 6h3M19 2l-1 2M20 10h-2"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  resize: '<path d="M21 13v8h-8M21 21l-7-7"/>', cpu: '<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  quote: '<path d="M7 7h4v6H5v-2c0-2 1-4 2-4zM15 7h4v6h-6v-2c0-2 1-4 2-4z"/>', monitor: '<rect x="2" y="4" width="20" height="13" rx="1"/><path d="M8 21h8M12 17v4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  moon: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', head: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1"/><rect x="17" y="14" width="4" height="6" rx="1"/>',
  disk: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 14h.01M11 14h6"/>', alert: '<path d="M12 3l9 17H3z"/><path d="M12 10v4M12 17h.01"/>'
};
function svg(name, size, stroke) {
  return `<svg class="g" viewBox="0 0 24 24" width="${size || 22}" height="${size || 22}" fill="none" stroke="currentColor" stroke-width="${stroke || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${G[name] || G.bolt}</svg>`;
}

// Pip: the neutral default companion. Colour follows the theme.
function pip(size, mood) {
  const eyes = mood === "done"
    ? '<rect x="4" y="4" width="1" height="1"/><rect x="5" y="3" width="1" height="1"/><rect x="6" y="4" width="1" height="1"/><rect x="8" y="4" width="1" height="1"/><rect x="9" y="3" width="1" height="1"/><rect x="10" y="4" width="1" height="1"/>'
    : mood === "sleeping" ? '<rect x="4" y="5" width="2" height="1"/><rect x="8" y="5" width="2" height="1"/>'
    : mood === "asking" ? '<rect x="5" y="3" width="2" height="3"/><rect x="9" y="3" width="2" height="3"/>'
    : '<rect x="4" y="3" width="2" height="3"/><rect x="8" y="3" width="2" height="3"/>';
  const cls = mood === "working" ? "bobf" : mood === "asking" ? "hop" : mood === "sleeping" ? "" : "bob";
  return `<svg viewBox="0 -2 14 14" width="${size}" height="${Math.round(size * 14 / 14)}" shape-rendering="crispEdges" aria-hidden="true"><g class="${cls}"><rect x="2" y="1" width="10" height="8" fill="var(--live)"/><rect x="3" y="9" width="2" height="2" fill="var(--live)"/><rect x="9" y="9" width="2" height="2" fill="var(--live)"/><g fill="var(--plane)">${eyes}</g>${mood === "asking" ? '<rect x="12" y="-2" width="2" height="1" fill="var(--wait)"/><rect x="13" y="-1" width="1" height="1" fill="var(--wait)"/><rect x="12" y="0" width="1" height="1" fill="var(--wait)"/>' : ""}</g></svg>`;
}

// Clawd: Claude Code's terminal mascot, drawn from its real banner characters:
//    ▐▛███▜▌
//   ▝▜█████▛▘
//     ▘▘ ▝▝
// Each block-quadrant is one pixel; terminal cells are twice as tall as wide, so pixels are 1 x 2.
// Personal skin only (it is Anthropic's mascot).
function clawd(size, state) {
  const B = state === "error" ? "#9A8A84" : "#D77757", D = "#1A1210", Q = "#E8B44C";
  const p = (x, y, w, h, f) => `<rect x="${x}" y="${y * 2}" width="${w}" height="${(h || 1) * 2}" fill="${f}"/>`;
  let body = p(3, 0, 12, 1, B) + p(3, 1, 2, 1, B) + p(6, 1, 6, 1, B) + p(13, 1, 2, 1, B) + p(3, 3, 12, 1, B);
  // arms row (y2): x1..16, unless raised
  const leftUp = state === "listening", rightUp = state === "listening" || state === "asking";
  body += p(leftUp ? 3 : 1, 2, (leftUp ? 3 : 1) === 1 ? (rightUp ? 14 : 16) : (rightUp ? 12 : 14), 1, B);
  if (leftUp) body += p(1, 0, 1, 2, B) + p(2, 1, 1, 1, B);
  if (rightUp) body += p(16, 0, 1, 2, B) + p(15, 1, 1, 1, B);
  // eyes: the two notches in the top row
  let eyes = p(5, 1, 1, 1, D) + p(12, 1, 1, 1, D);
  if (state === "sleeping") eyes = `<rect x="5" y="3" width="1" height="1" fill="${D}"/><rect x="12" y="3" width="1" height="1" fill="${D}"/>` + p(5, 1, 1, 0.5, B) + p(12, 1, 1, 0.5, B);
  const legsA = p(4, 4, 1, 1, B) + p(11, 4, 1, 1, B), legsB = p(6, 4, 1, 1, B) + p(13, 4, 1, 1, B);
  const legs = state === "working" ? `<g class="lA">${legsA}</g><g class="lB">${legsB}</g>` : legsA + legsB;
  let extra = "";
  if (state === "asking") extra = `<g fill="${Q}"><rect x="16" y="-5" width="2" height="1"/><rect x="17.4" y="-4.4" width="0.8" height="1.4"/><rect x="16.6" y="-3" width="1" height="1"/><rect x="16.6" y="-1.4" width="1" height="0.8"/></g>`;
  if (state === "sleeping") extra = `<g fill="var(--mute)"><rect x="15" y="-4" width="2" height="0.6"/><rect x="16" y="-3.4" width="0.6" height="0.8"/><rect x="15" y="-2.6" width="2" height="0.6"/></g>`;
  const cls = state === "working" ? "bobf" : state === "asking" || state === "done" ? "hop" : state === "sleeping" ? "" : "bob";
  const h = Math.round(size * 15 / 18);
  return `<svg viewBox="0 -5 18 15" width="${size}" height="${h}" shape-rendering="crispEdges" aria-hidden="true" style="overflow:visible${state === "sleeping" ? ";opacity:.75" : ""}"><g class="${cls}">${body}${legs}${eyes}${extra}</g></svg>`;
}
function companion(skin, size, state) {
  if (skin === "none") {
    const c = { working: "var(--live)", asking: "var(--wait)", done: "var(--ok)", sleeping: "var(--mute)" }[state] || "var(--rule)";
    return `<span style="width:${Math.round(size / 3)}px;height:${Math.round(size / 3)}px;border-radius:6px;background:${c};display:inline-block;flex:0 0 auto"></span>`;
  }
  return skin === "clawd" ? clawd(size, state) : pip(size, state);
}
