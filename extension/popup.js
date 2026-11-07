const state = document.getElementById("state"), go = document.getElementById("go");
function show(text, cls, button) { state.textContent = text; state.className = cls || ""; go.hidden = !button; }
chrome.runtime.sendMessage({ type: "check" }, (r) => {
  if (!r) return show("Couldn't check.", "bad", true);
  if (r.paired && r.running) return show("Connected. Your AI tabs show on the panel.", "ok", false);
  if (r.paired && !r.running) return show("Connected, but the Side Panel isn't running right now.", "", false);
  show("Not connected yet.", "", true);
});
go.onclick = () => {
  go.disabled = true;
  show("Tap Allow on your Side Panel…", "", true);
  chrome.runtime.sendMessage({ type: "pair" }, (r) => {
    go.disabled = false;
    if (r && r.ok) show("Connected. Your AI tabs show on the panel.", "ok", false);
    else show((r && r.error) || "Not connected", "bad", true);
  });
};
