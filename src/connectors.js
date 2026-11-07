// Connectors: what Blink can do inside the apps on this PC, through each app's own doors (its links, Windows' media
// controls, Outlook's automation, Teams' local meeting connection, Steam's library). No AI and no screen control.
// The same actions are used by keys ("App actions" in Add a key), routines, and Blink (typed, spoken or via the AI).
//
// A connector: { id, name, detect(env) -> bool, actions: [{ id, label, params: [{ name, label, kind, optional }], say: [regex], run(p, env) }] }
// run() returns { say } or { error }. env gives the panel's own abilities (open links, media keys, Outlook, Teams meeting, keys).

const enc = encodeURIComponent;
const has = (env, re) => (env.apps || []).some((a) => re.test(a.name)) || false;

const CONNECTORS = [
  {
    id: "spotify", name: "Spotify", detect: (env) => has(env, /^spotify$/i),
    actions: [
      { id: "playpause", label: "Play or pause", params: [], say: [/^(play|pause|resume)( (the )?music| spotify)?$/], run: async (p, env) => { await env.media("toggle", "spotify"); return { say: "Done." }; } },
      { id: "next", label: "Next song", params: [], say: [/^(next|skip)( song| track)?( on spotify)?$/], run: async (p, env) => { await env.media("next", "spotify"); return { say: "Next song." }; } },
      { id: "prev", label: "Previous song", params: [], say: [/^(previous|last|go back a) (song|track)$/], run: async (p, env) => { await env.media("prev", "spotify"); return { say: "Previous song." }; } },
      { id: "search", label: "Search Spotify", params: [{ name: "q", label: "What to look for", kind: "text" }], say: [/^(?:search|find|look up) (.+?) on spotify$/], run: async (p, env) => { env.open("spotify:search:" + enc(p.q)); return { say: "Here's " + p.q + " on Spotify." }; } },
      { id: "liked", label: "Open Liked Songs", params: [], say: [/^(play |open )?(my )?liked songs$/], run: async (p, env) => { env.open("spotify:collection:tracks"); return { say: "Here are your liked songs." }; } },
      { id: "link", label: "Open a playlist, album or song", params: [{ name: "url", label: "Spotify link (Share, Copy link)", kind: "text" }], say: [], run: async (p, env) => { const m = String(p.url || "").match(/(playlist|album|track|artist)[/:]([A-Za-z0-9]+)/); if (!m) return { error: "That isn't a Spotify link" }; env.open("spotify:" + m[1] + ":" + m[2]); return { say: "Opening it in Spotify." }; } }
    ]
  },
  {
    id: "teams", name: "Microsoft Teams", detect: (env) => has(env, /teams/i),
    actions: [
      // Teams' own meeting shortcuts (Ctrl+Shift+M, O, K, H), pressed in the Teams window, then you're back where you were
      { id: "mute", label: "Mute or unmute me (in a meeting)", params: [], say: [/^(mute|unmute)( me| my mic)? (on|in) teams$/, /^(mute|unmute) me in (the|my) meeting$/], run: async (p, env) => env.keysIn(/teams/i, [0x11, 0x10, 0x4D], "Done.") },
      { id: "camera", label: "Camera on or off (in a meeting)", params: [], say: [/^(turn (on|off) |toggle )?(my )?camera( (on|off))? (on|in) teams$/], run: async (p, env) => env.keysIn(/teams/i, [0x11, 0x10, 0x4F], "Done.") },
      { id: "hand", label: "Raise or lower my hand", params: [], say: [/^(raise|lower) (my )?hand$/], run: async (p, env) => env.keysIn(/teams/i, [0x11, 0x10, 0x4B], "Done.") },
      { id: "leave", label: "Leave the meeting", params: [], say: [/^(leave|end|hang up)( the)? (teams )?(meeting|call)$/], run: async (p, env) => env.keysIn(/teams/i, [0x11, 0x10, 0x48], "You've left the meeting.") },
      { id: "chat", label: "Open a chat with a message ready", params: [{ name: "to", label: "Their work email", kind: "email" }, { name: "text", label: "Message (you press Send)", kind: "text", optional: true }], say: [], run: async (p, env) => { env.open("https://teams.microsoft.com/l/chat/0/0?users=" + enc(p.to) + (p.text ? "&message=" + enc(p.text) : "")); return { say: p.text ? "Your message is ready in Teams. Press Enter to send." : "Opening the chat." }; } }
    ]
  },
  {
    // Discord's own shortcuts (Ctrl+Shift+M mute, Ctrl+Shift+D deafen), pressed in the Discord window
    id: "discord", name: "Discord", detect: (env) => has(env, /^discord$/i),
    actions: [
      { id: "mute", label: "Mute or unmute my mic", params: [], say: [/^(mute|unmute)( me| my mic)? (on|in) discord$/, /^toggle (my )?mic (on|in) discord$/], run: async (p, env) => env.keysIn(/discord/i, [0x11, 0x10, 0x4D], "Done.") },
      { id: "deafen", label: "Deafen or undeafen", params: [], say: [/^(deafen|undeafen)( me)?( (on|in) discord)?$/], run: async (p, env) => env.keysIn(/discord/i, [0x11, 0x10, 0x44], "Done.") }
    ]
  },
  {
    id: "steam", name: "Steam", detect: (env) => (env.games || []).some((g) => g.id),
    actions: [
      { id: "launch", label: "Launch a game", params: [{ name: "game", label: "Game", kind: "game" }], say: [/^(?:launch|start|play|run) (.+?)(?: on steam)?$/], run: async (p, env) => { const g = env.game(p.game); if (!g) return { error: "I can't find " + p.game + " in your Steam games" }; env.open("steam://rungameid/" + g.id); return { say: "Starting " + g.name + "." }; } },
      { id: "store", label: "Open a game's store page", params: [{ name: "game", label: "Game", kind: "game" }], say: [], run: async (p, env) => { const g = env.game(p.game); env.open("steam://openurl/https://store.steampowered.com/" + (g ? "app/" + g.id + "/" : "search/?term=" + enc(p.game))); return { say: "Opening the store page." }; } },
      { id: "friends", label: "Open friends", params: [], say: [/^(open |show )?(my )?steam friends$/], run: async (p, env) => { env.open("steam://open/friends"); return { say: "Opening your Steam friends." }; } },
      { id: "downloads", label: "Open downloads", params: [], say: [/^(open |show )?(my )?steam downloads$/], run: async (p, env) => { env.open("steam://open/downloads"); return { say: "Opening Steam downloads." }; } }
    ]
  },
  {
    id: "outlook", name: "Outlook", detect: (env) => env.outlook || has(env, /outlook/i),
    actions: [
      { id: "compose", label: "New email to someone", params: [{ name: "to", label: "Email address", kind: "email" }, { name: "subject", label: "Subject", kind: "text", optional: true }], say: [], run: async (p, env) => env.outlook("compose", p.to, p.subject) },
      { id: "from", label: "Emails from someone", params: [{ name: "from", label: "Email address or name", kind: "text" }], say: [/^(?:show|find|open) (?:my )?(?:emails?|mail) from (.+)$/], run: async (p, env) => env.outlook("from", p.from) },
      { id: "calendar", label: "Open my calendar", params: [], say: [/^(open|show) (my )?(outlook )?calendar$/], run: async (p, env) => env.outlook("calendar") }
    ]
  },
  {
    id: "zoom", name: "Zoom", detect: (env) => has(env, /zoom/i),
    actions: [
      { id: "join", label: "Join a meeting", params: [{ name: "id", label: "Meeting ID", kind: "text" }, { name: "pwd", label: "Passcode", kind: "text", optional: true }], say: [/^join (?:zoom|the zoom|my zoom)?(?: meeting)? ?(\d[\d ]{8,13})$/], run: async (p, env) => { const id = String(p.id || "").replace(/\D/g, ""); if (id.length < 9) return { error: "That meeting ID looks too short" }; env.open("zoommtg://zoom.us/join?confno=" + id + (p.pwd ? "&pwd=" + enc(p.pwd) : "")); return { say: "Joining the Zoom meeting." }; } }
    ]
  },
  {
    id: "browser", name: "Web browser", detect: () => true,
    actions: [
      { id: "site", label: "Open a website", params: [{ name: "url", label: "Website", kind: "text" }], say: [], run: async (p, env) => { const u = /^https?:\/\//i.test(p.url) ? p.url : "https://" + p.url; env.open(u); return { say: "Opening " + u.replace(/^https?:\/\//, "") + "." }; } },
      { id: "youtube", label: "Search YouTube", params: [{ name: "q", label: "What to look for", kind: "text" }], say: [/^(?:search |find |play )?(.+?) on youtube$/], run: async (p, env) => { env.open("https://www.youtube.com/results?search_query=" + enc(p.q)); return { say: "Here's " + p.q + " on YouTube." }; } },
      { id: "maps", label: "Find a place on the map", params: [{ name: "q", label: "Place", kind: "text" }], say: [/^(?:where is|find|show me) (.+?) on (?:the )?map$/], run: async (p, env) => { env.open("https://www.google.com/maps/search/" + enc(p.q)); return { say: "Here's " + p.q + " on the map." }; } }
    ]
  },
  {
    id: "windows", name: "Windows", detect: () => true,
    actions: [
      { id: "settings", label: "Open a settings page", params: [{ name: "page", label: "Page", kind: "choice", options: [["display", "Display"], ["sound", "Sound"], ["bluetooth", "Bluetooth"], ["network", "Wi-Fi and network"], ["windowsupdate", "Windows Update"], ["apps", "Apps"], ["personalization", "Personalisation"]] }], say: [/^(?:open )?(display|sound|bluetooth|network|wi-?fi|windows update|apps) settings$/], run: async (p, env) => { const pg = String(p.page || "").replace(/^wi-?fi$/, "network").replace(/^windows update$/, "windowsupdate"); env.open("ms-settings:" + pg); return { say: "Opening " + pg.replace("windowsupdate", "Windows Update") + " settings." }; } },
      { id: "desktop", label: "Show the desktop", params: [], say: [], run: async (p, env) => { await env.act("showDesktop"); return { say: "Here's your desktop." }; } },
      { id: "switch", label: "Switch to an app", params: [{ name: "app", label: "App", kind: "app" }], say: [/^(?:switch|go|change) to (?:my )?(.+?)(?: window| app)?$/, /^(?:show|bring up) (?:my )?(.+?) window$/], run: async (p, env) => env.act("winSwitch", p.app) },
      { id: "close", label: "Close an app", params: [{ name: "app", label: "App", kind: "app" }], say: [/^(?:close|quit|exit) (?:the |my )?(.+?)(?: app| window)?$/], run: async (p, env) => env.act("winClose", p.app) },
      { id: "snap", label: "Put two apps side by side", params: [{ name: "left", label: "On the left", kind: "app" }, { name: "right", label: "On the right", kind: "app", optional: true }], say: [/^(?:put|move|snap) (?:the |my )?(.+?) (?:on|to) the left(?: and (?:the |my )?(.+?) (?:on|to) the right)?$/], run: async (p, env) => env.act("winSnap", p) },
      { id: "bright", label: "Screen brightness", params: [{ name: "level", label: "Brightness (0 to 100)", kind: "text" }], say: [/^(?:set |change )?(?:the )?(?:screen )?brightness (?:to )?(\d{1,3})(?: percent| %)?$/], run: async (p, env) => env.act("brightness", p.level) },
      { id: "shutdown", label: "Shut down (you can cancel for a minute)", params: [], say: [/^(?:shut ?down|turn off) (?:the |my )?(?:pc|computer|laptop)$/], run: async (p, env) => env.act("power", "shutdown") },
      { id: "restart", label: "Restart (you can cancel for a minute)", params: [], say: [/^(?:restart|reboot) (?:the |my )?(?:pc|computer|laptop)$/], run: async (p, env) => env.act("power", "restart") },
      { id: "cancelpower", label: "Cancel a shutdown or restart", params: [], say: [/^(?:cancel|stop|abort) (?:the )?(?:shut ?down|restart|reboot)$/, /^don'?t (?:shut ?down|restart)$/], run: async (p, env) => env.act("power", "cancel") },
      { id: "clip", label: "Record the last 30 seconds (Game Bar)", params: [], say: [/^(?:record|save|clip) (?:the |that )?(?:last )?(?:30 seconds|thirty seconds|clip)$/, /^clip (?:it|that)$/], run: async (p, env) => env.act("gameBar", "clip") },
      { id: "rec", label: "Start or stop recording (Game Bar)", params: [], say: [/^(?:start|stop) (?:screen )?recording$/], run: async (p, env) => env.act("gameBar", "record") },
      { id: "wifi", label: "Wi-Fi settings", params: [], say: [/^(?:turn (?:off|on)|disable|enable|switch (?:off|on)) (?:the )?wi-?fi$/], run: async (p, env) => { env.open("ms-settings:network-wifi"); return { say: "Here are your Wi-Fi settings. Turning Wi-Fi off would cut me off too, so that one's your tap." }; } },
      { id: "dark", label: "Dark or light mode", params: [{ name: "mode", label: "Mode", kind: "choice", options: [["dark", "Dark"], ["light", "Light"]] }], say: [], run: async (p, env) => { await env.act("windowsTheme", p.mode === "light" ? "light" : "dark"); return { say: (p.mode === "light" ? "Light" : "Dark") + " mode is on." }; } }
    ]
  }
];

// a name you said that is one of this PC's apps ("chrome" -> Google Chrome, "word" -> Microsoft Word)
function isApp(env, n) { const q = String(n || "").toLowerCase().replace(/^(the|my)\s+/, "").trim(); if (q.length < 2) return false; return (env.apps || []).some((a) => { const x = String(a.name || "").toLowerCase(); return x === q || x.split(/\s+/).includes(q) || (q.length > 3 && x.includes(q)); }); }
// what this PC can do: only connectors for apps that are here
function available(env) { return CONNECTORS.filter((c) => { try { return c.detect(env); } catch { return false; } }); }
function find(cid, aid) { const c = CONNECTORS.find((x) => x.id === cid); return c && c.actions.find((a) => a.id === aid) ? { c, a: c.actions.find((a) => a.id === aid) } : null; }
// a sentence that matches an action's phrases runs it directly (no AI)
function match(q, env) {
  for (const c of available(env)) for (const a of c.actions) for (const re of a.say || []) {
    const m = String(q || "").match(re);
    if (m) {
      // each part of the sentence fills the details in order ("put [spotify] on the left and [chrome] on the right")
      const p = {}; const params = a.params || [];
      if (params.some((x, i) => !x.optional && m[i + 1] === undefined)) continue;
      params.forEach((x, i) => { if (m[i + 1] !== undefined) p[x.name] = m[i + 1].trim(); });
      // only real things on this PC: "start a timer" isn't a game, "close the door" isn't an app
      if (params.some((x) => p[x.name] && x.kind === "game" && !(env.game && env.game(p[x.name])))) continue;
      if (params.some((x) => p[x.name] && x.kind === "app" && !isApp(env, p[x.name]))) continue;
      return { cid: c.id, aid: a.id, params: p };
    }
  }
  return null;
}
async function run(cid, aid, params, env) {
  const f = find(cid, aid); if (!f) return { error: "Unknown action" };
  if (!f.c.detect(env)) return { error: f.c.name + " isn't on this PC" };
  for (const p of f.a.params || []) if (!p.optional && !String((params || {})[p.name] || "").trim()) return { error: "Missing: " + p.label };
  try { return (await f.a.run(params || {}, env)) || { say: "Done." }; } catch (e) { return { error: String(e.message || e).slice(0, 160) }; }
}
// a short list for the AI and for screens: what can be done here
function catalog(env) { return available(env).map((c) => ({ id: c.id, name: c.name, actions: c.actions.map((a) => ({ id: a.id, label: a.label, params: (a.params || []).map((p) => ({ name: p.name, label: p.label, kind: p.kind, optional: !!p.optional, options: p.options || null })) })) })); }
module.exports = { CONNECTORS, available, find, match, run, catalog };
