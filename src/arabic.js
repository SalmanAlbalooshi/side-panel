// Arabic (including Bahraini) for talking to Blink. The app's screens stay English; this only turns everyday spoken
// Arabic into the commands Blink knows, and gives short replies back in Arabic when you spoke Arabic.
const AR = /[؀-ۿ]/;
const isArabic = (s) => AR.test(String(s || ""));
const digits = (s) => String(s).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
const NUMW = { "وحدة": 1, "واحد": 1, "دقيقة": 1, "ساعة": 60, "ساعتين": 120, "دقيقتين": 2, "خمس": 5, "خمسة": 5, "عشر": 10, "عشرة": 10, "ربع": 15, "ربع ساعة": 15, "عشرين": 20, "ثلاثين": 30, "نص ساعة": 30, "نص": 30 };
// spoken Arabic -> the English command Blink understands (first match wins)
const RULES = [
  [/(طف[يى]|سكر|بند|اكتم) (ال)?(مايك|مايكروفون|الميك)/, () => "mute me"],
  [/(شغل|افتح|رجع) (ال)?(مايك|مايكروفون|الميك)/, () => "mic on"],
  [/(اكتم|سكر|طف[يى]) (ال)?صوت|صامت/, () => "mute"],
  [/(شغل|رجع) (ال)?صوت/, () => "unmute"],
  [/(ارفع|علي|زيد) (ال)?صوت/, () => "volume up"],
  [/(نزل|وطي|قلل|خفض) (ال)?صوت/, () => "turn it down"],
  [/(ال)?صوت (\d+)/, (m) => "volume " + m[2]],
  [/(الاغنية|الأغنية|اللي) (الجاية|بعدها)|(اغنية|أغنية) (ثانية|غيرها)|الي بعده/, () => "next song"],
  [/(الاغنية|الأغنية) (اللي )?(قبل|السابقة)|رجع (الاغنية|الأغنية)/, () => "previous song"],
  [/^(وقف|وقّف|بوز)( (الاغنية|الأغنية|الموسيقى|الاغاني|الأغاني))?$/, () => "pause"],
  [/^(كمل|كمّل)( (الاغنية|الأغنية|الموسيقى))?$/, () => "play"],
  [/(شنو|ايش|وش) (هالاغنية|هالأغنية|الاغنية|الأغنية|اللي يشتغل)/, () => "what's playing"],
  [/(وضع|مود) (ال)?(شغل|عمل|دوام)/, () => "work mode"],
  [/(وضع|مود) (ال)?(بيت|البيت)/, () => "home mode"],
  [/(وضع|مود) (ال)?(العاب|ألعاب|قيمنق)/, () => "gaming mode"],
  [/(وقف|طف[يى]|بطل) (ال)?تركيز/, () => "stop focus"],
  [/(تركيز|ركز)(.*?)(\d+)/, (m) => "focus " + m[3] + " minutes"],
  [/(تركيز|ركز)/, () => "focus 25 minutes"],
  [/(ذكرني|ذكّرني|نبهني) (بعد|خلال) (\d+ ?|ربع ساعة|نص ساعة|ساعتين|ساعة|دقيقتين|دقيقة|خمس|عشر|عشرين|ثلاثين)\s*(دقيقة|دقيقه|دقايق|دقائق|ساعة|ساعات)?\s*(عشان|ان|أن|اني|إني)?\s*(.*)$/, (m) => "remind me in " + minutes(m[3] + " " + (m[4] || "")) + " minutes to " + (m[6] || "check")],
  [/(تايمر|مؤقت|منبه) (.+)/, (m) => "set a timer for " + minutes(m[2]) + " minutes"],
  [/(الاجتماع|الميتنق|الميتنج) (الجاي|القادم|اللي بعده)|(شنو|ايش|وش) (عندي|في) (اجتماع|اجتماعات|ميتنق)|(اجتماعاتي|يومي)/, () => "next meeting"],
  [/(ادخل|انضم|خشني) (ال)?(اجتماع|ميتنق|الميتنج)/, () => "join meeting"],
  [/(لخص|لخّص) (لي )?(اللي|الي) (نسخته|ناسخه|نسخت)/, () => "summarise what I copied"],
  [/(اشرح|فسر) (لي )?(اللي|الي) (نسخته|ناسخه)/, () => "explain what I copied"],
  [/(ترجم) (اللي|الي) (نسخته|ناسخه)/, () => "translate what I copied"],
  [/(صحح|عدل) (اللي|الي) (كتبته|نسخته)/, () => "fix what I copied"],
  [/(شنو|ايش|وش) (على|في) (ال)?شاشة/, () => "what's on my screen"],
  [/(لقطة شاشة|سكرين ?شوت|صور الشاشة)/, () => "screenshot"],
  [/(كم الساعة|الساعة كم)/, () => "what time is it"],
  [/(شنو|ايش|وش|كم) (التاريخ|اليوم)/, () => "what is the date"],
  [/(سولف|كلم|راسل|دردش) (مع )?(.+?)( على تيمز| في تيمز)?$/, (m) => "chat with " + m[3]],
  [/(اتصل|دق) (على |ب)?(.+)$/, (m) => "call " + m[3]],
  [/(ايميل|إيميل|ارسل ايميل) (ل|الى|إلى)? ?(.+)$/, (m) => "email " + m[3]],
  [/(ابحث|دور|فتش) (عن |على )?(.+)$/, (m) => "search for " + m[3]],
  [/(شغل|حط) (لي )?(قائمة |بلاي ?لست )?(.+)$/, (m) => "play " + m[4]],
  [/(افتح|شغل) (لي )?(.+)$/, (m) => "open " + m[3]],
  [/(ملخص|لخص) (يومي|اليوم)|(صبحني|صباح الخير)/, () => "brief me"]
];
function minutes(s) { s = digits(s).trim(); const n = (s.match(/\d+/) || [])[0]; let v = n ? Number(n) : null; for (const [w, x] of Object.entries(NUMW)) if (v == null && s.includes(w)) v = x; if (v == null) v = 5; if (/ساع/.test(s) && n) v *= 60; return v; }
function toCommand(text) {
  const t = digits(String(text || "")).replace(/[؟?!.،]/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, f] of RULES) { const m = t.match(re); if (m) return f(m); }
  return null;
}
// short fixed replies, in Arabic
const SAY = [
  [/^Mic off/, "سكرت المايك."], [/^Mic on/, "شغلت المايك."], [/^Sound off/, "سكرت الصوت."], [/^Sound on/, "رجعت الصوت."],
  [/^Volume (\d+)/, (m) => "الصوت " + m[1] + "."], [/^Louder/, "رفعت الصوت."], [/^Quieter/, "نزلت الصوت."],
  [/^Next song/, "الأغنية اللي بعدها."], [/^Previous song/, "الأغنية اللي قبل."], [/^Paused/, "وقفت."], [/^Playing (.+)\.$/, (m) => "شغلت " + m[1] + "."], [/^Playing/, "شغلت."],
  [/^Switched to (.+)\.$/, (m) => "حولت على " + m[1] + "."], [/^Focus on for (\d+)/, (m) => "التركيز شغال " + m[1] + " دقيقة. بأجل التنبيهات."], [/^Focus stopped/, "وقفت التركيز."],
  [/^Okay, in (\d+) minutes/, (m) => "أوكي، بذكرك بعد " + m[1] + " دقيقة."], [/^Timer set for (\d+)/, (m) => "المؤقت " + m[1] + " دقيقة."],
  [/^Opening a chat with (.+)\.$/, (m) => "فتحت المحادثة مع " + m[1] + "."], [/^Calling (.+)\.$/, (m) => "أتصل على " + m[1] + "."], [/^New email to (.+)\.$/, (m) => "إيميل جديد لـ " + m[1] + "."],
  [/^Opening (.+)\.$/, (m) => "أفتح " + m[1] + "."], [/^Searching the web/, "أدور لك."], [/^Screenshot copied/, "صورت الشاشة ونسختها."],
  [/^No more meetings today/, "ما عندك اجتماعات ثانية اليوم."], [/^Nothing is playing/, "ما في شي شغال."], [/^Joining/, "أدخلك الاجتماع."],
  [/^Here's your day/, "هذا يومك."], [/^Working on it/, "قاعد أشتغل عليه."], [/^Thinking/, "لحظة..."],
  [/^I can't do that on my own/, "ما أقدر أسويها بروحي. اختار ذكاء اصطناعي يفتح في المتصفح:"], [/^That needs an AI/, "هذي تحتاج ذكاء اصطناعي. اختار واحد يفتح في المتصفح:"]
];
function sayArabic(en) { for (const [re, r] of SAY) { const m = String(en || "").match(re); if (m) return typeof r === "function" ? r(m) : r; } return en; }
// rough sound match between Arabic and Latin spellings: سارة ~ Sara, سبوتيفاي ~ Spotify
const T = { "ا": "a", "أ": "a", "إ": "a", "آ": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh", "د": "d", "ذ": "th", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w", "ي": "y", "ى": "a", "ة": "a", "ء": "", "ئ": "y", "ؤ": "w" };
function skeleton(s) {
  let t = String(s || "").toLowerCase().split("").map((c) => (T[c] !== undefined ? T[c] : c)).join("");
  t = t.replace(/p/g, "b").replace(/v/g, "f").replace(/q/g, "k").replace(/c/g, "k").replace(/ph/g, "f").replace(/th/g, "t").replace(/sh/g, "s").replace(/kh|gh/g, "k");
  return t.replace(/[^a-z]/g, "").replace(/[aeiouwyh]/g, "").replace(/(.)\1+/g, "$1");
}
module.exports = { isArabic, toCommand, sayArabic, digits, skeleton };
