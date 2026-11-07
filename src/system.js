// PC facts for widgets: CPU, RAM, GPU, disks, failed scheduled tasks, next Outlook meeting.
const os = require("os");
const fs = require("fs");
const { run } = require("./discovery");

let lastCpu = os.cpus();
function cpuPercent() {
  const now = os.cpus();
  let idle = 0, total = 0;
  now.forEach((c, i) => {
    const p = lastCpu[i] ? lastCpu[i].times : { user: 0, nice: 0, sys: 0, irq: 0, idle: 0 };
    const t = c.times;
    const d = (t.user - p.user) + (t.nice - p.nice) + (t.sys - p.sys) + (t.irq - p.irq) + (t.idle - p.idle);
    total += d; idle += t.idle - p.idle;
  });
  lastCpu = now;
  return total > 0 ? Math.round(100 * (1 - idle / total)) : 0;
}

let gpu = null;
async function pollGpu(nvsmi) {
  if (!nvsmi) return null;
  const out = await run(nvsmi, ["--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"]);
  const f = out.split(/\r?\n/)[0];
  if (!f) return gpu;
  const [name, temp, util, mu, mt] = f.split(",").map((x) => x.trim());
  gpu = { name, temp: Number(temp), util: Number(util), memUsed: Number(mu), memTotal: Number(mt) };
  return gpu;
}

function disks() {
  const out = [];
  for (const L of "CDEFGH") {
    const root = L + ":\\";
    try {
      if (!fs.existsSync(root)) continue;
      const s = fs.statfsSync(root);
      const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
      if (total > 0) out.push({ drive: L + ":", freeGB: Math.round(free / 1073741824), totalGB: Math.round(total / 1073741824), pctFree: Math.round(100 * free / total) });
    } catch { }
  }
  return out;
}

function stats() {
  const total = os.totalmem(), free = os.freemem();
  return { cpu: cpuPercent(), ramUsedGB: Math.round((total - free) / 1e9 * 10) / 10, ramTotalGB: Math.round(total / 1e9), gpu };
}

// Scheduled tasks that you (not Windows) created, and failed on their last run.
const OK_CODES = new Set([0, 267008, 267009, 267011, 267012, 267013, 267014, 267045]);
async function failedTasks() {
  const ps = "Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\\Microsoft\\*' -and $_.State -ne 'Disabled' } | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue; if ($i) { [pscustomobject]@{ n = $_.TaskName; r = [int64]$i.LastTaskResult; t = if ($i.LastRunTime) { $i.LastRunTime.ToString('o') } else { '' } } } } | ConvertTo-Json -Compress";
  const out = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 30000 });
  let arr = [];
  try { arr = JSON.parse(out || "[]"); if (!Array.isArray(arr)) arr = [arr]; } catch { return []; }
  return arr.filter((x) => x && x.t && !OK_CODES.has(Number(x.r)) && !/^(OneDrive|MicrosoftEdge|GoogleUpdate|Adobe|NvTm|NVIDIA|CCleaner|Opera|Brave|AMD|Intel|Dell|HP|Lenovo|Logitech|Razer|Corsair|ASUS|MSI|Apple|Mozilla|Zoom)/i.test(x.n))
    .map((x) => ({ name: x.n, code: Number(x.r), when: x.t }));
}

// Next meeting from classic Outlook, only if Outlook is already running (never starts it).
async function nextMeeting() {
  const ps = [
    "$p = Get-Process OUTLOOK -ErrorAction SilentlyContinue; if (-not $p) { 'NOOUTLOOK'; exit }",
    "try { $o = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch { 'NOOUTLOOK'; exit }",
    "$cal = $o.Session.GetDefaultFolder(9).Items; $cal.IncludeRecurrences = $true; $cal.Sort('[Start]')",
    "$from = (Get-Date).AddMinutes(-10).ToString('g'); $to = (Get-Date).Date.AddDays(1).ToString('g')",
    "$f = \"[Start] >= '\" + $from + \"' AND [Start] < '\" + $to + \"'\"",
    "$items = $cal.Restrict($f); $out = @(); foreach ($i in $items) { if ($i.BusyStatus -ne 0) { $j = ''; if ($i.Body -match '(https://teams\\.microsoft\\.com/l/meetup-join/[^\\s>\"]+)') { $j = $matches[1] }; $out += [pscustomobject]@{ s = $i.Subject; st = $i.Start.ToString('o'); en = $i.End.ToString('o'); loc = $i.Location; join = $j } }; if ($out.Count -ge 4) { break } }",
    "$out | ConvertTo-Json -Compress"
  ].join("; ");
  const out = (await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 30000 })).trim();
  if (!out || out === "NOOUTLOOK") return { available: out !== "NOOUTLOOK" ? false : false, reason: out === "NOOUTLOOK" ? "Outlook is not open" : "No meetings" , meetings: [] };
  try {
    let arr = JSON.parse(out); if (!Array.isArray(arr)) arr = [arr];
    return { available: true, meetings: arr.map((m) => ({ subject: m.s, start: m.st, end: m.en, location: m.loc, join: m.join })) };
  } catch { return { available: true, meetings: [] }; }
}

module.exports = { stats, pollGpu, disks, failedTasks, nextMeeting };
