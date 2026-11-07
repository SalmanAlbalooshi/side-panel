using System.Linq;
// PanelHost: small Windows helper for the side panel.
// Reads one JSON command per line on stdin, writes one JSON reply per line on stdout.
// Commands: media.get, media.cmd, audio.get, audio.set, audio.mute, audio.app, mic.get, mic.mute, fg.get
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Windows.Media.Control;
using Windows.Storage.Streams;

static class Program
{
    static GlobalSystemMediaTransportControlsSessionManager mgr;

    static async Task Main(string[] argv)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        // Blink's voice, kept loaded, in its own process (so a voice problem can never take the panel down)
        if (argv.Length > 1 && argv[0] == "--tts") { Environment.Exit(TtsHost.Run(argv[1])); return; }
        try { mgr = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync(); } catch { mgr = null; }
        if (argv.Length > 0 && argv[0] == "--art")
        {
            // One-shot: print the album art of one media source as a small PNG data URL, then exit.
            try
            {
                var s = Pick(argv.Length > 1 ? argv[1] : null);
                var p = s == null ? null : await s.TryGetMediaPropertiesAsync();
                // one app can have several players (two browser tabs): pick the one with this title
                if (argv.Length > 2 && mgr != null && (p == null || p.Title != argv[2]))
                    foreach (var o in mgr.GetSessions())
                    {
                        if (o.SourceAppUserModelId != argv[1]) continue;
                        var op = await o.TryGetMediaPropertiesAsync();
                        if (op != null && op.Title == argv[2]) { p = op; break; }
                    }
                Console.WriteLine(p?.Thumbnail == null ? "" : await ReadThumb(p.Thumbnail) ?? "");
            }
            catch { Console.WriteLine(""); }
            return;
        }
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            JsonNode reply;
            int id = 0;
            try
            {
                var req = JsonNode.Parse(line);
                id = req?["id"]?.GetValue<int>() ?? 0;
                var cmd = req?["cmd"]?.GetValue<string>() ?? "";
                var arg = req?["arg"];
                var data = await Handle(cmd, arg);
                reply = new JsonObject { ["id"] = id, ["ok"] = true, ["data"] = data };
            }
            catch (Exception ex)
            {
                reply = new JsonObject { ["id"] = id, ["ok"] = false, ["error"] = ex.GetType().Name + ": " + ex.Message };
            }
            Console.WriteLine(reply.ToJsonString());
            Console.Out.Flush();
        }
    }

    static async Task<JsonNode> Handle(string cmd, JsonNode arg)
    {
        switch (cmd)
        {
            case "ping": return "pong";
            case "media.get": return await MediaGet();
            case "media.cmd": return await MediaCmd(arg?["action"]?.GetValue<string>() ?? "toggle", arg?["app"]?.GetValue<string>(), arg?["pos"]?.GetValue<double>() ?? 0);
            case "audio.peak": return Audio.Peak();
            case "audio.get": return Audio.Get();
            case "audio.set": Audio.SetMaster(arg["volume"].GetValue<double>()); return Audio.Get();
            case "audio.mute": Audio.SetMasterMute(arg["muted"].GetValue<bool>()); return Audio.Get();
            case "audio.app": Audio.SetApp(arg["pid"].GetValue<int>(), arg["volume"].GetValue<double>()); return Audio.Get();
            case "mic.get": return Audio.MicGet();
            case "mic.mute": Audio.MicMute(arg["muted"].GetValue<bool>()); return Audio.MicGet();
            case "fg.get": return Foreground.Get();
            case "win.topmost": return Foreground.Topmost(new IntPtr(arg["hwnd"].GetValue<long>()), arg?["on"]?.GetValue<bool>() ?? true);
            case "keys.send": return Foreground.SendKeys(arg?["keys"]?.AsArray().Select(x => x.GetValue<int>()).ToArray() ?? Array.Empty<int>());
            case "icon.get": return ShellIcon.Get(arg?["target"]?.GetValue<string>() ?? "", arg?["size"]?.GetValue<int>() ?? 64);
            case "ui.list": return UiAuto.List(arg?["app"]?.GetValue<string>() ?? "", arg?["max"]?.GetValue<int>() ?? 120);
            case "ui.do": return UiAuto.Do(arg?["i"]?.GetValue<int>() ?? 0, arg?["action"]?.GetValue<string>() ?? "click", arg?["text"]?.GetValue<string>() ?? "", arg?["expect"]?.GetValue<string>() ?? "");
            case "ui.type": return UiAuto.TypeIn(arg?["expect"]?.GetValue<string>() ?? "", arg?["text"]?.GetValue<string>() ?? "");
            case "ui.keys": return UiAuto.KeysIn(arg?["expect"]?.GetValue<string>() ?? "", arg?["keys"]?.AsArray().Select(x => x.GetValue<int>()).ToArray() ?? Array.Empty<int>());
            case "ui.front": return UiAuto.Front();
            case "win.activate": return Foreground.Activate(arg?["match"]?.GetValue<string>() ?? "", arg?["proc"]?.GetValue<string>() ?? "");
            default: throw new Exception("unknown command " + cmd);
        }
    }

    static GlobalSystemMediaTransportControlsSession Pick(string app)
    {
        if (mgr == null) return null;
        var all = mgr.GetSessions();
        if (!string.IsNullOrEmpty(app))
            foreach (var s in all) if (s.SourceAppUserModelId == app) return s;
        var cur = mgr.GetCurrentSession();
        if (cur != null) return cur;
        return all.Count > 0 ? all[0] : null;
    }

    static string Friendly(string aumid)
    {
        if (string.IsNullOrEmpty(aumid)) return "Unknown";
        var a = aumid.ToLowerInvariant();
        if (a.Contains("spotify")) return "Spotify";
        if (a.Contains("chrome")) return "Chrome";
        if (a.Contains("msedge") || a.Contains("edge")) return "Edge";
        if (a.Contains("firefox")) return "Firefox";
        if (a.Contains("zunemusic") || a.Contains("mediaplayer")) return "Media Player";
        if (a.Contains("vlc")) return "VLC";
        var n = aumid.Split('!', '\\', '/').Last();
        return n.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? n[..^4] : n;
    }

    static async Task<JsonNode> MediaGet()
    {
        var list = new JsonArray();
        if (mgr == null) return new JsonObject { ["available"] = false, ["sessions"] = list };
        var cur = mgr.GetCurrentSession();
        foreach (var s in mgr.GetSessions())
        {
            var o = new JsonObject { ["app"] = s.SourceAppUserModelId, ["name"] = Friendly(s.SourceAppUserModelId) };
            try
            {
                var p = await s.TryGetMediaPropertiesAsync();
                o["title"] = p?.Title ?? "";
                o["artist"] = p?.Artist ?? "";
                o["album"] = p?.AlbumTitle ?? "";
                var info = s.GetPlaybackInfo();
                var t = s.GetTimelineProperties();
                o["playing"] = info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                o["canNext"] = info.Controls.IsNextEnabled;
                o["canPrev"] = info.Controls.IsPreviousEnabled;
                o["canSeek"] = info.Controls.IsPlaybackPositionEnabled;
                o["canShuffle"] = info.Controls.IsShuffleEnabled;
                o["canRepeat"] = info.Controls.IsRepeatEnabled;
                o["shuffle"] = info.IsShuffleActive == true;
                o["repeat"] = info.AutoRepeatMode == null ? "none" : info.AutoRepeatMode.ToString().ToLowerInvariant();
                o["at"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                o["updatedAt"] = t.LastUpdatedTime.ToUnixTimeMilliseconds();
                o["pos"] = t.Position.TotalSeconds;
                o["dur"] = (t.EndTime - t.StartTime).TotalSeconds;
                o["current"] = cur != null && cur.SourceAppUserModelId == s.SourceAppUserModelId;
                // album art for the current session only, cached by title
                // Reading the thumbnail here breaks later play/pause calls in this process (seen with Chromium sources),
                // so art is fetched by a separate one-shot run: PanelHost.exe --art <app>.
                o["artKey"] = p?.Thumbnail != null ? s.SourceAppUserModelId + "|" + p.Title + "|" + p.Artist : "";
            }
            catch { }
            list.Add(o);
        }
        return new JsonObject { ["available"] = true, ["sessions"] = list };
    }

    static async Task<string> ReadThumb(IRandomAccessStreamReference r)
    {
        try
        {
            using var st = await r.OpenReadAsync();
            if (st.Size == 0 || st.Size > 20_000_000) return null;
            // Shrink to at most 256 px and re-encode as PNG so it is small enough to send every second.
            var dec = await Windows.Graphics.Imaging.BitmapDecoder.CreateAsync(st);
            uint w = dec.PixelWidth, h = dec.PixelHeight;
            double k = Math.Min(1.0, 256.0 / Math.Max(w, h));
            var tf = new Windows.Graphics.Imaging.BitmapTransform { ScaledWidth = Math.Max(1, (uint)(w * k)), ScaledHeight = Math.Max(1, (uint)(h * k)), InterpolationMode = Windows.Graphics.Imaging.BitmapInterpolationMode.Fant };
            var px = await dec.GetPixelDataAsync(Windows.Graphics.Imaging.BitmapPixelFormat.Rgba8, Windows.Graphics.Imaging.BitmapAlphaMode.Straight, tf, Windows.Graphics.Imaging.ExifOrientationMode.RespectExifOrientation, Windows.Graphics.Imaging.ColorManagementMode.DoNotColorManage);
            return "data:image/png;base64," + Convert.ToBase64String(ShellIcon.PngFromRgba((int)tf.ScaledWidth, (int)tf.ScaledHeight, px.DetachPixelData()));
        }
        catch { return null; }
    }

    static async Task<JsonNode> MediaCmd(string action, string app, double pos)
    {
        var s = Pick(app);
        if (s == null) return false;
        var pi = s.GetPlaybackInfo();
        bool ok = action switch
        {
            "seek" => await s.TryChangePlaybackPositionAsync((long)(Math.Max(0, pos) * 10_000_000)),
            "shuffle" => await s.TryChangeShuffleActiveAsync(!(pi.IsShuffleActive == true)),
            "repeat" => await s.TryChangeAutoRepeatModeAsync(pi.AutoRepeatMode == Windows.Media.MediaPlaybackAutoRepeatMode.None ? Windows.Media.MediaPlaybackAutoRepeatMode.List : pi.AutoRepeatMode == Windows.Media.MediaPlaybackAutoRepeatMode.List ? Windows.Media.MediaPlaybackAutoRepeatMode.Track : Windows.Media.MediaPlaybackAutoRepeatMode.None),
            "play" => await s.TryPlayAsync(),
            "pause" => await s.TryPauseAsync(),
            "next" => await s.TrySkipNextAsync(),
            "prev" => await s.TrySkipPreviousAsync(),
            _ => await s.TryTogglePlayPauseAsync()
        };
        return ok;
    }
}

// ---------------- Core Audio (COM interop) ----------------
static class Audio
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        int OpenPropertyStore(int access, out IntPtr props);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetState(out int state);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr notify);
        int UnregisterControlChangeNotify(IntPtr notify);
        int GetChannelCount(out uint count);
        int SetMasterVolumeLevel(float levelDB, ref Guid ctx);
        int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
        int GetMasterVolumeLevel(out float levelDB);
        int GetMasterVolumeLevelScalar(out float level);
        int SetChannelVolumeLevel(uint ch, float levelDB, ref Guid ctx);
        int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
        int GetChannelVolumeLevel(uint ch, out float levelDB);
        int GetChannelVolumeLevelScalar(uint ch, out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        int GetAudioSessionControl(IntPtr guid, int flags, out IntPtr ctl);
        int GetSimpleAudioVolume(IntPtr guid, int flags, out IntPtr vol);
        int GetSessionEnumerator(out IAudioSessionEnumerator e);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        int GetCount(out int count);
        int GetSession(int i, out IAudioSessionControl2 s);
    }

    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        int GetState(out int state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid ctx);
        int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid ctx);
        int GetGroupingParam(out Guid g);
        int SetGroupingParam(ref Guid g, ref Guid ctx);
        int RegisterAudioSessionNotification(IntPtr n);
        int UnregisterAudioSessionNotification(IntPtr n);
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetProcessId(out int pid);
        int IsSystemSoundsSession();
        int SetDuckingPreference(bool optOut);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume
    {
        int SetMasterVolume(float level, ref Guid ctx);
        int GetMasterVolume(out float level);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    static Guid IID_EPV = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    static Guid IID_ASM2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
    const int CLSCTX_ALL = 23;

    static IMMDevice Default(int flow)
    {
        var e = (IMMDeviceEnumerator)new MMDeviceEnumeratorCo();
        e.GetDefaultAudioEndpoint(flow, 1, out var d); // role 1 = multimedia
        return d;
    }
    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioMeterInformation { int GetPeakValue(out float peak); }
    static Guid IID_METER = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");
    static IAudioMeterInformation meter;
    // How loud the speakers are right now (0..1). Drives the music view's level bars from the real sound.
    public static JsonNode Peak()
    {
        try
        {
            if (meter == null) { var d = Default(0); d.Activate(ref IID_METER, CLSCTX_ALL, IntPtr.Zero, out var o); meter = (IAudioMeterInformation)o; }
            meter.GetPeakValue(out var p);
            return Math.Round(p, 3);
        }
        catch { meter = null; return 0; }
    }
    static IAudioEndpointVolume Epv(int flow)
    {
        var d = Default(flow);
        if (d == null) return null;
        d.Activate(ref IID_EPV, CLSCTX_ALL, IntPtr.Zero, out var o);
        return (IAudioEndpointVolume)o;
    }

    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(int access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder name, ref int size);
    // Works for games running as admin too (limited query rights are enough).
    internal static string ExePath(int pid)
    {
        var h = OpenProcess(0x1000, false, pid);
        if (h == IntPtr.Zero) return "";
        try { var sb = new StringBuilder(1024); int n = sb.Capacity; return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString() : ""; }
        finally { CloseHandle(h); }
    }

    public static JsonNode Get()
    {
        var epv = Epv(0);
        float lvl = 0; bool mute = false;
        epv?.GetMasterVolumeLevelScalar(out lvl);
        epv?.GetMute(out mute);
        var apps = new JsonArray();
        try
        {
            var d = Default(0);
            d.Activate(ref IID_ASM2, CLSCTX_ALL, IntPtr.Zero, out var o);
            var m = (IAudioSessionManager2)o;
            m.GetSessionEnumerator(out var en);
            en.GetCount(out int n);
            var seen = new HashSet<int>();
            for (int i = 0; i < n; i++)
            {
                en.GetSession(i, out var s);
                s.GetProcessId(out int pid);
                if (pid == 0 || seen.Contains(pid)) continue;
                s.GetState(out int st);
                if (st == 2) continue; // expired
                string name;
                try { name = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch { continue; }
                var sv = (ISimpleAudioVolume)s;
                sv.GetMasterVolume(out float v);
                sv.GetMute(out bool mu);
                seen.Add(pid);
                apps.Add(new JsonObject { ["pid"] = pid, ["name"] = name, ["volume"] = Math.Round(v * 100), ["muted"] = mu, ["active"] = st == 1 });
            }
        }
        catch { }
        return new JsonObject { ["volume"] = Math.Round(lvl * 100), ["muted"] = mute, ["apps"] = apps };
    }

    public static void SetMaster(double v)
    {
        var g = Guid.Empty;
        Epv(0)?.SetMasterVolumeLevelScalar((float)Math.Clamp(v / 100.0, 0, 1), ref g);
    }
    public static void SetMasterMute(bool m) { var g = Guid.Empty; Epv(0)?.SetMute(m, ref g); }

    public static void SetApp(int pid, double v)
    {
        var d = Default(0);
        d.Activate(ref IID_ASM2, CLSCTX_ALL, IntPtr.Zero, out var o);
        var m = (IAudioSessionManager2)o;
        m.GetSessionEnumerator(out var en);
        en.GetCount(out int n);
        var g = Guid.Empty;
        for (int i = 0; i < n; i++)
        {
            en.GetSession(i, out var s);
            s.GetProcessId(out int p);
            if (p == pid) ((ISimpleAudioVolume)s).SetMasterVolume((float)Math.Clamp(v / 100.0, 0, 1), ref g);
        }
    }

    public static JsonNode MicGet()
    {
        try
        {
            var epv = Epv(1);
            if (epv == null) return new JsonObject { ["available"] = false };
            epv.GetMute(out bool m);
            return new JsonObject { ["available"] = true, ["muted"] = m };
        }
        catch { return new JsonObject { ["available"] = false }; }
    }
    public static void MicMute(bool m) { var g = Guid.Empty; Epv(1)?.SetMute(m, ref g); }
}

// ---------------- Foreground window: which app, is it full screen ----------------
static class Foreground
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
    [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, int flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder sb, int n);
    [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
    [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public int dwFlags; }

    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);

    // Brings the first visible window whose title contains `match` (and optionally whose process matches) to the front.
    public static JsonNode Activate(string match, string proc)
    {
        IntPtr found = IntPtr.Zero; string title = "";
        EnumWindows((h, l) =>
        {
            if (!IsWindowVisible(h)) return true;
            var sb = new StringBuilder(512);
            GetWindowText(h, sb, 512);
            var t = sb.ToString();
            if (t.Length == 0) return true;
            if (match.Length > 0 && t.IndexOf(match, StringComparison.OrdinalIgnoreCase) < 0) return true;
            if (proc.Length > 0)
            {
                GetWindowThreadProcessId(h, out int pid);
                string pn = "";
                try { pn = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch { }
                if (!proc.Split(',').Any(p => pn.Equals(p, StringComparison.OrdinalIgnoreCase))) return true;
            }
            found = h; title = t; return false;
        }, IntPtr.Zero);
        if (found == IntPtr.Zero) return new JsonObject { ["ok"] = false };
        if (IsIconic(found)) ShowWindow(found, 9);
        keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); // Alt tap lets us take focus
        SetForegroundWindow(found);
        return new JsonObject { ["ok"] = true, ["title"] = title };
    }

    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
    // Keeps a window above others (the mini panel), set straight through Windows.
    public static JsonNode Topmost(IntPtr h, bool on)
    {
        SetWindowPos(h, new IntPtr(on ? -1 : -2), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010);
        return (GetWindowLong(h, -20) & 0x8) != 0;
    }

    // Presses a key combination in the app on the main screen: modifiers down, key down, then all up in reverse.
    public static JsonNode SendKeys(int[] vks)
    {
        if (vks.Length == 0 || vks.Length > 5 || vks.Any(v => v <= 0 || v > 254)) return false;
        int[] ext = { 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x5B, 0x5C };
        foreach (var v in vks) keybd_event((byte)v, 0, ext.Contains(v) ? 1u : 0u, UIntPtr.Zero);
        System.Threading.Thread.Sleep(30);
        foreach (var v in vks.Reverse()) keybd_event((byte)v, 0, (ext.Contains(v) ? 1u : 0u) | 2u, UIntPtr.Zero);
        return true;
    }

    public static JsonNode Get()
    {
        var h = GetForegroundWindow();
        if (h == IntPtr.Zero) return new JsonObject { ["app"] = "", ["fullscreen"] = false };
        GetWindowThreadProcessId(h, out int pid);
        string name = "";
        try { name = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch { }
        var sb = new StringBuilder(256);
        GetWindowText(h, sb, 256);
        bool full = false;
        // a minimized, hidden or cloaked (closed-but-lingering) window is never "full screen"
        bool shown = IsWindowVisible(h) && !IsIconic(h) && !(DwmGetWindowAttribute(h, 14, out int cloaked, 4) == 0 && cloaked != 0);
        if (shown && h != GetShellWindow() && h != GetDesktopWindow() && GetWindowRect(h, out var r))
        {
            var mon = MonitorFromWindow(h, 2);
            var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
            if (GetMonitorInfo(mon, ref mi))
                full = r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B
                       && !string.Equals(name, "explorer", StringComparison.OrdinalIgnoreCase);
        }
        return new JsonObject { ["app"] = name, ["title"] = sb.ToString(), ["pid"] = pid, ["fullscreen"] = full, ["path"] = Audio.ExePath(pid) };
    }
}
