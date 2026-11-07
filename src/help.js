// Questions about the panel itself, answered on the PC with no AI and no internet: "how do I add a key",
// "what is mini", "why is Blink quiet". Each answer is short and comes with a button that does it.
const TOPICS = [
  { k: ["add key", "new key", "add a shortcut", "add app", "add an app", "add a button", "pin app", "add website", "add person", "add contact"],
    say: "Tap Add key, then pick an app, website, person, folder or shortcut. You can also drag an app or link onto the panel.", go: { label: "Add a key", act: "addKey", arg: "home" } },
  { k: ["edit", "move widget", "rearrange", "resize", "change layout", "change the screen", "customise", "customize", "remove widget", "delete widget"],
    say: "Hold any widget for a second (or right-click it) to edit: drag to move, drag the corner to resize, x to remove.", go: { label: "Edit this layout", act: "editCurrent" } },
  { k: ["add widget", "new widget", "more widgets"], say: "Edit the layout, then tap Add widget at the bottom.", go: { label: "Edit this layout", act: "editCurrent" } },
  { k: ["layout", "mode", "work mode", "gaming mode", "switch screen", "different screens"],
    say: "Layouts are different screens for different moments: Home, Work, Gaming. Tap the name at the top left to switch, or let them switch by themselves.", go: { label: "Open layouts", act: "sheet", arg: "layouts" } },
  { k: ["mini", "small window", "two screens", "second monitor", "always on top", "corner"],
    say: "Mini is a small panel that stays on top in a corner of your screen. Tap the arrows at the top right to switch.", go: { label: "Switch to Mini", act: "shrink" } },
  { k: ["settings", "options", "preferences", "dark mode", "light mode", "theme"], say: "Settings are behind the gear at the top right. The few you'll want are at the top; the rest under More settings.", go: { label: "Open Settings", act: "sheet", arg: "settings" } },
  { k: ["quiet", "why no sound", "not talking", "doesn't talk", "speak", "read aloud", "voice"],
    say: "Blink reads answers aloud only when you've turned that on, and stays quiet at work, in meetings, in Focus and in games. Change it in Settings.", go: { label: "Open Settings", act: "sheet", arg: "settings" } },
  { k: ["microphone", "mic", "listen to me", "always listening", "privacy", "recording"],
    say: "Blink never listens on its own. The mic records only after you tap it, shows a red bar, and stops by itself after 30 seconds." },
  { k: ["what can you do", "what can blink do", "help", "how does this work", "how do i use", "commands", "examples", "what do i say"],
    say: "Try: work mode, focus 25 minutes, remind me in 10 minutes to call Sara, next meeting, Teams chat with Sara, open Spotify, volume 40, what's playing. Anything else goes to an AI." },
  { k: ["ai session", "claude code", "codex", "approve", "approval", "why ai", "connect claude"],
    say: "AI sessions shows what Claude Code or Codex is doing on this PC, and lets you approve or reply from here. If they're not installed, Blink uses AI in your browser instead.", go: { label: "Open AI sessions", act: "sheet", arg: "sessions" } },
  { k: ["routine", "automate", "automation", "when i start", "every day at"],
    say: "Tell Blink, for example: When I start a game, set volume 40 and open Discord. Routines show in Layouts, where you can turn them off." },
  { k: ["update", "new version", "latest version"], say: "The panel checks for updates by itself. Settings shows the version and an Update button when there is one.", go: { label: "Open Settings", act: "sheet", arg: "settings" } },
  { k: ["music", "spotify", "lyrics", "playlist"], say: "The music widget controls whatever is playing. Tap the cover for the big player and lyrics, or paste a playlist link there.", go: { label: "Open music", act: "sheet", arg: "music" } },
  { k: ["arabic", "عربي"], say: "You can talk or type to Blink in Arabic, Bahraini included, and it answers in Arabic. The screens stay in English." },
  { k: ["quit", "close the app", "exit", "turn off"], say: "Quit is at the bottom of Settings. The tray icon at the bottom right of the taskbar also has Quit.", go: { label: "Open Settings", act: "sheet", arg: "settings" } },
  { k: ["undo", "deleted by mistake", "removed by mistake", "get it back"], say: "Right after removing something, tap Undo on the message at the bottom. Layouts can also start again from a template.", go: { label: "Open layouts", act: "sheet", arg: "layouts" } }
];
const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9؀-ۿ ]+/g, " ").replace(/\s+/g, " ").trim();
// "how do I add a key" and "add key" compare the same
const plain = (s) => norm(s).replace(/\b(a|an|the|my|some)\b/g, " ").replace(/\s+/g, " ").trim();
// only questions about the panel, not tasks: "how do I add a key" yes, "add a key for Sara" is a command elsewhere
const ASKING = /^(how|how do i|how can i|how to|where|where is|what is|whats|what does|what are|what can|why|can i|can you|is there|help|tell me how|explain)\b|\?$/;
function answer(text) {
  const q = plain(text);
  if (!q || (!ASKING.test(q) && !/\?\s*$/.test(String(text)))) return null;
  if (!/\b(panel|blink|this app|side panel|key|keys|widget|layout|mini|mic|microphone|settings|routine|ai session|update|quiet|sound|talk|speak|voice|arabic|quit|undo|help|do|use|work)\b/.test(q) && !/عربي/.test(q)) return null;
  let best = null, score = 0;
  for (const t of TOPICS) for (const k0 of t.k) { const k = plain(k0); if (q.includes(k) && k.length > score) { best = t; score = k.length; } }
  return best ? { say: best.say, go: best.go || null } : null;
}
module.exports = { answer, TOPICS };
