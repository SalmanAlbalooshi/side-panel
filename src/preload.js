const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("panel", {
  act: (name, arg) => ipcRenderer.invoke("act", name, arg),
  onTick: (fn) => ipcRenderer.on("tick", (_e, data) => fn(data)),
  onOpen: (fn) => ipcRenderer.on("open", (_e, what) => fn(what)),
  onLevel: (fn) => ipcRenderer.on("level", (_e, v) => fn(v)),
  onCall: (fn) => ipcRenderer.on("call", (_e, m) => fn(m)),
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } },
  testHook: (ev, body) => ipcRenderer.invoke("test-hook", ev, body),
  testLive: (patch) => ipcRenderer.invoke("test-live", patch),
  testState: () => ipcRenderer.invoke("test-state")
});
