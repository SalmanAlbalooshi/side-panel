// Blink's voice, kept loaded: a small separate process (PanelHost.exe --tts <engine bin folder>) that loads a voice
// once and then turns each sentence into a WAV file on request, through sherpa-onnx's own C library.
// Starting the speech engine for every sentence cost about 1.2 to 1.8 s each time; this pays it once.
// One JSON request per line on stdin, one JSON reply per line on stdout:
//   {"id":1,"voice":"best","kind":"kokoro10","dir":"...","model":"...","sid":3,"text":"Hello.","out":"C:\\...\\x.wav","threads":4}
//   -> {"id":1,"ok":true,"ms":412}   or   {"id":1,"error":"..."}
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json.Nodes;

static class TtsHost
{
    [StructLayout(LayoutKind.Sequential)] struct Vits { public IntPtr model, lexicon, tokens, data_dir; public float noise_scale, noise_scale_w, length_scale; public IntPtr dict_dir; }
    [StructLayout(LayoutKind.Sequential)] struct Matcha { public IntPtr acoustic_model, vocoder, lexicon, tokens, data_dir; public float noise_scale, length_scale; public IntPtr dict_dir; }
    [StructLayout(LayoutKind.Sequential)] struct Kokoro { public IntPtr model, voices, tokens, data_dir; public float length_scale; public IntPtr dict_dir, lexicon, lang; }
    [StructLayout(LayoutKind.Sequential)] struct Kitten { public IntPtr model, voices, tokens, data_dir; public float length_scale; }
    [StructLayout(LayoutKind.Sequential)] struct Zipvoice { public IntPtr tokens, encoder, decoder, vocoder, data_dir, lexicon; public float feat_scale, t_shift, target_rms, guidance_scale; }
    [StructLayout(LayoutKind.Sequential)] struct Pocket { public IntPtr lm_flow, lm_main, encoder, decoder, text_conditioner, vocab_json, token_scores_json; public int voice_embedding_cache_capacity; }
    [StructLayout(LayoutKind.Sequential)] struct Supertonic { public IntPtr duration_predictor, text_encoder, vector_estimator, vocoder, tts_json, unicode_indexer, voice_style; }
    [StructLayout(LayoutKind.Sequential)] struct ModelConfig { public Vits vits; public int num_threads, debug; public IntPtr provider; public Matcha matcha; public Kokoro kokoro; public Kitten kitten; public Zipvoice zipvoice; public Pocket pocket; public Supertonic supertonic; }
    [StructLayout(LayoutKind.Sequential)] struct TtsConfig { public ModelConfig model; public IntPtr rule_fsts; public int max_num_sentences; public IntPtr rule_fars; public float silence_scale; }
    [StructLayout(LayoutKind.Sequential)] struct Audio { public IntPtr samples; public int n, sample_rate; }

    delegate IntPtr CreateFn(ref TtsConfig c);
    delegate IntPtr GenerateFn(IntPtr tts, IntPtr text, int sid, float speed);
    delegate void FreeAudioFn(IntPtr a);
    static CreateFn? create; static GenerateFn? generate; static FreeAudioFn? freeAudio;
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool SetDllDirectory(string p);

    static readonly Dictionary<string, IntPtr> loaded = new();
    static readonly List<IntPtr> keep = new(); // strings handed to the library stay alive while the voice is loaded
    static IntPtr S(string? s) { var p = Marshal.StringToCoTaskMemUTF8(s ?? ""); keep.Add(p); return p; }

    public static int Run(string bin)
    {
        var stdout = Console.OpenStandardOutput();
        void Reply(JsonObject o) { var b = Encoding.UTF8.GetBytes(o.ToJsonString() + "\n"); lock (stdout) { stdout.Write(b, 0, b.Length); stdout.Flush(); } }
        try
        {
            SetDllDirectory(bin); // onnxruntime.dll sits next to the C library
            var lib = NativeLibrary.Load(Path.Combine(bin, "sherpa-onnx-c-api.dll"));
            create = Marshal.GetDelegateForFunctionPointer<CreateFn>(NativeLibrary.GetExport(lib, "SherpaOnnxCreateOfflineTts"));
            generate = Marshal.GetDelegateForFunctionPointer<GenerateFn>(NativeLibrary.GetExport(lib, "SherpaOnnxOfflineTtsGenerate"));
            freeAudio = Marshal.GetDelegateForFunctionPointer<FreeAudioFn>(NativeLibrary.GetExport(lib, "SherpaOnnxDestroyOfflineTtsGeneratedAudio"));
        }
        catch (Exception e) { Reply(new JsonObject { ["ready"] = false, ["error"] = "couldn't load the voice library: " + e.Message }); return 2; }
        Reply(new JsonObject { ["ready"] = true });
        string? line;
        var stdin = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
        while ((line = stdin.ReadLine()) != null)
        {
            JsonNode? req = null; int id = 0;
            try { req = JsonNode.Parse(line); id = req?["id"]?.GetValue<int>() ?? 0; } catch { continue; }
            if (req == null) continue;
            try
            {
                var started = DateTime.UtcNow;
                var tts = Voice(req);
                var text = req["text"]?.GetValue<string>() ?? "";
                var outPath = req["out"]?.GetValue<string>() ?? "";
                if (text.Length == 0 || outPath.Length == 0) { Reply(new JsonObject { ["id"] = id, ["error"] = "nothing to say" }); continue; }
                var t = Marshal.StringToCoTaskMemUTF8(text);
                IntPtr a;
                try { a = generate!(tts, t, req["sid"]?.GetValue<int>() ?? 0, (float)(req["speed"]?.GetValue<double>() ?? 1.0)); }
                finally { Marshal.FreeCoTaskMem(t); }
                if (a == IntPtr.Zero) { Reply(new JsonObject { ["id"] = id, ["error"] = "no audio" }); continue; }
                try
                {
                    var au = Marshal.PtrToStructure<Audio>(a);
                    if (au.n <= 0) { Reply(new JsonObject { ["id"] = id, ["error"] = "no audio" }); continue; }
                    var samples = new float[au.n]; Marshal.Copy(au.samples, samples, 0, au.n);
                    WriteWav(outPath, samples, au.sample_rate);
                }
                finally { freeAudio!(a); }
                Reply(new JsonObject { ["id"] = id, ["ok"] = true, ["ms"] = (int)(DateTime.UtcNow - started).TotalMilliseconds });
            }
            catch (Exception e) { Reply(new JsonObject { ["id"] = id, ["error"] = e.Message }); }
        }
        return 0;
    }

    // a voice is loaded the first time it's asked for, then kept
    static IntPtr Voice(JsonNode r)
    {
        var key = (r["voice"]?.GetValue<string>() ?? "") + "|" + (r["dir"]?.GetValue<string>() ?? "");
        if (loaded.TryGetValue(key, out var have)) return have;
        var kind = r["kind"]?.GetValue<string>() ?? "vits";
        var dir = r["dir"]?.GetValue<string>() ?? "";
        string P(string f) => Path.Combine(dir, f);
        var c = new TtsConfig { max_num_sentences = 1, silence_scale = 0.2f, rule_fsts = S(""), rule_fars = S("") };
        c.model.num_threads = Math.Max(1, Math.Min(4, r["threads"]?.GetValue<int>() ?? 2));
        c.model.provider = S("cpu");
        // every text field gets an empty string rather than nothing, as the library expects
        c.model.vits = new Vits { model = S(""), lexicon = S(""), tokens = S(""), data_dir = S(""), dict_dir = S(""), noise_scale = 0.667f, noise_scale_w = 0.8f, length_scale = 1f };
        c.model.matcha = new Matcha { acoustic_model = S(""), vocoder = S(""), lexicon = S(""), tokens = S(""), data_dir = S(""), dict_dir = S(""), noise_scale = 1f, length_scale = 1f };
        c.model.kokoro = new Kokoro { model = S(""), voices = S(""), tokens = S(""), data_dir = S(""), dict_dir = S(""), lexicon = S(""), lang = S(""), length_scale = 1f };
        c.model.kitten = new Kitten { model = S(""), voices = S(""), tokens = S(""), data_dir = S(""), length_scale = 1f };
        c.model.zipvoice = new Zipvoice { tokens = S(""), encoder = S(""), decoder = S(""), vocoder = S(""), data_dir = S(""), lexicon = S("") };
        c.model.pocket = new Pocket { lm_flow = S(""), lm_main = S(""), encoder = S(""), decoder = S(""), text_conditioner = S(""), vocab_json = S(""), token_scores_json = S("") };
        c.model.supertonic = new Supertonic { duration_predictor = S(""), text_encoder = S(""), vector_estimator = S(""), vocoder = S(""), tts_json = S(""), unicode_indexer = S(""), voice_style = S("") };
        if (kind == "kokoro10" || kind == "kokoro")
        {
            c.model.kokoro = new Kokoro { model = S(P("model.int8.onnx")), voices = S(P("voices.bin")), tokens = S(P("tokens.txt")), data_dir = S(P("espeak-ng-data")), length_scale = 1f,
                dict_dir = S(kind == "kokoro10" ? P("dict") : ""), lexicon = S(kind == "kokoro10" ? P("lexicon-us-en.txt") + "," + P("lexicon-zh.txt") : ""), lang = S("") };
        }
        else
        {
            c.model.vits = new Vits { model = S(P(r["model"]?.GetValue<string>() ?? "model.onnx")), lexicon = S(""), tokens = S(P("tokens.txt")), data_dir = S(P("espeak-ng-data")), dict_dir = S(""), noise_scale = 0.667f, noise_scale_w = 0.8f, length_scale = 1f };
        }
        var tts = create!(ref c);
        if (tts == IntPtr.Zero) throw new Exception("the voice didn't load");
        loaded[key] = tts;
        return tts;
    }

    static void WriteWav(string path, float[] s, int rate)
    {
        var tmp = path + ".part";
        using (var f = new BinaryWriter(File.Create(tmp)))
        {
            int bytes = s.Length * 2;
            f.Write(Encoding.ASCII.GetBytes("RIFF")); f.Write(36 + bytes); f.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
            f.Write(16); f.Write((short)1); f.Write((short)1); f.Write(rate); f.Write(rate * 2); f.Write((short)2); f.Write((short)16);
            f.Write(Encoding.ASCII.GetBytes("data")); f.Write(bytes);
            foreach (var x in s) f.Write((short)Math.Clamp((int)(x * 32767f), -32768, 32767));
        }
        File.Move(tmp, path, true);
    }
}
