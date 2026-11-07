// Seeing and using any app's own controls, the way screen readers do (Windows UI Automation):
// list the buttons, fields, menus and list items in an app's window, then click, type into or select one.
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows.Automation;

static class UiAuto
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc f, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint msg, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr res);

    // Chromium-based apps (Spotify, Discord, Teams, Slack) only build their list of controls when something asks;
    // asking the page window directly wakes it, the way screen readers do
    static void WakeChromium(IntPtr top)
    {
        EnumChildWindows(top, (c, l) =>
        {
            var sb = new StringBuilder(64); GetClassName(c, sb, 64);
            if (sb.ToString() == "Chrome_RenderWidgetHostHWND")
            {
                SendMessageTimeout(c, 0x003D, IntPtr.Zero, new IntPtr(1), 0x0002, 200, out _);   // WM_GETOBJECT, UIA root
                SendMessageTimeout(c, 0x003D, IntPtr.Zero, new IntPtr(-4), 0x0002, 200, out _);  // WM_GETOBJECT, OBJID_CLIENT
            }
            return true;
        }, IntPtr.Zero);
    }

    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }

    static readonly Dictionary<int, AutomationElement> map = new();
    static IntPtr lastWindow = IntPtr.Zero;

    // Kinds of windows Blink never touches, whatever the person allows: anything that runs commands, changes the system,
    // asks for a sign-in or keeps passwords, and Start or Windows search (they can run anything).
    // Every other app is the person's call: the panel asks once ("Let Blink use Spotify?") and remembers.
    static readonly Regex NeverProc = new(@"^(cmd|powershell|pwsh|powershell_ise|windowsterminal|wt|openconsole|conhost|bash|wsl|wslhost|mintty|regedit|mmc|taskmgr|consent|credentialuibroker|lockapp|logonui|securityhealthhost|searchhost|searchapp|startmenuexperiencehost|shellexperiencehost|keepass|keepassxc|1password|bitwarden|dashlane|lastpass)$", RegexOptions.IgnoreCase);
    static readonly Regex NeverTitle = new(@"^(run|command prompt|windows powershell|administrator:|registry editor|task manager|user account control|windows security)\b", RegexOptions.IgnoreCase);
    static readonly Regex Secret = new(@"password|passcode|\bpin\b|card number|cvv|security code", RegexOptions.IgnoreCase);

    // what a window is: its app (process name) and title, and whether Blink may never touch it
    static (string proc, string title, string? never) Who(IntPtr h)
    {
        if (h == IntPtr.Zero) return ("", "", "That window isn't open any more");
        GetWindowThreadProcessId(h, out int pid);
        var sb = new StringBuilder(512); GetWindowText(h, sb, 512); var title = sb.ToString();
        string pn; try { pn = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch { return ("", title, "I can't tell what that window is"); }
        if (pid == Environment.ProcessId || pn.Equals("Side Panel", StringComparison.OrdinalIgnoreCase)) return (pn, title, "That's the panel itself");
        if (NeverProc.IsMatch(pn) || NeverTitle.IsMatch(title)) return (pn, title, "That's a window for you to use yourself (" + (title.Length > 0 ? title : pn) + ")");
        return (pn, title, null);
    }
    static JsonObject Err(string m, string proc = "") => new JsonObject { ["error"] = m, ["proc"] = proc };

    // the window in front, for the panel to check before it asks or acts
    public static JsonNode Front() { var (p, t, n) = Who(GetForegroundWindow()); return new JsonObject { ["proc"] = p, ["title"] = t, ["never"] = n }; }

    // typing or pressing keys in the window in front, only if it's still the app the person allowed
    static string? FrontIs(string expect)
    {
        var (p, _, n) = Who(GetForegroundWindow());
        if (n != null) return n;
        if (!p.Equals(expect ?? "", StringComparison.OrdinalIgnoreCase)) return "A different app came to the front, so I stopped";
        return null;
    }
    public static JsonNode TypeIn(string expect, string text) { var e = FrontIs(expect); if (e != null) return Err(e); TypeText(text); return new JsonObject { ["ok"] = true }; }
    public static JsonNode KeysIn(string expect, int[] vks) { var e = FrontIs(expect); if (e != null) return Err(e); return Foreground.SendKeys(vks); }

    // the app's main window: by its name or its process name ("spotify", "discord"); empty = the window in front
    static IntPtr FindWindow(string app)
    {
        if (string.IsNullOrWhiteSpace(app)) return GetForegroundWindow();
        IntPtr best = IntPtr.Zero; int bestScore = 0;
        EnumWindows((h, l) =>
        {
            if (!IsWindowVisible(h)) return true;
            var sb = new StringBuilder(512); GetWindowText(h, sb, 512); var t = sb.ToString();
            if (t.Length == 0) return true;
            GetWindowThreadProcessId(h, out int pid);
            string pn = ""; try { pn = System.Diagnostics.Process.GetProcessById(pid).ProcessName; } catch { }
            int score = pn.Equals(app, StringComparison.OrdinalIgnoreCase) ? 3 : pn.IndexOf(app, StringComparison.OrdinalIgnoreCase) >= 0 ? 2 : t.IndexOf(app, StringComparison.OrdinalIgnoreCase) >= 0 ? 1 : 0;
            if (score > bestScore) { bestScore = score; best = h; }
            return true;
        }, IntPtr.Zero);
        return best;
    }

    static readonly ControlType[] Useful = {
        ControlType.Button, ControlType.MenuItem, ControlType.Edit, ControlType.ComboBox, ControlType.ListItem, ControlType.TabItem,
        ControlType.Hyperlink, ControlType.CheckBox, ControlType.RadioButton, ControlType.TreeItem, ControlType.DataItem, ControlType.SplitButton, ControlType.Slider
    };

    public static JsonNode List(string app, int max)
    {
        var h = FindWindow(app);
        if (h == IntPtr.Zero) return new JsonObject { ["error"] = "That app isn't open" };
        var who = Who(h);
        if (who.never != null) { map.Clear(); lastWindow = IntPtr.Zero; return Err(who.never, who.proc); }
        if (IsIconic(h)) ShowWindow(h, 9);
        lastWindow = h;
        try { WakeChromium(h); } catch { }
        var root = AutomationElement.FromHandle(h);
        map.Clear();
        var items = new JsonArray(); int i = 0, seen = 0, texts = 0;
        var stop = DateTime.UtcNow.AddMilliseconds(3000);
        var walker = TreeWalker.ControlViewWalker;
        var queue = new Queue<(AutomationElement el, int depth)>(); queue.Enqueue((root, 0));
        while (queue.Count > 0 && items.Count < max && seen < 4000 && DateTime.UtcNow < stop)
        {
            var (el, depth) = queue.Dequeue(); seen++;
            try
            {
                var c = el.Current;
                if (!c.IsOffscreen || depth == 0)
                {
                    var name = (c.Name ?? "").Trim();
                    bool useful = Array.IndexOf(Useful, c.ControlType) >= 0;
                    bool text = c.ControlType == ControlType.Text && name.Length > 1 && texts < 40;
                    if ((useful && (name.Length > 0 || c.ControlType == ControlType.Edit)) || text)
                    {
                        if (text) texts++;
                        string val = "";
                        if (c.ControlType == ControlType.Edit && el.TryGetCurrentPattern(ValuePattern.Pattern, out var vp)) { try { val = ((ValuePattern)vp).Current.Value ?? ""; } catch { } }
                        map[++i] = el;
                        var o = new JsonObject { ["i"] = i, ["type"] = c.ControlType.ProgrammaticName.Replace("ControlType.", ""), ["name"] = name.Length > 90 ? name[..90] : name };
                        if (val.Length > 0) o["value"] = val.Length > 60 ? val[..60] : val;
                        if (!c.IsEnabled) o["disabled"] = true;
                        items.Add(o);
                    }
                }
                if (depth < 30)
                {
                    var ch = walker.GetFirstChild(el);
                    while (ch != null) { queue.Enqueue((ch, depth + 1)); ch = walker.GetNextSibling(ch); }
                }
            }
            catch { }
        }
        var sb2 = new StringBuilder(512); GetWindowText(h, sb2, 512);
        return new JsonObject { ["window"] = sb2.ToString(), ["proc"] = who.proc, ["items"] = items, ["more"] = queue.Count > 0 };
    }

    // expect: the app the person allowed; the control's own window is checked again right before acting
    public static JsonNode Do(int i, string action, string text, string expect)
    {
        if (!map.TryGetValue(i, out var el)) return new JsonObject { ["error"] = "Look at the app again first; that control isn't known" };
        try
        {
            var who = Who(lastWindow);
            if (who.never != null) { map.Clear(); return Err(who.never, who.proc); }
            if (!who.proc.Equals(expect ?? "", StringComparison.OrdinalIgnoreCase)) { map.Clear(); return Err("Look at the app again first; the window changed", who.proc); }
            if (IsIconic(lastWindow)) ShowWindow(lastWindow, 9); SetForegroundWindow(lastWindow);
            switch (action)
            {
                case "type":
                    bool secret = false; try { secret = el.Current.IsPassword || Secret.IsMatch(el.Current.Name ?? ""); } catch { }
                    if (secret) return Err("I never type passwords or card details. Please type that yourself.");
                    if (el.TryGetCurrentPattern(ValuePattern.Pattern, out var vp) && !((ValuePattern)vp).Current.IsReadOnly) { ((ValuePattern)vp).SetValue(text ?? ""); return new JsonObject { ["ok"] = true, ["did"] = "typed" }; }
                    el.SetFocus(); Thread.Sleep(80); TypeText(text ?? ""); return new JsonObject { ["ok"] = true, ["did"] = "typed with keys" };
                case "focus": el.SetFocus(); return new JsonObject { ["ok"] = true, ["did"] = "focused" };
                default: // click / open / select / toggle
                    if (el.TryGetCurrentPattern(InvokePattern.Pattern, out var ip)) { ((InvokePattern)ip).Invoke(); return new JsonObject { ["ok"] = true, ["did"] = "pressed" }; }
                    if (el.TryGetCurrentPattern(SelectionItemPattern.Pattern, out var sp)) { ((SelectionItemPattern)sp).Select(); return new JsonObject { ["ok"] = true, ["did"] = "selected" }; }
                    if (el.TryGetCurrentPattern(TogglePattern.Pattern, out var tp)) { ((TogglePattern)tp).Toggle(); return new JsonObject { ["ok"] = true, ["did"] = "toggled" }; }
                    if (el.TryGetCurrentPattern(ExpandCollapsePattern.Pattern, out var ep)) { ((ExpandCollapsePattern)ep).Expand(); return new JsonObject { ["ok"] = true, ["did"] = "opened" }; }
                    if (el.TryGetClickablePoint(out var pt)) { SetCursorPos((int)pt.X, (int)pt.Y); mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero); return new JsonObject { ["ok"] = true, ["did"] = "clicked" }; }
                    el.SetFocus(); return new JsonObject { ["ok"] = true, ["did"] = "focused (it has no click action)" };
            }
        }
        catch (Exception ex) { return new JsonObject { ["error"] = ex.Message }; }
    }

    // typing any text (any language) into the focused place
    public static void TypeText(string s)
    {
        foreach (var ch in (s ?? "").Take(500))
        {
            var down = new INPUT { type = 1, u = new UNION { ki = new KEYBDINPUT { wScan = ch, dwFlags = 0x0004 } } };
            var up = new INPUT { type = 1, u = new UNION { ki = new KEYBDINPUT { wScan = ch, dwFlags = 0x0004 | 0x0002 } } };
            SendInput(2, new[] { down, up }, Marshal.SizeOf<INPUT>());
        }
    }
}
