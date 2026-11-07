// Deep keys: a person (Teams chat or call, email, their emails in Outlook), a keyboard shortcut sent to the app on
// the main screen, a text snippet, an Outlook folder or search, and app links that land on a specific place.
const { execFile } = require("child_process");

const EMAIL = /^[^\s@"'<>`]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;
const PHONE = /^\+?[0-9 ]{6,20}$/;

// "Ctrl+Shift+M" -> virtual-key codes. Only plain keys and the usual modifiers.
const VK = { ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5B, windows: 0x5B, enter: 0x0D, return: 0x0D, esc: 0x1B, escape: 0x1B, tab: 0x09, space: 0x20, backspace: 0x08, delete: 0x2E, del: 0x2E, insert: 0x2D, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, up: 0x26, down: 0x28, left: 0x25, right: 0x27, printscreen: 0x2C, "plus": 0xBB, "minus": 0xBD, ",": 0xBC, ".": 0xBE, "/": 0xBF, ";": 0xBA, "'": 0xDE, "[": 0xDB, "]": 0xDD, "\\": 0xDC, "`": 0xC0, "=": 0xBB, "-": 0xBD,
  volumeup: 0xAF, volumedown: 0xAE, volumemute: 0xAD, playpause: 0xB3, nexttrack: 0xB0, prevtrack: 0xB1 };
function parseCombo(s) {
  const parts = String(s || "").toLowerCase().replace(/\+\+/g, "+plus").split("+").map((x) => x.trim()).filter(Boolean);
  if (!parts.length || parts.length > 5) return null;
  const out = [];
  for (const p of parts) {
    if (VK[p]) out.push(VK[p]);
    else if (/^[a-z0-9]$/.test(p)) out.push(p.toUpperCase().charCodeAt(0));
    else if (/^f([1-9]|1[0-9]|2[0-4])$/.test(p)) out.push(0x6F + Number(p.slice(1)));
    else return null;
  }
  return out;
}
const pretty = (s) => String(s).split("+").map((x) => x.trim()).map((x) => x.length === 1 ? x.toUpperCase() : x.charAt(0).toUpperCase() + x.slice(1)).join(" + ");

// Classic Outlook through its own automation interface. Values travel in environment variables, never in the script.
function outlook(op, value) {
  const script = {
    from: "$o=New-Object -ComObject Outlook.Application;$e=$o.ActiveExplorer();if(-not $e){$e=$o.Session.GetDefaultFolder(6).GetExplorer();$e.Display()};$e.Search('from:(\"'+$env:SP_VALUE+'\")',1);$e.Activate()",
    search: "$o=New-Object -ComObject Outlook.Application;$e=$o.ActiveExplorer();if(-not $e){$e=$o.Session.GetDefaultFolder(6).GetExplorer();$e.Display()};$e.Search($env:SP_VALUE,1);$e.Activate()",
    folder: "$o=New-Object -ComObject Outlook.Application;$ns=$o.Session;$f=$ns.GetDefaultFolder(6);foreach($p in ($env:SP_VALUE -split '[\\\\/]')){if($p -and $p -ne 'Inbox'){$f=$f.Folders.Item($p)}};$e=$o.ActiveExplorer();if(-not $e){$f.Display()}else{$e.CurrentFolder=$f;$e.Activate()}",
    compose: "$o=New-Object -ComObject Outlook.Application;$m=$o.CreateItem(0);$m.To=$env:SP_VALUE;$m.Display()",
    calendar: "$o=New-Object -ComObject Outlook.Application;$f=$o.Session.GetDefaultFolder(9);$e=$o.ActiveExplorer();if(-not $e){$f.Display()}else{$e.CurrentFolder=$f;$e.Activate()}"
  }[op];
  if (!script) return Promise.resolve({ error: "Unknown Outlook action" });
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { windowsHide: true, timeout: 30000, env: Object.assign({}, process.env, { SP_VALUE: String(value || "").slice(0, 300) }) }, (err, _o, stderr) => {
      if (err) resolve(/not connected|no profile|MAPI/i.test(String(stderr)) ? { error: "noaccount" } : { error: /Folders\.Item|cannot find|not found/i.test(String(stderr)) ? "Outlook couldn't find that folder" : "Outlook didn't respond. Is it signed in?" });
      else resolve({ ok: true, toast: "Opened in Outlook on your main screen" });
    });
  });
}

// What tapping a person does. The key keeps all the ways to reach them; the main tap does the one you picked.
function personLink(p, how, teams) {
  const e = encodeURIComponent(p.email || "");
  switch (how) {
    case "call": return (teams ? "msteams:" : "https://teams.microsoft.com") + "/l/call/0/0?users=" + e;
    case "video": return (teams ? "msteams:" : "https://teams.microsoft.com") + "/l/call/0/0?users=" + e + "&withVideo=true";
    case "email": return "mailto:" + (p.email || "");
    case "whatsapp": return "whatsapp://send?phone=" + String(p.phone || "").replace(/[^0-9]/g, "");
    default: return (teams ? "msteams:" : "https://teams.microsoft.com") + "/l/chat/0/0?users=" + e;
  }
}

module.exports = { EMAIL, PHONE, parseCombo, pretty, outlook, personLink };
