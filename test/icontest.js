// Checks the helper's shell icon lookup for a Store app, an Office app and a normal exe.
const { Helper } = require("../src/helper");
const path = require("path");
const fs = require("fs");
const h = new Helper(path.join(__dirname, "..", "bin", "helper", "PanelHost.exe"));
const targets = [
  "shell:AppsFolder\\Microsoft.Office.EXCEL.EXE.15",
  "shell:AppsFolder\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App",
  "C:\\Program Files\\7-Zip\\7zFM.exe"
];
(async () => {
  await new Promise((r) => setTimeout(r, 800));
  for (const t of targets) {
    try {
      const d = await h.call("icon.get", { target: t, size: 64 });
      console.log(t, d ? "OK " + d.length + " chars" : "NULL");
      if (d) fs.writeFileSync(path.join(__dirname, "shots", "icon-" + path.basename(t).replace(/[^\w.]/g, "_") + ".png"), Buffer.from(d.split(",")[1], "base64"));
    } catch (e) { console.log(t, "ERR", e.message); }
  }
  h.stop();
})();
