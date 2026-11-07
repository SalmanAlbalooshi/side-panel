// Debug: how icons resolve for a few apps. Run: npx electron test/icondebug.js
const { app, shell } = require("electron");
const path = require("path");
const fs = require("fs");
app.whenReady().then(async () => {
  const root = path.join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs");
  const want = ["Excel.lnk", "Word.lnk", "7-Zip File Manager.lnk", "Blender 4.2.lnk"];
  const files = [];
  (function walk(d, n) { if (n < 0) return; for (const it of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, it.name); if (it.isDirectory()) walk(p, n - 1); else if (want.some((w) => it.name.toLowerCase() === w.toLowerCase())) files.push(p); } })(root, 3);
  for (const f of files) {
    let l = {}; try { l = shell.readShortcutLink(f); } catch (e) { l = { err: e.message }; }
    const out = { f, target: l.target, icon: l.icon, iconIndex: l.iconIndex, err: l.err };
    for (const k of ["target", "icon"]) { if (l[k] && fs.existsSync(l[k])) { const img = await app.getFileIcon(l[k], { size: "large" }); out[k + "Size"] = img.getSize(); out[k + "Empty"] = img.isEmpty(); } }
    const img2 = await app.getFileIcon(f, { size: "large" }); out.lnkSize = img2.getSize();
    console.log(JSON.stringify(out));
  }
  app.quit();
});
