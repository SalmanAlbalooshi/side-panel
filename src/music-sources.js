// Music: plays through the music app or site the person already uses. No accounts and no keys:
// each service's own links, Windows' media controls, and (after one Allow) the app's own Play button,
// pressed the way screen readers press it. Works the same for every user.
//
// Why no sign-in: Spotify's Web API only lets 5 named users into an app unless the publisher is a large company,
// YouTube's API gives about 100 searches a day for all users together, and Apple Music needs a paid
// developer membership. The installed app avoids all three.
const enc = encodeURIComponent;
const SOURCES = [["auto", "Automatic"], ["spotify", "Spotify"], ["ytmusic", "YouTube Music"], ["apple", "Apple Music"]];

class Music {
  // o: { cfg(), open(url), hasApp(re), pressPlay(proc, q) -> Promise<boolean> }
  constructor(o) { this.o = o; }
  // the person's pick, or the best one this PC has
  source(asked) {
    const s = asked || this.o.cfg().musicSource || "auto";
    if (s !== "auto") return s;
    if (this.o.hasApp(/^spotify$/i)) return "spotify";
    if (this.o.hasApp(/apple music|itunes/i)) return "apple";
    return "ytmusic";
  }
  async play(q, asked) {
    q = String(q || "").trim().slice(0, 80);
    if (!q) return { error: "What should I play?" };
    const s = this.source(asked);
    if (s === "spotify") {
      this.o.open("spotify:search:" + enc(q));
      const ok = await this.o.pressPlay("spotify", q).catch(() => false);
      return { say: ok ? "Playing " + q + "." : "Here's " + q + " on Spotify." };
    }
    if (s === "apple") { this.o.open("https://music.apple.com/search?term=" + enc(q)); return { say: "Here's " + q + " in Apple Music." }; }
    if (s === "youtube") { this.o.open("https://www.youtube.com/results?search_query=" + enc(q)); return { say: "Here's " + q + " on YouTube." }; }
    this.o.open("https://music.youtube.com/search?q=" + enc(q)); return { say: "Here's " + q + " on YouTube Music." };
  }
}
module.exports = { Music, SOURCES };
