// Blink's on-PC command engine: plain words in, an action out. No AI and no internet, so it works for everyone.
// parse() only decides what to do; main.js does it. Anything that sends or changes something comes back as
// { confirm } so the panel asks first.
const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9%:.+\-*/() \u0600-\u06FF]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter(Boolean);
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90, half: 0.5 };
const num = (s) => { const m = String(s).match(/\d+(\.\d+)?/); if (m) return Number(m[0]); for (const [k, v] of Object.entries(NUM)) if (new RegExp("\\b" + k + "\\b").test(s)) return v; return null; };
// How close a spoken name is to a key, person, playlist or layout name (all words of the target, or a strong prefix).
const { skeleton } = require("./arabic");
const connectors = require("./connectors");
function score(q, name) {
  // spoken in Arabic: compare by sound
  if (/[\u0600-\u06FF]/.test(String(q))) { const x = skeleton(q), y = skeleton(name); if (!x || !y) return 0; if (x === y) return 90; if (y.length >= 3 && x.includes(y)) return 75; if (x.length >= 3 && y.startsWith(x)) return 70; return 0; }
  const a = norm(q), b = norm(name);
  if (!b) return 0;
  if (a === b) return 100;
  if (a.includes(b)) return 80 + b.length / 100;
  const bw = b.split(" "), aw = new Set(a.split(" "));
  const hit = bw.filter((w) => aw.has(w) || [...aw].some((x) => x.length > 3 && (w.startsWith(x) || x.startsWith(w)))).length;
  // every word you said is in the name ("gym" -> "Gym Mix")
  const qw = a.split(" ").filter((w) => !/^(my|the|a|playlist|app)$/.test(w));
  if (qw.length && qw.every((w) => bw.some((x) => x === w || (w.length > 2 && x.startsWith(w))))) return 70;
  return hit ? 40 * hit / bw.length : 0;
}
function best(q, list, get) { let top = null, s = 0; for (const it of list) { const v = score(q, get(it)); if (v > s) { s = v; top = it; } } return s >= 40 ? top : null; }

// ctx: { keys, people, playlists, layouts, apps, games, hasAI, meeting }
// links Blink may open: plain web pages; web addresses with search terms only on well-known sites; app links in known safe shapes
const SEARCH_HOSTS = /^(www\.)?(google\.[a-z.]+|bing\.com|duckduckgo\.com|youtube\.com|music\.youtube\.com|maps\.google\.[a-z.]+|google\.[a-z.]+\/maps|store\.steampowered\.com|store\.epicgames\.com|open\.spotify\.com|en\.wikipedia\.org|amazon\.[a-z.]+|github\.com)$/i;
function safeLink(u) {
  u = String(u || "").trim();
  if (/^https?:\/\//i.test(u)) { try { const x = new URL(u); if (x.username || x.password) return null; if ((x.search || x.hash.length > 1) && !SEARCH_HOSTS.test(x.hostname)) return x.origin + x.pathname; return x.toString(); } catch { return null; } }
  if (/^steam:\/\/openurl\/https:\/\/store\.steampowered\.com\/[a-z0-9/?=&%+._-]*$/i.test(u)) return u;
  if (/^steam:\/\/(rungameid|store|nav)\/[\w/]*$/i.test(u)) return u;
  if (/^ms-settings:[a-z-]+$/i.test(u)) return u;
  if (/^ms-windows-store:\/\/(search\/\?query=[\w%+ .-]{1,80}|pdp\/\?productid=\w+|home)$/i.test(u)) return u;
  if (/^spotify:(search:[\w%+ .-]{1,80}|(track|album|playlist|artist):\w+)$/i.test(u)) return u;
  if (/^(xbox|goggalaxy|battlenet|discord|msteams|com\.epicgames\.launcher):\/\/[\w/.-]*$/i.test(u)) return u;
  return null;
}
// time in another city, worked out on the PC
const CITY_TZ = { london: "Europe/London", paris: "Europe/Paris", berlin: "Europe/Berlin", madrid: "Europe/Madrid", rome: "Europe/Rome", istanbul: "Europe/Istanbul", moscow: "Europe/Moscow", dubai: "Asia/Dubai", "abu dhabi": "Asia/Dubai", bahrain: "Asia/Bahrain", manama: "Asia/Bahrain", riyadh: "Asia/Riyadh", jeddah: "Asia/Riyadh", doha: "Asia/Qatar", kuwait: "Asia/Kuwait", muscat: "Asia/Muscat", cairo: "Africa/Cairo", karachi: "Asia/Karachi", delhi: "Asia/Kolkata", "new delhi": "Asia/Kolkata", mumbai: "Asia/Kolkata", india: "Asia/Kolkata", singapore: "Asia/Singapore", "hong kong": "Asia/Hong_Kong", beijing: "Asia/Shanghai", shanghai: "Asia/Shanghai", tokyo: "Asia/Tokyo", seoul: "Asia/Seoul", sydney: "Australia/Sydney", melbourne: "Australia/Melbourne", "new york": "America/New_York", "los angeles": "America/Los_Angeles", "san francisco": "America/Los_Angeles", chicago: "America/Chicago", toronto: "America/Toronto", "mexico city": "America/Mexico_City", "sao paulo": "America/Sao_Paulo", johannesburg: "Africa/Johannesburg", lagos: "Africa/Lagos", manila: "Asia/Manila", jakarta: "Asia/Jakarta", bangkok: "Asia/Bangkok", "kuala lumpur": "Asia/Kuala_Lumpur", tehran: "Asia/Tehran", amman: "Asia/Amman", beirut: "Asia/Beirut" };
function parse(text, ctx) {
  const raw = String(text || "").trim();
  const q = norm(raw);
  if (!q) return null;
  const nm = raw.match(/^(?:call me|my name is|i'm|i am|name'?s)\s+([^\d,.!?]{1,30})[.!]?$/i);
  if (nm && !/^(busy|back|done|here|ok|okay|fine|good|tired|working|in a meeting)\b/i.test(nm[1].trim())) return { setName: nm[1].trim() };
  if (/^(what'?s|what is) my name\??$/.test(q)) return { say: ctx.name ? "You're " + ctx.name + "." : "You haven't told me yet. Say: call me, then your name." };
  // files: "find the pdf I downloaded yesterday", "show my screenshots from today", "open the second one"
  const FOLDERS = { downloads: "downloads", download: "downloads", downloaded: "downloads", desktop: "desktop", documents: "documents", docs: "documents", pictures: "pictures", photos: "pictures", videos: "videos", music: "music" };
  const KINDS = { pdf: "pdf", pdfs: "pdf", photo: "image", photos: "image", picture: "image", pictures: "image", image: "image", images: "image", screenshot: "shot", screenshots: "shot", video: "video", videos: "video", document: "doc", documents: "doc", doc: "doc", word: "doc", excel: "sheet", spreadsheet: "sheet", spreadsheets: "sheet", zip: "zip", zips: "zip", file: "any", files: "any", installer: "exe", installers: "exe" };
  const fm = q.match(/^(?:find|show|list|where(?:s| is| are)|get)(?: me)? (?:the |my |all |that )?(?:last |latest |recent |new |newest )?(pdfs?|photos?|pictures?|images?|screenshots?|videos?|documents?|docs?|word|excel|spreadsheets?|zips?|files?|installers?)(?: files?)?(?: (?:i|that i|we) (?:downloaded|saved|got|took|made))?(?: (?:in|on|from) (?:my |the )?(downloads?|desktop|documents|docs|pictures|photos|videos|music))?(?: (?:from )?(today|yesterday|this week|last week))?$/);
  if (fm && (fm[2] || fm[3] || /downloaded|saved|took/.test(q) || KINDS[fm[1]] !== "any")) {
    const where = fm[2] ? FOLDERS[fm[2]] : /downloaded/.test(q) ? "downloads" : KINDS[fm[1]] === "shot" ? "pictures" : KINDS[fm[1]] === "image" ? "pictures" : "downloads";
    return { act: "findFiles", arg: { where, kind: KINDS[fm[1]] || "any", when: fm[3] || "" } };
  }
  const nth = q.match(/^(?:open|show|play) (?:the )?(first|second|third|fourth|fifth|last|1st|2nd|3rd|4th|5th|\d) ?(?:one|file)?$/);
  if (nth) { const N = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5, last: -1 }; return { act: "openNth", arg: N[nth[1]] || Number(nth[1]) || 1 }; }
  // clearing old files: Blink lists them and waits for a clear yes; they go to the Recycle Bin
  const dm = q.match(/^(?:delete|clear|clean up|remove|get rid of) (?:the |my |all )?(?:old )?(screenshots?|pdfs?|installers?|zips?|files?|videos?|photos?)(?: (?:on|in|from) (?:my |the )?(desktop|downloads?|documents|pictures))?(?: older than (?:a |one )?(week|month|day))?$/);
  if (dm) return { act: "clearFiles", arg: { where: dm[2] ? FOLDERS[dm[2]] : /screenshot/.test(dm[1]) ? "pictures" : "downloads", kind: KINDS[dm[1]] || "any", older: dm[3] || "week" } };
  if (/^(?:yes|yeah|yep|sure|ok(?:ay)?|do it|go ahead)(?:,? (?:delete|clear|bin|remove) (?:them|it|those))?[.!]?$/.test(q) && ctx.pendingDelete) return { act: "clearConfirm", arg: true };
  if (/^(?:no|nope|cancel|don'?t|keep them|never ?mind)[.!]?$/.test(q) && ctx.pendingDelete) return { act: "clearConfirm", arg: false };
  const has = (re) => re.test(q);
  // routines: "when I start a game, set volume 40 and open discord"
  const rm = raw.match(/^\s*(when|whenever|every time)\s+(.+?)\s*,\s*(.+)$/i);
  if (rm) {
    const w = norm(rm[2]);
    const when = /game/.test(w) ? { type: "game" } : /(\d{1,2})(:(\d{2}))?\s*(am|pm)?/.test(w) && /\bat\b|\d/.test(w) ? timeOf(w) : (ctx.layouts.find((L) => w.includes(norm(L))) ? { type: "layout", value: ctx.layouts.find((L) => w.includes(norm(L))) } : /focus/.test(w) ? { type: "focus" } : null);
    const steps = rm[3].split(/\s*(?:,|\band then\b|\bthen\b|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);
    if (!when) return { say: "I can run routines when a game starts, when you switch to a layout, when Focus starts, or at a time of day." };
    const bad = steps.filter((s) => { const p = parse(s, ctx); return !p || p.ai || p.routine; });
    if (bad.length) return { say: "I don't know how to do: " + bad.join(", ") + "." };
    return { routine: { when, steps }, say: "Routine saved: " + describeWhen(when) + ", " + steps.join(", then ") + "." };
  }
  // music
  if (has(/^(pause|stop)( the)? (music|song|playing)$|^pause$/)) return { act: "media", arg: { action: "pause" }, say: "Paused." };
  // "play some music" with no AI to pick something: just carry on with the music app
  if (!ctx.hasAI && has(/^(play|put on) (some |any )?(music|something|anything|songs?)$/)) return { act: "media", arg: { action: "play" }, say: "Playing." };
  // the play/pause button, however it's said ("play or pause", "play/pause", "toggle the music")
  if (has(/^(play ?(or|\/|and) ?pause|pause ?(or|\/) ?play|toggle (the )?(music|playback|play)|play pause)$/)) return { act: "media", arg: { action: "toggle" }, say: "Done." };
  // "play the music" / "play the song" may mean the one you were just talking about: contextual
  if (has(/^(play|resume)( the)? (music|song)?$|^resume$|^play$/)) return { act: "media", arg: { action: "play" }, say: "Playing.", contextual: /(the )?(music|song)$/.test(q) };
  if (has(/^(next|skip)( song| track)?$/)) return { act: "media", arg: { action: "next" }, say: "Next song." };
  if (has(/^(previous|prev|back|last)( song| track)?$/)) return { act: "media", arg: { action: "prev" }, say: "Previous song." };
  if (has(/what(s| is) (playing|this song)|which song/)) return { info: "song" };
  // volume and mic
  if (has(/\b(unmute|turn on) (my )?(mic|microphone)|\bmic on\b|unmute me/)) return { act: "mic", arg: false, say: "Mic on." };
  if (has(/\b(mute|turn off) (my )?(mic|microphone)|\bmic off\b|^mute me$/)) return { act: "mic", arg: true, say: "Mic off." };
  if (has(/^unmute( sound| all| the sound)?$|sound on/)) return { act: "mute", arg: false, say: "Sound on." };
  if (has(/^mute( sound| all| the sound| everything)?$|sound off/)) return { act: "mute", arg: true, say: "Sound off." };
  if (has(/volume|louder|quieter|turn (it )?(up|down)/)) {
    const n = num(q);
    if (n != null && !has(/up|down|louder|quieter/)) return { act: "volume", arg: Math.max(0, Math.min(100, n)), say: "Volume " + Math.max(0, Math.min(100, n)) + "." };
    return { act: "volStep", arg: has(/down|quieter|lower/) ? -(n || 10) : (n || 10), say: has(/down|quieter|lower/) ? "Quieter." : "Louder." };
  }
  // focus, timers, reminders
  if (has(/^(stop|end|cancel) focus/)) return { act: "focus", arg: "reset", say: "Focus stopped." };
  if (has(/^focus\b|start focus|focus mode/)) { const n = num(q) || 25; return { act: "focusFor", arg: n, say: "Focus on for " + n + " minutes. Holding updates." }; }
  const rem = raw.match(/remind me (?:in )?(\d+|an?|one|two|five|ten|fifteen|twenty|thirty)\s*(minutes|minute|mins|min|hours|hour|hrs|hr)?\b\s*(?:to )?(.*)$/i);
  if (rem) { let n = /^an?$/i.test(rem[1]) ? 1 : num(rem[1]) || 1; if (/^h/i.test(rem[2] || "")) n *= 60; return { remind: { min: n, text: rem[3] || "Time's up" }, say: "Okay, in " + n + " minutes." }; }
  const tm = q.match(/^(set )?(a )?timer (for )?(.+)$/);
  if (tm) { let n = num(tm[4]) || 5; if (/hour/.test(tm[4])) n *= 60; return { remind: { min: n, text: "Timer done" }, say: "Timer set for " + n + " minutes." }; }
  // layouts
  const lay = ctx.layouts.find((L) => has(new RegExp("\\b" + norm(L).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b")) && has(/mode|layout|switch|screen|go to|show/));
  if (lay) return { act: "setLayout", arg: lay, say: "Switched to " + lay + "." };
  // meetings
  if (has(/next meeting|my meetings|meetings today|my day|whats on today|calendar/)) return { info: "meeting" };
  if (has(/^join( the)?( meeting| call)?$/)) return { info: "join" };
  if (has(/brief me|morning brief|catch me up/)) return { info: "brief" };
  // time, date, maths
  if (has(/^what(s| is) the time|^time$|what time is it/) && !/ in [a-z]/.test(q)) return { say: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "." };
  if (has(/^what(s| is) (the )?date|what day is it|^today$/)) return { say: new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) + "." };
  const mathm = raw.replace(/^(what is|whats|calculate|calc)\s+/i, "").replace(/x/gi, "*").replace(/[÷]/g, "/");
  if (/^[\d\s.+\-*/()%]+$/.test(mathm) && /\d\s*[+\-*/%]\s*\d/.test(mathm)) { try { const v = Function('"use strict";return (' + mathm.replace(/%/g, "/100") + ")")(); if (Number.isFinite(v)) return { say: mathm.trim() + " = " + (Math.round(v * 1e6) / 1e6) + "." }; } catch { } }
  // screenshot
  if (has(/screenshot|screen shot|capture (my )?screen/) && !has(/whats on|explain|what is on/)) return { act: "builtinShot", say: "Screenshot copied." };
  // copied text and the screen: needs an AI
  const pre = [["summ", "summary"], ["explain", "explain"], ["translate", "translate"], ["fix|correct|proofread|improve", "fix"], ["action items|todos|to dos|tasks from", "actions"], ["reply|respond|answer (this|the) (email|message)", "reply"]];
  if (has(/copied|clipboard|this text|selected/) || has(/^(summari[sz]e|explain|translate|fix|proofread)$/)) for (const [re, id] of pre) if (has(new RegExp(re))) return { aiAction: id };
  if (has(/(whats|what is) on (my )?screen|this screen|this (email|page|error|sheet|chat)|on screen/)) return { aiAction: "screen", extra: raw };
  // people: chat, call, email
  // a message you send yourself: "message ali on whatsapp saying I'm late", "email sara that the report is ready"
  const mm = q.match(/^(?:message|text|tell|send) (.+?) (?:on|in|via|through) (whatsapp|teams)(?:,)? (?:saying|that|to say|:) (.+)$/) || q.match(/^(email|mail) (.+?) (?:saying|that|about|:) (.+)$/);
  if (mm) {
    const email = /^(email|mail)$/.test(mm[1]), who = email ? mm[2] : mm[1], how = email ? "email" : mm[2], body = raw.replace(/^.*?(?:saying|that|to say|about|:)\s+/i, "");
    const p = best(who, ctx.people, (x) => x.label);
    if (!p) return { say: "I don't know " + who + " yet. Add them in Add a key, People, with their " + (how === "whatsapp" ? "mobile number" : "work email") + "." };
    return { act: "personMsg", arg: { id: p.id, how, text: body.slice(0, 1000) }, say: "Your message to " + p.label + " is ready" + (how === "email" ? " in a new email" : " in " + (how === "whatsapp" ? "WhatsApp" : "Teams")) + ". Check it and press Send." };
  }
  // full screen: the app you were using, not the panel
  if (/^(?:make (?:it|this|that) )?(?:go )?full ?screen(?: (?:it|this|mode))?$|^(?:exit|leave) full ?screen$/.test(q)) return { act: "fullScreen", say: "Done." };
  // Bluetooth: Windows' own page, where one tap connects
  if (/^(?:connect|pair)(?: to)? (?:my )?(?:bluetooth )?(?:headphones|earbuds|earphones|airpods|buds|headset|speaker|.+? (?:headphones|earbuds|buds|headset|speaker|airpods))$/.test(q)) return { act: "openUrl", arg: "ms-settings:bluetooth", say: "Here's Bluetooth. Tap your headphones there to connect them." };
  // notes: things to finish, on screen until ticked off
  const nm2 = raw.match(/^\s*(?:note|notes|todo|to-?do|jot(?: down)?|add (?:a )?note|add (?:this )?to (?:my )?(?:list|notes|to-?dos?))\s*[:,-]?\s+(.{2,300})$/i);
  if (nm2) { const t = nm2[1].trim(), due = (t.match(/\s(?:by|before|until)\s+((?:today|tonight|tomorrow|eod|end of (?:the )?day|mon|tue|wed|thu|fri|sat|sun)[a-z]*|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\.?$/i) || [])[1] || ""; return { act: "noteAdd", arg: { text: due ? t.replace(/\s(?:by|before|until)\s+[^]*$/i, "").trim() : t, due }, say: "Noted" + (due ? ", by " + due : "") + ". It's on your screen until you tick it off." }; }
  if (/^(?:what'?s|what is|show|read)(?: me)? (?:on )?(?:my )?(?:notes|list|to-?dos?|to-?do list)\??$|^(?:my )?(?:notes|to-?dos?)\??$/.test(q)) return { act: "noteList" };
  const nd = q.match(/^(?:done|finished|tick(?: off)?|cross off|check off|mark (?:as )?done)(?: with)?:? (.{2,120})$/);
  if (nd) return { act: "noteDone", arg: nd[1] };
  if (/^(?:clear|remove|delete) (?:the )?(?:done|finished|ticked|completed) (?:notes|items|to-?dos?)$/.test(q)) return { act: "noteClear" };
  const dnd = q.match(/^(?:do not disturb|dont disturb me|no interruptions|quiet mode)(?: for (?:an? )?(\d+)? ?(hour|hours|minutes?|mins?))?$/);
  if (dnd) { const n = Number(dnd[1] || 1), min = /hour/.test(dnd[2] || "hour") ? n * 60 : n; return { act: "focusFor", arg: min, say: "Do not disturb for " + (min >= 60 && min % 60 === 0 ? min / 60 + " hour" + (min > 60 ? "s" : "") : min + " minutes") + ". I'll keep quiet." }; }
  // something one of this PC's apps can do by itself ("mute me on teams", "open steam downloads", "bluetooth settings")
  const conn = connectors.match(q, { apps: ctx.apps, games: (ctx.games || []).filter((g) => g.id), outlook: (ctx.apps || []).some((a) => /outlook/i.test(a.name)), game: (n) => best(n, (ctx.games || []).filter((g) => g.id), (x) => x.name) });
  if (conn) return { act: "connector", arg: conn };
  const pm = q.match(/^(chat|message|text|teams chat|call|video call|email|mail|whatsapp)( with| to)? (.+)$/) || (!/^(mute|unmute|turn|toggle|raise|lower|leave|join|share)\b/.test(q) && q.match(/^(.+?) on (teams|whatsapp)$/));
  if (pm) {
    const how = /video/.test(pm[1]) ? "video" : /call/.test(pm[1]) ? "call" : /mail/.test(pm[1]) ? "email" : /whatsapp/.test(pm[1] + (pm[2] || "")) ? "whatsapp" : "chat";
    const who = pm[3] || pm[1];
    const p = best(who, ctx.people, (x) => x.label);
    if (p) return { act: "personDo", arg: { id: p.id, how }, say: ({ chat: "Opening a chat with ", call: "Calling ", video: "Video call with ", email: "New email to ", whatsapp: "WhatsApp with " })[how] + p.label + "." };
    if (/@/.test(who)) return { act: "openUrl", arg: (how === "email" ? "mailto:" : "https://teams.microsoft.com/l/chat/0/0?users=") + encodeURIComponent(who.trim()), say: "Opening." };
    return { say: "I don't know " + who + " yet. Add them in Add a key, People." };
  }
  // search the web
  const sm = /\bsteam\b/i.test(raw) ? null : raw.match(/^(search the web for|search for|look up|google|search)\s+(.+)$/i);
  if (sm) return { act: "openUrl", arg: "https://www.google.com/search?q=" + encodeURIComponent(sm[2]), say: "Searching the web." };
  // play a playlist or a game
  const play = q.match(/^(play|put on|start)\s+(my\s+)?(.+?)(\s+playlist)?$/);
  // "play it", "play that song", "put on the one you mentioned": what "it" is lives in the conversation
  if (play && /^(it|that|this|them|those|the same|it again|that again|the (song|track|one|album|playlist|video)|that (song|one|track|album|playlist|video)|this (song|one|track)|the (song|one|track) you (said|mentioned|found|suggested)|what you (said|mentioned|found|suggested)|(the )?(first|second|third|last) one)$/.test(play[3])) return { act: "media", arg: { action: "play" }, say: "Playing.", contextual: true };
  if (play) {
    const pl = best(play[3], ctx.playlists, (x) => x.label);
    if (pl) return { act: "playlist", arg: pl.id, say: "Playing " + pl.label + "." };
    // "play" is usually music: a game only when it's clearly the game's name ("play elden ring"), or you say "start"/"the game"
    const gq = play[3].replace(/^(the )?game\s+|\s+game$/, "");
    const g = (play[1] === "start" || /\bgame\b/.test(play[3]) ? best(gq, ctx.games, (x) => x.name) : (ctx.games || []).find((x) => { const s = score(gq, x.name); return s >= 80 || (s >= 70 && norm(gq).replace(/ /g, "").length >= 8); }));
    if (g) return { act: "openUrl", arg: g.url, say: "Starting " + g.name + "." };
    // control words are never a song name ("play or pause", "play something")
    if (play[1] !== "start" && !/\b(game|movie|film|episode|with me|for me a)\b/.test(play[3]) && !/^(or |and )?(pause|resume|stop|play|next|previous|back|music|some music|something|anything)$/.test(play[3])) {
      const on = play[3].match(/^(.+?)\s+(?:on|in|from)\s+(spotify|youtube music|yt music|apple music|youtube)$/);
      const SRC = { spotify: "spotify", "youtube music": "ytmusic", "yt music": "ytmusic", "apple music": "apple", youtube: "youtube" };
      return { act: "musicPlay", arg: { q: on ? on[1] : play[3], src: on ? SRC[on[2]] : "" } };
    }
  }
  // ---- everyday things the PC answers itself ----
  if (/^(minimi[sz]e|hide) (everything|all( (the )?windows)?|all apps)$|^show (me )?(the )?desktop$/.test(q)) return { act: "showDesktop", say: "Here's your desktop." };
  const fold = q.match(/^(?:open|show)(?: me)?(?: my| the)? (downloads|documents|desktop|pictures|photos|music|videos)(?: folder)?$/);
  if (fold) return { act: "openFolder", arg: fold[1] === "photos" ? "pictures" : fold[1], say: "Opening your " + fold[1] + "." };
  if (/\bbattery\b/.test(q) && /(how much|what'?s|level|left|percent|status|check)/.test(q)) return { info: "battery" };
  const tz = q.match(/(?:what(?:'s| is) the )?time (?:is it )?in ([a-z .]+?)\??$/);
  if (tz) { const z = CITY_TZ[tz[1].trim()]; if (z) { const t = new Date().toLocaleTimeString([], { timeZone: z, hour: "numeric", minute: "2-digit" }); return { say: "It's " + t + " in " + tz[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()) + "." }; } }
  if (/^(turn on |switch to |use )?(dark|night) (mode|theme)( on)?$/.test(q)) return { act: "windowsTheme", arg: "dark", say: "Dark mode is on." };
  if (/^(turn on |switch to |use )?light (mode|theme)( on)?$|^(turn off|disable) dark (mode|theme)$/.test(q)) return { act: "windowsTheme", arg: "light", say: "Light mode is on." };
  if (/^(open |show )?(my )?steam friends( list)?$/.test(q) && (ctx.games || []).some((g) => g.id)) return { act: "openUrl", arg: "steam://open/friends", say: "Opening your Steam friends." };
  // a link on its own (what the AI sends when it knows the exact page): open exactly that
  // (any app link; the panel's allowlist decides what may actually open)
  const link = raw.match(/^(?:open\s+)?([a-z][a-z0-9.+-]{1,30}:(?:\/\/)?\S+)$/i);
  if (link) { const u = safeLink(link[1]); return u ? { act: "openUrl", arg: u, say: "Opened " + u + "." } : { say: "I won't open that kind of link." }; }
  // Steam: the store page, the DLC, or a search, for a game in your library (or any game by name)
  const store = (path) => "steam://openurl/https://store.steampowered.com/" + path;
  const gameIn = (name) => { const n = String(name || "").replace(/\b(the|game|on steam|in steam|in the steam store|steam store|store|page|please)\b/g, " ").replace(/\s+/g, " ").trim(); return { n, g: n ? best(n, (ctx.games || []).filter((x) => x.id), (x) => x.name) : null }; };
  const dlc = q.match(/(?:dlcs?|add ?ons?|expansions?|season pass)(?: store)?(?: page)?(?: for| of| from) (.+)$/) || q.match(/^(?:open|show|see|find|get|check)(?: me)?(?: the)? (.+?)(?:'s)? (?:dlcs?|add ?ons?|expansions?)(?: (?:store|page|list))*(?: (?:on|in) (?:the )?steam(?: store)?)?$/);
  if (dlc) { const { n, g } = gameIn(dlc[1]); if (n) return g ? { act: "openUrl", arg: store("dlc/" + g.id + "/"), say: "Here's the DLC for " + g.name + " in the Steam store." } : { act: "openUrl", arg: store("search/?term=" + encodeURIComponent(n + " DLC")), say: "Here are the Steam store results for " + n + " DLC." }; }
  const page = q.match(/^(?:open|show)(?: me)?(?: the)? (?:steam |store |steam store )+page (?:for|of) (.+)$/) || q.match(/^(?:open|show|find)(?: me)? (.+?) (?:on steam|in the steam store|steam store page|store page|steam page)$/);
  if (page) { const { n, g } = gameIn(page[1]); if (n) return g ? { act: "openUrl", arg: store("app/" + g.id + "/"), say: "Here's " + g.name + " in the Steam store." } : { act: "openUrl", arg: store("search/?term=" + encodeURIComponent(n)), say: "Here are the Steam store results for " + n + "." }; }
  const sst = q.match(/^(?:search|look up|find)(?: the)? steam(?: store)? for (.+)$/) || q.match(/^(?:search|look up)(?: for)? (.+?) (?:on|in) (?:the )?steam(?: store)?$/);
  if (sst) return { act: "openUrl", arg: store("search/?term=" + encodeURIComponent(sst[1])), say: "Searching the Steam store for " + sst[1] + "." };
  // open a key, an app, a website
  const op = q.match(/^(open|launch|start|run|go to|show me|show)\s+(.+)$/);
  const target = op ? op[2].replace(/^(the|my)\s+/, "") : q;
  const k = best(target, ctx.keys, (x) => x.label);
  // without "open", only the name on its own counts ("spotify"), never a word inside a sentence ("answer with one word")
  if (k && (op || q.replace(/\b(please|now|for me|pls)\b/g, " ").replace(/\s+/g, " ").trim() === norm(k.label))) return { act: "key", arg: k.id, say: "Opening " + k.label + "." };
  if (op) {
    const a = best(target, ctx.apps, (x) => x.name);
    if (a) return { act: "openApp", arg: a, say: "Opening " + a.name + "." };
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(target)) return { act: "openUrl", arg: "https://" + target, say: "Opening " + target + "." };
  }
  // anything else is for the AI
  return { ai: true };
}
function timeOf(w) { const m = w.match(/(\d{1,2})(:(\d{2}))?\s*(am|pm)?/); let h = Number(m[1]); const mm = Number(m[3] || 0); if (m[4] === "pm" && h < 12) h += 12; if (m[4] === "am" && h === 12) h = 0; return { type: "time", value: String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0") }; }
function describeWhen(w) { return w.type === "game" ? "when a game starts" : w.type === "layout" ? "when you switch to " + w.value : w.type === "focus" ? "when Focus starts" : "every day at " + w.value; }
module.exports = { safeLink, parse, describeWhen, norm, score };
