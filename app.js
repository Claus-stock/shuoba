import Anthropic from "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm";
import { LOCAL_MODELS, loadLocal, localChat, localReady, addPinyin, resetLocal, isEngineBroken } from "./local-ai.js";
import { askGemini } from "./gemini.js";

/* =========================================================================
   Shuō ba 说吧 — a daily Mandarin speaking partner.
   Voice in: Web Speech API (zh-CN).  Voice out: speechSynthesis.
   Tutor: a free on-phone model (Qwen2.5 via WebLLM, see local-ai.js), or Claude with the learner's own key.
   Everything is stored in localStorage on the phone.
   ========================================================================= */

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ---------------------------------------------------------------- topics
const CATEGORIES = [
  { id: "all", en: "All", zh: "全部" },
  { id: "everyday", en: "Everyday", zh: "日常" },
  { id: "travel", en: "Travel", zh: "出行" },
  { id: "social", en: "Social", zh: "社交" },
  { id: "business", en: "Business", zh: "商务" },
];

const TOPICS = [
  // Everyday
  { id: "coffee", cat: "everyday", zh: "点咖啡", en: "Ordering coffee", role: "a friendly barista at a café in Beijing" },
  { id: "restaurant", cat: "everyday", zh: "在饭馆", en: "At a restaurant", role: "a waiter at a busy Sichuan restaurant" },
  { id: "bubbletea", cat: "everyday", zh: "买奶茶", en: "Ordering bubble tea", role: "a bubble tea shop employee" },
  { id: "supermarket", cat: "everyday", zh: "超市购物", en: "At the supermarket", role: "a supermarket employee stocking shelves" },
  { id: "market", cat: "everyday", zh: "在市场", en: "Bargaining at a market", role: "a market stall seller who enjoys haggling" },
  { id: "clothes", cat: "everyday", zh: "买衣服", en: "Buying clothes", role: "a shop assistant in a clothing store" },
  { id: "pay", cat: "everyday", zh: "扫码付款", en: "Paying with your phone", role: "a shopkeeper who only takes WeChat Pay or Alipay" },
  { id: "pharmacy", cat: "everyday", zh: "在药店", en: "At the pharmacy", role: "a pharmacist asking about symptoms" },
  { id: "doctor", cat: "everyday", zh: "看医生", en: "Seeing a doctor", role: "a kind doctor at a clinic" },
  { id: "haircut", cat: "everyday", zh: "理发", en: "Getting a haircut", role: "a hairdresser" },
  { id: "delivery", cat: "everyday", zh: "外卖问题", en: "A food delivery problem", role: "a delivery app support agent" },
  { id: "phone", cat: "everyday", zh: "打电话订位", en: "Booking a table by phone", role: "a restaurant host answering the phone" },
  { id: "gym", cat: "everyday", zh: "在健身房", en: "At the gym", role: "a personal trainer at the gym" },
  // Travel
  { id: "taxi", cat: "travel", zh: "打车", en: "Taking a taxi", role: "a chatty taxi driver in Shanghai" },
  { id: "metro", cat: "travel", zh: "坐地铁", en: "Using the metro", role: "a helpful station worker at a metro ticket machine" },
  { id: "directions", cat: "travel", zh: "问路", en: "Asking for directions", role: "a local passer-by on the street" },
  { id: "hotel", cat: "travel", zh: "酒店入住", en: "Hotel check-in", role: "a hotel receptionist" },
  { id: "train", cat: "travel", zh: "买火车票", en: "Buying train tickets", role: "a ticket clerk at a high-speed rail station" },
  { id: "airport", cat: "travel", zh: "在机场", en: "At the airport", role: "an airline check-in agent" },
  { id: "lost", cat: "travel", zh: "丢东西了", en: "Lost something", role: "a staff member at a lost-and-found desk" },
  // Social
  { id: "neighbour", cat: "social", zh: "认识邻居", en: "Meeting a neighbour", role: "your new neighbour in the lift of your apartment building" },
  { id: "plans", cat: "social", zh: "约朋友", en: "Making plans with a friend", role: "your Chinese friend Xiao Mei, planning the weekend" },
  { id: "family", cat: "social", zh: "聊家人", en: "Talking about family", role: "a new friend curious about your family" },
  { id: "hobbies", cat: "social", zh: "兴趣爱好", en: "Hobbies", role: "a classmate at a language exchange asking about hobbies" },
  { id: "food", cat: "social", zh: "喜欢吃什么", en: "Food you like", role: "a friend who loves food and wants to know your taste" },
  { id: "weekend", cat: "social", zh: "周末做了什么", en: "Your weekend", role: "a friend asking about your weekend" },
  { id: "birthday", cat: "social", zh: "生日聚会", en: "At a birthday party", role: "a guest at a friend's birthday party" },
  { id: "cinema", cat: "social", zh: "看电影", en: "Going to the movies", role: "a friend deciding which film to see" },
  { id: "free", cat: "social", zh: "随便聊聊", en: "Free chat", role: "a warm, curious friend chatting about everyday life" },
  // Business
  { id: "work", cat: "business", zh: "自我介绍", en: "Introducing yourself at work", role: "a new colleague on your first day at a company in Shanghai" },
  { id: "networking", cat: "business", zh: "交换名片", en: "Networking & business cards", role: "a sales director you meet at an industry event, exchanging business cards" },
  { id: "meeting", cat: "business", zh: "开会", en: "In a meeting", role: "a project manager running a weekly team meeting who asks you for an update" },
  { id: "schedule", cat: "business", zh: "约时间开会", en: "Scheduling a meeting", role: "a client's assistant arranging a meeting time with you" },
  { id: "clientcall", cat: "business", zh: "给客户打电话", en: "Calling a client", role: "a client answering your phone call about an order" },
  { id: "presentation", cat: "business", zh: "介绍公司", en: "Presenting your company", role: "a potential business partner asking about your company and products" },
  { id: "negotiation", cat: "business", zh: "谈价格", en: "Negotiating a deal", role: "a supplier negotiating price, quantity and delivery time" },
  { id: "dinner", cat: "business", zh: "商务宴请", en: "Business dinner & toasts", role: "a Chinese host at a business dinner who proposes toasts (干杯)" },
  { id: "interview", cat: "business", zh: "面试", en: "Job interview", role: "an HR manager interviewing you for a job" },
  { id: "tradefair", cat: "business", zh: "展会", en: "At a trade fair", role: "an exhibitor at a trade fair booth in Guangzhou" },
  { id: "smalltalk", cat: "business", zh: "办公室闲聊", en: "Office small talk", role: "a colleague making small talk by the coffee machine" },
];

const LEVELS = {
  beginner: "beginner (HSK 1–2): very short, simple sentences with the most common words",
  intermediate: "intermediate (HSK 3–4): natural everyday sentences, a few new words at most",
  advanced: "advanced (HSK 5+): fully natural, idiomatic spoken Chinese",
};

// ---------------------------------------------------------------- storage
const KEY = "shuoba:v1";
const defaults = {
  settings: { apiKey: "", model: "claude-opus-5", level: "beginner", rate: 0.9, voice: "", autoSpeak: true, showPy: true, showEn: true, handsFree: true, v2: true, v4: true, brain: "gemini", localSize: "standard", geminiKey: "", geminiModel: "" },
  days: [],
  minutes: {},
  history: [],
  session: null,
};
let db = load();
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw) return structuredClone(defaults);
    const settings = { ...defaults.settings, ...raw.settings };
    // v2: hands-free became the default, so you can just talk.
    if (!raw.settings?.v2) { settings.handsFree = true; settings.v2 = true; }
    // v3: a free on-phone AI became the default; keep Claude for anyone who already added a key.
    if (!raw.settings?.brain) settings.brain = raw.settings?.apiKey ? "claude" : "local";
    // v4: the on-phone AI crashes on many phones, so Google's free Gemini became the default.
    if (!raw.settings?.v4) { if (settings.brain === "local") settings.brain = "gemini"; settings.v4 = true; }
    return { ...structuredClone(defaults), ...raw, settings };
  } catch {
    return structuredClone(defaults);
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage full or blocked */ }
}

// ---------------------------------------------------------------- dates
const dayKey = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
function streak() {
  const set = new Set(db.days);
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet: count up to yesterday
  let n = 0;
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function todaysTopic() {
  const start = new Date(2026, 0, 1);
  const idx = Math.floor((new Date().setHours(12) - start.setHours(12)) / 86400000);
  const pool = TOPICS.filter((t) => t.id !== "free");
  return pool[((idx % pool.length) + pool.length) % pool.length];
}
function markPracticed(minutes) {
  const k = dayKey();
  if (!db.days.includes(k)) db.days.push(k);
  db.minutes[k] = Math.round(((db.minutes[k] || 0) + minutes) * 10) / 10;
  save();
}

// ---------------------------------------------------------------- tones
const TONE = {};
"āēīōūǖĀĒĪŌŪǕ".split("").forEach((c) => (TONE[c] = 1));
"áéíóúǘÁÉÍÓÚǗ".split("").forEach((c) => (TONE[c] = 2));
"ǎěǐǒǔǚǍĚǏǑǓǙ".split("").forEach((c) => (TONE[c] = 3));
"àèìòùǜÀÈÌÒÙǛ".split("").forEach((c) => (TONE[c] = 4));
const toneOf = (syl) => { for (const c of syl) if (TONE[c]) return TONE[c]; return 5; };
const isHan = (c) => /\p{Script=Han}/u.test(c);
function pinyinTokens(py) {
  const out = [];
  const re = /([A-Za-züÜÀ-ɏ]+)|([^A-Za-züÜÀ-ɏ]+)/g;
  let m;
  while ((m = re.exec((py || "").normalize("NFC")))) out.push(m[1] ? { text: m[1], tone: toneOf(m[1]) } : { text: m[2], tone: null });
  return out;
}

// A Chinese line: tone-coloured pinyin, characters (coloured when they align), English, audio.
function lineBlock(item, { audio = true } = {}) {
  const wrap = el("div", "line");
  const toks = pinyinTokens(item.pinyin);
  const syl = toks.filter((t) => t.tone);
  const han = [...(item.zh || "")].filter(isHan);

  const py = el("div", "py opt");
  toks.forEach((t) => py.append(el("span", t.tone ? "t" + t.tone : "", t.text)));

  const hz = el("div", "hz");
  if (han.length && han.length === syl.length) {
    let i = 0;
    for (const c of item.zh) {
      if (isHan(c)) hz.append(el("span", "t" + syl[i++].tone, c));
      else hz.append(document.createTextNode(c));
    }
  } else hz.textContent = item.zh || "";

  wrap.append(py, hz);
  if (item.en) wrap.append(el("div", "en opt", item.en));
  if (audio) wrap.append(audioRow(item.zh));
  return wrap;
}

// ---------------------------------------------------------------- speech out
let voices = [];
function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  voices = speechSynthesis.getVoices().filter((v) => /^zh/i.test(v.lang) || /chinese|mandarin|普通话|中文/i.test(v.name));
  voices.sort((a, b) => (/CN/i.test(b.lang) ? 1 : 0) - (/CN/i.test(a.lang) ? 1 : 0));
}
function currentVoice() {
  return voices.find((v) => v.voiceURI === db.settings.voice) || voices.find((v) => /zh[-_]CN/i.test(v.lang)) || voices[0] || null;
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
}
function speak(text, rate = db.settings.rate, lang = "zh-CN") {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window) || !text) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    if (lang === "zh-CN") {
      const v = currentVoice();
      if (v) u.voice = v;
    } else {
      const v = speechSynthesis.getVoices().find((x) => /^en[-_](US|GB)/i.test(x.lang) && /female|samantha|zira|aria|google us/i.test(x.name))
        || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
    }
    const wasState = avatarState;
    setAvatar("speaking");
    const done = () => { if (avatarState === "speaking") setAvatar(wasState === "speaking" ? "idle" : wasState); resolve(); };
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
  });
}

// ---------------------------------------------------------------- avatar
let avatarState = "idle";
const AVATAR_LABEL = {
  idle: "Your turn — tap the mic",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};
const LILI_SVG = `
<svg viewBox="0 0 200 200" aria-hidden="true">
  <defs><clipPath id="lili-clip"><circle cx="100" cy="100" r="94"/></clipPath></defs>
  <circle class="halo" cx="100" cy="100" r="97"/>
  <circle cx="100" cy="100" r="94" fill="var(--av-bg)"/>
  <g clip-path="url(#lili-clip)">
    <g class="head">
      <path d="M52 104C50 56 78 34 100 34s50 22 48 70l2 62H50z" fill="var(--av-hair)"/>
      <path d="M28 210c4-40 34-58 72-58s68 18 72 58z" fill="var(--av-top)"/>
      <path d="M84 152l16 24 16-24z" fill="var(--av-shirt)"/>
      <rect x="88" y="122" width="24" height="36" rx="10" fill="var(--av-skin-2)"/>
      <circle cx="62" cy="104" r="8" fill="var(--av-skin-2)"/>
      <circle cx="138" cy="104" r="8" fill="var(--av-skin-2)"/>
      <circle cx="62" cy="116" r="3.2" fill="var(--gold)"/>
      <circle cx="138" cy="116" r="3.2" fill="var(--gold)"/>
      <ellipse cx="100" cy="100" rx="38" ry="43" fill="var(--av-skin)"/>
      <circle cx="100" cy="36" r="17" fill="var(--av-hair)"/>
      <path d="M86 30l30-8" stroke="var(--gold)" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M60 94c0-34 20-46 40-46 24 0 42 16 40 46-12-6-24-16-30-28-10 14-28 24-50 28z" fill="var(--av-hair)"/>
      <path class="brows" d="M77 85q9-5 18 0M105 85q9-5 18 0" fill="none" stroke="var(--av-hair)" stroke-width="3" stroke-linecap="round"/>
      <g class="eyes">
        <ellipse cx="86" cy="100" rx="5" ry="6.2" fill="var(--av-ink)"/>
        <ellipse cx="114" cy="100" rx="5" ry="6.2" fill="var(--av-ink)"/>
        <circle cx="88" cy="97.5" r="1.7" fill="#fff"/>
        <circle cx="116" cy="97.5" r="1.7" fill="#fff"/>
      </g>
      <path d="M100 105q-3 8 1 10" fill="none" stroke="var(--av-skin-2)" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="76" cy="115" rx="8" ry="4.5" fill="var(--av-cheek)" opacity=".7"/>
      <ellipse cx="124" cy="115" rx="8" ry="4.5" fill="var(--av-cheek)" opacity=".7"/>
      <path class="smile" d="M88 123q12 9 24 0" fill="none" stroke="var(--av-mouth)" stroke-width="3.2" stroke-linecap="round"/>
      <ellipse class="mouth" cx="100" cy="125" rx="8" ry="6" fill="var(--av-mouth)"/>
    </g>
  </g>
</svg>`;
document.querySelectorAll(".lili").forEach((n) => (n.innerHTML = LILI_SVG));

function setAvatar(state, label) {
  avatarState = state;
  document.querySelectorAll(".lili").forEach((n) => (n.dataset.state = state));
  const st = $("#tutor-state");
  if (st) st.textContent = label || AVATAR_LABEL[state] || "";
}

// What Lìlì is saying right now, shown under her name on the talk screen.
function setCaption(line) {
  const c = $("#caption");
  if (!c) return;
  c.textContent = "";
  if (!line) return;
  if (line.help) c.append(el("div", "", line.help));
  else c.append(lineBlock(line, { audio: false }));
}
const PLAY = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7.5-4.5z"/></svg>';
function audioRow(text) {
  const r = el("div", "audio");
  if (!("speechSynthesis" in window) || !text) return r;
  const a = el("button", "play"); a.type = "button"; a.innerHTML = PLAY + "<span>Listen</span>";
  const b = el("button", "play"); b.type = "button"; b.innerHTML = PLAY + "<span>Slow</span>";
  a.onclick = () => speak(text);
  b.onclick = () => speak(text, Math.max(0.45, db.settings.rate - 0.35));
  r.append(a, b);
  return r;
}

// ---------------------------------------------------------------- speech in
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let listening = false;
function listen(lang = "zh-CN") {
  if (!Recognition) {
    setStatus("This browser can't listen. Use Chrome on Android, or tap Type.", "err");
    return;
  }
  if (busy || listening) return;
  speechSynthesis?.cancel();
  rec = new Recognition();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = "";
  const started = Date.now();
  listening = true;
  mic.classList.add("listening");
  $("#mic-en").classList.toggle("on", lang !== "zh-CN");
  setAvatar("listening", lang === "zh-CN" ? "Listening… 请说中文" : "Listening… tell me in English");
  setStatus(lang === "zh-CN" ? "Listening… 请说中文" : "Listening… say it in English and I'll help", "");

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    setStatus(finalText + interim || "Listening…", "live");
  };
  rec.onerror = (e) => {
    const msg = {
      "not-allowed": "Microphone is blocked. Allow it for this app in your phone's settings.",
      "service-not-allowed": "Microphone is blocked. Allow it for this app in your phone's settings.",
      "no-speech": "I didn't hear you. Tap the mic when you're ready.",
      network: "Speech recognition needs an internet connection.",
      "audio-capture": "No microphone found.",
    }[e.error];
    if (msg) setStatus(msg, "err");
  };
  rec.onend = () => {
    listening = false;
    mic.classList.remove("listening");
    $("#mic-en").classList.remove("on");
    if (avatarState === "listening") setAvatar("idle");
    const text = finalText.trim();
    if (text) {
      markPracticed((Date.now() - started) / 60000);
      sendLearner(text, lang === "zh-CN" ? "spoken" : "spoken-en");
    } else if (!$("#status").classList.contains("err")) {
      setStatus("Tap the mic and answer in Chinese", "");
    }
  };
  rec.start();
}
function stopListening() { try { rec?.stop(); } catch { /* already stopped */ } }

// ---------------------------------------------------------------- Claude
const LINE = {
  type: "object", additionalProperties: false, required: ["zh", "pinyin", "en"],
  properties: { zh: { type: "string" }, pinyin: { type: "string" }, en: { type: "string" } },
};
const START_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["goal_en", "key_phrases", "reply", "suggestions"],
  properties: {
    goal_en: { type: "string" },
    key_phrases: { type: "array", items: LINE },
    reply: LINE,
    suggestions: { type: "array", items: LINE },
  },
};
const TURN_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["help_en", "feedback", "reply", "suggestions", "lesson_done"],
  properties: {
    help_en: { type: "string" },
    feedback: {
      type: "object", additionalProperties: false,
      required: ["verdict", "better_zh", "better_pinyin", "note_en", "pronunciation_tip"],
      properties: {
        verdict: { type: "string", enum: ["great", "small fix", "try this"] },
        better_zh: { type: "string" },
        better_pinyin: { type: "string" },
        note_en: { type: "string" },
        pronunciation_tip: { type: "string" },
      },
    },
    reply: LINE,
    suggestions: { type: "array", items: LINE },
    lesson_done: { type: "boolean" },
  },
};
const SUMMARY_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["stars", "praise_en", "fixes", "new_words", "next_time_en"],
  properties: {
    stars: { type: "integer" },
    praise_en: { type: "string" },
    fixes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["you_said", "better_zh", "better_pinyin", "note_en"],
        properties: { you_said: { type: "string" }, better_zh: { type: "string" }, better_pinyin: { type: "string" }, note_en: { type: "string" } },
      },
    },
    new_words: { type: "array", items: LINE },
    next_time_en: { type: "string" },
  },
};

function tutorRules(topic, level) {
  return `You are Lìlì (丽丽), a warm, patient Mandarin speaking tutor from Beijing, shown to the learner as a friendly avatar. You run short spoken role-play lessons for one learner who wants to speak everyday and business Chinese.

Learner level: ${LEVELS[level]}.
Scenario: ${topic.en} (${topic.zh}). In the role-play you act as ${topic.role}.

Helping in English: if the learner answers in English ([spoken-en], or English in [typed]), doesn't understand, or asks something like "what does that mean?" / "how do I say…", step out of the role-play for a moment and help them as Lìlì:
- help_en: 1–3 short, friendly spoken English sentences. Explain what they need (e.g. what your last line meant, or how to say what they wanted to say) and invite them to try saying it in Chinese now ("Try saying: …"). It is read aloud, so no pinyin, symbols or lists in help_en — you may include the Chinese characters of the phrase.
- feedback.verdict "try this", with better_zh / better_pinyin = the Chinese sentence they should say.
- reply: gently repeat or rephrase your last in-character line (simpler if needed) so they can now answer it in Chinese. Don't move the story on.
Otherwise help_en is an empty string and you stay in character.

How the learner's messages arrive:
- [spoken] = their Chinese, transcribed by phone speech recognition (zh-CN).
- [spoken-en] = they got stuck and said it in English.
- [typed] = typed characters, pinyin (maybe without tones), or English.
Speech recognition turns mispronounced words into wrong characters. When a word looks wrong but sounds close to what fits the context, treat it as a pronunciation slip: put the intended word in better_zh and say exactly which syllable or tone to fix in pronunciation_tip (e.g. "买 mǎi is 3rd tone — dip down; it came out as 卖 mài, 4th tone, 'to sell'"). Otherwise leave pronunciation_tip empty.

Every reply:
- feedback.verdict: "great" (natural and correct), "small fix" (understandable, has an error), or "try this" (English, pinyin-only, or hard to understand). If the learner is repeating a sentence you taught them, judge how close they got and praise the attempt. better_zh/better_pinyin: the natural way to say what they meant (repeat their sentence if already great). note_en: one or two short sentences on what to fix and why, or a brief compliment.
- reply: your in-character answer, spoken style, 1–2 short sentences at their level. Always end with something for them to answer, so the conversation keeps going.
- suggestions: 2–3 different things the learner could say next, at their level.
- lesson_done: true only once the scenario has reached a natural end (usually after 8–12 exchanges); then make your reply a friendly goodbye.
Formatting: simplified characters only. Pinyin always with tone marks, one syllable per Chinese character separated by single spaces (哪里 → "nǎ lǐ", 什么 → "shén me"), no erhua merges, keep punctuation.`;
}

const START_INSTRUCTION = `[start] Begin the lesson. Reply with goal_en (one sentence: what the learner will be able to do after this lesson), 3–5 key_phrases they will need, your opening line as reply, and 2–3 suggestions for how they could answer it.`;

const needsKey = () =>
  (db.settings.brain === "claude" && !db.settings.apiKey) || (db.settings.brain === "gemini" && !db.settings.geminiKey);

let client = null;
function getClient() {
  if (!db.settings.apiKey) throw { code: "no_key" };
  if (!client || client.apiKey !== db.settings.apiKey) {
    client = new Anthropic({ apiKey: db.settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }
  return client;
}

async function askClaude({ system, messages, schema, effort = "low" }) {
  const c = getClient();
  const model = db.settings.model;
  const params = {
    model,
    max_tokens: 8000,
    system,
    messages,
    output_config: { format: { type: "json_schema", schema } },
  };
  // Haiku 4.5 doesn't take an effort setting; the newer models do.
  if (model !== "claude-haiku-4-5") params.output_config.effort = effort;

  let res;
  if (model === "claude-opus-5") {
    // If Claude Opus 5 declines a request, let the API retry it on the recommended fallback model.
    res = await c.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  } else {
    res = await c.messages.create(params);
  }
  if (res.stop_reason === "refusal") throw { code: "refusal" };
  if (res.stop_reason === "max_tokens") throw { code: "too_long" };
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return { data: JSON.parse(text), raw: text };
  } catch {
    throw { code: "bad_json" };
  }
}

// ---------------------------------------------------------------- free AI (on the phone)
// Example answers that show the small model the JSON shape (pinyin is added afterwards from a dictionary).
const L_LINE_EX = { zh: "<Chinese>", en: "<English>" };
const L_START_EX = {
  goal_en: "<one short sentence>",
  key_phrases: [L_LINE_EX, L_LINE_EX],
  reply: { zh: "<your first line in Chinese>", en: "<English>" },
  suggestions: [L_LINE_EX],
};
const L_TURN_EX = {
  help_en: "<English help or empty>",
  feedback: { verdict: "great | small fix | try this", better_zh: "<correct Chinese>", note_en: "<short tip>" },
  reply: { zh: "<your next line in Chinese>", en: "<English>" },
  suggestions: [L_LINE_EX],
};
const L_SUMMARY_EX = {
  stars: 4,
  praise_en: "<one sentence>",
  fixes: [{ you_said: "<what they said>", better_zh: "<correct Chinese>", note_en: "<short tip>" }],
  new_words: [L_LINE_EX, L_LINE_EX],
  next_time_en: "<one tip>",
};

function localRules(topic, level) {
  return `You are Lìlì (丽丽), a Mandarin tutor doing a role-play.
YOU are ${topic.role}. The learner is the other person (${topic.en}). Speak only as your own character.
Learner level: ${level === "beginner" ? "beginner, use very simple words" : level === "intermediate" ? "intermediate" : "advanced"}.
Messages are tagged [spoken], [spoken-en] (English) or [typed].
- feedback: verdict "great" (correct Chinese), "small fix" (a mistake) or "try this" (they used English). better_zh = correct Chinese for what they meant. note_en = a very short tip.
- help_en: only if they used English or are stuck, one short English sentence on how to say it in Chinese; otherwise "".
- reply: YOUR next line in character: one short, simple Chinese sentence that ends with a question, plus English.
- suggestions: 1 short Chinese answer the learner could give.`;
}
const localStart = (topic) => `[start] Start the role-play "${topic.en}". goal_en: one short sentence. key_phrases: 2 short Chinese phrases for this scenario. reply: your first line as ${topic.role}. suggestions: 1 possible answer.`;

let lastLoadStep = "";
async function ensureLocal() {
  if (localReady()) return;
  const chosen = db.settings.localSize || "standard";
  // Try the chosen size, then a more compatible build, then the small Lite model.
  const attempts = [
    { size: chosen, forceF32: false },
    { size: chosen, forceF32: true },
    ...(chosen !== "lite" ? [{ size: "lite", forceF32: false }, { size: "lite", forceF32: true }] : []),
  ];
  let lastErr = null;
  for (const [i, a] of attempts.entries()) {
    lastLoadStep = `load ${a.size}${a.forceF32 ? " f32" : ""}`;
    setAvatar("thinking", "Getting ready…");
    try {
      await loadLocal(a.size, (p, text) => {
        const pct = Math.round(p * 100);
        lastLoadStep = `load ${a.size}${a.forceF32 ? " f32" : ""} ${pct}% ${String(text).slice(0, 60)}`;
        setAvatar("thinking", `Getting ready… ${pct}%`);
        setStatus(`Preparing Lìlì's free AI: ${pct}%. The first time it downloads ${LOCAL_MODELS[a.size].size} (use Wi-Fi). Keep this screen open.`, "");
      }, { forceF32: a.forceF32 });
      if (a.size !== chosen) { db.settings.localSize = a.size; save(); }
      lastLoadStep = `ready ${a.size}${a.forceF32 ? " f32" : ""}`;
      setAvatar("thinking");
      setStatus("Thinking…", "");
      return;
    } catch (e) {
      console.error("Free AI load failed", a, e);
      lastErr = e;
      if (e?.code === "no_webgpu") break;
      if (i < attempts.length - 1) setStatus("That didn't work on this phone — trying a lighter version…", "");
    }
  }
  throw lastErr;
}

// One entry point for both brains. kind: "start" | "turn" | "summary".
const summarySystem = (topic, level) =>
  `You are a Mandarin speaking coach reviewing a short role-play lesson (${topic.en}) with a ${LEVELS[level]} learner. Learner lines marked "spoken" came from speech recognition, so wrong characters there usually mean a pronunciation slip.`;
const summaryPrompt = (transcript) =>
  `Transcript:\n${transcript}\n\nWrite the lesson summary: stars (1–5, how well they managed at their level — be encouraging but honest), praise_en (one or two sentences on what went well), fixes (the 1–4 most useful corrections, quoting what they said), new_words (4–8 useful words or phrases from this lesson they should remember), next_time_en (one concrete tip for next time). Chinese in simplified characters; pinyin with tone marks, one syllable per character separated by spaces.`;

// The JSON shape Gemini fills in for a turn (pinyin is then set from a dictionary, like the on-phone AI).
const G_TURN_SHAPE = {
  ...L_TURN_EX,
  feedback: { ...L_TURN_EX.feedback, pronunciation_tip: "<tip or empty>" },
  suggestions: [L_LINE_EX, L_LINE_EX],
  lesson_done: false,
};

async function askAI(kind, { topic, level, messages, transcript }) {
  if (db.settings.brain === "claude") {
    if (kind === "summary") {
      return askClaude({ system: summarySystem(topic, level), messages: [{ role: "user", content: summaryPrompt(transcript) }], schema: SUMMARY_SCHEMA });
    }
    return askClaude({ system: tutorRules(topic, level), messages, schema: kind === "start" ? START_SCHEMA : TURN_SCHEMA });
  }

  if (db.settings.brain === "gemini") {
    const shape = kind === "start" ? L_START_EX : kind === "turn" ? G_TURN_SHAPE : L_SUMMARY_EX;
    const base = kind === "summary" ? summarySystem(topic, level) : tutorRules(topic, level);
    const res = await askGemini({
      key: db.settings.geminiKey,
      model: db.settings.geminiModel,
      system: `${base}\n\nReply with ONLY one JSON object in exactly this shape, replacing every <...> with your own content:\n${JSON.stringify(shape)}`,
      messages: kind === "summary" ? [{ role: "user", content: summaryPrompt(transcript) }] : messages,
      onModel: (m) => { db.settings.geminiModel = m; save(); },
      onBusy: (text) => { setAvatar("thinking", "Waiting for Google…"); setStatus(text, ""); },
    });
    return finishReply(kind, res, true);
  }

  const run = () => {
    if (kind === "summary") {
      return localChat({
        system: `You are a friendly Mandarin tutor reviewing a short lesson (${topic.en}) with a ${LEVELS[level]} learner.`,
        messages: [{
          role: "user",
          content: `Transcript:
${transcript.slice(-2500)}

Write: stars (1–5), praise_en (one encouraging sentence), fixes (up to 3 corrections of what the learner said), new_words (4–6 useful Chinese words from the lesson with English), next_time_en (one tip).`,
        }],
        example: L_SUMMARY_EX,
        maxTokens: 700,
      });
    }
    // Small model, small memory: send only the latest exchanges.
    // Send the conversation back unchanged each turn so WebLLM can reuse what it already read.
    // Only when it gets long do we trim it (then it re-reads once).
    let msgs = [{ role: "user", content: localStart(topic) }, ...messages.slice(1)];
    if (msgs.length > 17) msgs = msgs.slice(-11);
    return localChat({ system: localRules(topic, level), messages: msgs, example: kind === "start" ? L_START_EX : L_TURN_EX, maxTokens: kind === "start" ? 260 : 200 });
  };
  await ensureLocal();
  let res;
  try {
    res = await run();
  } catch (e) {
    if (!isEngineBroken(e) && e?.code !== "bad_json") throw e;
    // The engine broke (or rambled): start it fresh and try once more.
    console.warn("Free AI retry after", e);
    if (isEngineBroken(e)) {
      // The phone's GPU gave up: start fresh with the smaller Lite model, which needs far less memory.
      await resetLocal();
      if (db.settings.localSize !== "lite") { db.settings.localSize = "lite"; save(); }
      await ensureLocal();
    }
    res = await run();
  }
  return finishReply(kind, res, false);
}

// Fill gaps a model left, then add pinyin from the dictionary. keepExtras: the model can judge
// pronunciation and when the lesson is over (Gemini); the small on-phone model can't.
async function finishReply(kind, res, keepExtras) {
  const d = res.data || {};
  // Drop any <placeholder> the model left unfilled.
  const clean = (o) => {
    if (Array.isArray(o)) o.forEach(clean);
    else if (o && typeof o === "object") for (const k of Object.keys(o)) {
      if (typeof o[k] === "string" && /^<.*>$/.test(o[k].trim())) o[k] = "";
      else clean(o[k]);
    }
  };
  clean(d);
  if (d.feedback && !["great", "small fix", "try this"].includes(d.feedback.verdict)) d.feedback.verdict = "small fix";
  if (kind !== "summary") {
    d.reply = d.reply && typeof d.reply === "object" ? d.reply : { zh: String(d.reply || ""), en: "" };
    if (!d.reply.zh) throw { code: "bad_json", message: res.raw?.slice(0, 120) };
    d.suggestions = Array.isArray(d.suggestions) ? d.suggestions.filter((x) => x?.zh) : [];
    d.help_en = typeof d.help_en === "string" ? d.help_en : "";
    d.goal_en = d.goal_en || "Practise a short, everyday conversation.";
    d.key_phrases = Array.isArray(d.key_phrases) ? d.key_phrases.filter((x) => x?.zh) : [];
    d.feedback = d.feedback && typeof d.feedback === "object" ? d.feedback : { verdict: "great", better_zh: "", note_en: "" };
  } else {
    d.fixes = Array.isArray(d.fixes) ? d.fixes : [];
    d.new_words = Array.isArray(d.new_words) ? d.new_words.filter((x) => x?.zh) : [];
  }
  res.data = d;
  await addPinyin(res.data);
  if (kind === "turn") {
    const f = res.data.feedback;
    f.pronunciation_tip = keepExtras && typeof f.pronunciation_tip === "string" ? f.pronunciation_tip : "";
    res.data.lesson_done = keepExtras ? res.data.lesson_done === true : false;
  }
  return res;
}

function errorMessage(e) {
  if (e?.code === "no_webgpu") return "This phone can't run the on-phone AI. Switch Lìlì's brain to Google (free) in Settings.";
  if (e?.code === "no_gkey") return "Add your free Google key first (see the home screen).";
  if (e?.code === "gemini_offline") return "No internet connection. Check it and try again.";
  if (e?.code === "gemini_http") {
    if (e.status === 400 && /api key|API_KEY/i.test(e.message)) return "Google rejected your key. Copy it again from aistudio.google.com and paste it in Settings.";
    if (e.status === 403) return "Your Google key isn't allowed to use Gemini. Create a new key at aistudio.google.com.";
    if (e.status === 429) return "Google's free limit is used up for the moment. Wait a minute and try again (the daily limit resets overnight).";
    if ([500, 502, 503, 504].includes(e.status)) return "Google's AI is very busy right now (not a problem with the app). Wait a minute and tap Try again.";
    return `Google's AI had a problem (${e.status}). Try again.`;
  }
  if (db.settings.brain === "local" && typeof e?.code !== "string" && !(e instanceof Anthropic.APIError)) {
    return isEngineBroken(e)
      ? "Your phone's graphics chip couldn't run the on-phone AI. Switch to Google's free AI instead."
      : "The on-phone AI had a problem. Check your internet for the first download, then try again.";
  }
  if (e?.code === "no_key") return "Add your Anthropic API key in Settings first.";
  if (e?.code === "refusal") return "The tutor couldn't answer that. Try saying it another way.";
  if (e?.code === "too_long" || e?.code === "bad_json") return "The tutor's answer got cut off. Try again.";
  if (e instanceof Anthropic.AuthenticationError) return "Your API key was rejected. Check it in Settings.";
  if (e instanceof Anthropic.PermissionDeniedError) return "Your API key isn't allowed to use this model. Pick another in Settings.";
  if (e instanceof Anthropic.NotFoundError) return "That model isn't available on your account. Pick another in Settings.";
  if (e instanceof Anthropic.RateLimitError) return "Too many requests, or your spend limit was reached. Wait a moment and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "No connection to the tutor. Check your internet and try again.";
  if (e instanceof Anthropic.APIError && e.status === 400 && /credit|billing|balance/i.test(e.message)) return "Your Anthropic account is out of credit. Top up at console.anthropic.com.";
  if (e instanceof Anthropic.APIError) return `The tutor had a problem (${e.status ?? "error"}). Try again.`;
  return "Something went wrong. Try again.";
}

// ---------------------------------------------------------------- session
let busy = false;
const mic = $("#mic");
const chat = $("#chat");

function setStatus(text, kind) {
  const s = $("#status");
  s.textContent = text;
  s.className = "status" + (kind ? " " + kind : "");
}

// The technical reason behind an error, shown small so a screenshot says what really failed.
function errorDetails(e) {
  const gpu = navigator.gpu ? "WebGPU yes" : "WebGPU no";
  const what = e?.code || e?.name || "Error";
  const msg = String(e?.message || (typeof e === "string" ? e : "") || "").replace(/\s+/g, " ").slice(0, 220);
  const model = e?.model || (db.settings.brain === "claude" ? db.settings.model : db.settings.brain === "gemini" ? (db.settings.geminiModel || "gemini") : `phone-${db.settings.localSize}`);
  return `Details: ${what}${msg ? " – " + msg : ""} · ${model} · ${gpu} · ${lastLoadStep || "no load step"}`;
}
function showErrorDetails(e) {
  const s = $("#status");
  s.append(el("div", "details", errorDetails(e)));
}
function setBusy(b) {
  busy = b;
  mic.disabled = b;
  $("#mic-en").disabled = b;
  $("#finish").disabled = b;
}

function topicById(id) { return TOPICS.find((t) => t.id === id) || TOPICS[0]; }

async function startSession(topicId) {
  const topic = topicById(topicId);
  db.session = { topicId: topic.id, level: db.settings.level, startedAt: Date.now(), items: [], api: [], done: false };
  save();
  openTalk();
  await tutorTurn({ role: "user", content: START_INSTRUCTION }, START_SCHEMA, true);
}

function openTalk() {
  const s = db.session;
  const topic = topicById(s.topicId);
  $("#talk-zh").textContent = topic.zh;
  $("#talk-en").textContent = topic.en;
  $("#t-py").checked = db.settings.showPy;
  $("#t-en").checked = db.settings.showEn;
  $("#t-hands").checked = db.settings.handsFree;
  applyToggles();
  show("talk");
  renderChat();
  const last = lastTutor(s);
  setCaption(last ? last.reply : null);
  setAvatar("idle", "Your speaking partner");
  setStatus("Tap the mic to answer in Chinese — or EN if you're stuck", "");
}

async function sendLearner(text, via) {
  const s = db.session;
  if (!s || busy) return;
  s.items.push({ kind: "me", text, via });
  save();
  renderChat();
  await tutorTurn({ role: "user", content: `[${via}] ${text}` }, TURN_SCHEMA, false);
}

async function tutorTurn(userMsg, schema, isStart) {
  const s = db.session;
  const topic = topicById(s.topicId);
  setBusy(true);
  setStatus("Thinking…", "");
  setAvatar("thinking");
  const thinking = el("div", "msg tutor");
  thinking.append(el("div", "who", topic.zh), el("div", "bubble thinking", "…"));
  chat.append(thinking);
  thinking.scrollIntoView({ behavior: "smooth", block: "end" });

  // Keep the start turn plus the latest exchanges so long chats stay fast and cheap.
  const history = s.api.length > 30 ? [...s.api.slice(0, 2), ...s.api.slice(-26)] : s.api;
  try {
    const { data, raw } = await askAI(isStart ? "start" : "turn", {
      topic,
      level: s.level,
      messages: [...history, userMsg],
    });
    s.api.push(userMsg, { role: "assistant", content: raw });
    if (isStart) {
      s.items.push({ kind: "intro", goal: data.goal_en, phrases: data.key_phrases || [] });
    } else {
      const me = [...s.items].reverse().find((i) => i.kind === "me");
      if (me) me.feedback = data.feedback;
    }
    const help = (data.help_en || "").trim();
    s.items.push({ kind: "tutor", help, reply: data.reply, suggestions: (data.suggestions || []).slice(0, 3) });
    if (data.lesson_done) s.done = true;
    save();
    thinking.remove();
    renderChat();
    chat.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "start" });
    setBusy(false);
    setAvatar("idle", s.done ? "再见！Great job today" : undefined);
    setStatus(s.done ? "Lesson complete! Tap Finish for your summary."
      : help ? "Now try saying it in Chinese — tap the mic" : "Your turn — tap the mic", "");
    setCaption(data.reply);
    if (db.settings.autoSpeak) {
      mic.classList.add("speaking");
      if (help) {
        setCaption({ help });
        await speak(help, 1, "en-US");
        setCaption(data.reply);
      }
      if (!$("#talk").hidden) await speak(data.reply.zh);
      mic.classList.remove("speaking");
    }
    if (db.settings.handsFree && !s.done && !$("#talk").hidden) listen("zh-CN");
  } catch (e) {
    console.error(e);
    thinking.remove();
    if (!isStart) {
      // Put the learner's words back so they can retry.
      const idx = s.items.map((i) => i.kind).lastIndexOf("me");
      if (idx > -1 && !s.items[idx].feedback) {
        $("#type-input").value = s.items[idx].text;
        s.items.splice(idx, 1);
        save();
        renderChat();
      }
    }
    setBusy(false);
    setAvatar("idle", "Hmm, something went wrong");
    setStatus(errorMessage(e), "err");
    showErrorDetails(e);
    if (isStart) {
      const retry = el("button", "btn primary", "Try again");
      retry.onclick = () => { retry.remove(); switchBtn?.remove(); tutorTurn(userMsg, schema, true); };
      chat.append(retry);
      let switchBtn = null;
      if (db.settings.brain === "local") {
        switchBtn = el("button", "btn ghost", "Use Google's free AI instead");
        switchBtn.onclick = () => { db.settings.brain = "gemini"; save(); goHome(); };
        chat.append(switchBtn);
      }
    }
  }
}

function renderChat() {
  const s = db.session;
  chat.textContent = "";
  if (!s) return;
  const topic = topicById(s.topicId);
  for (const item of s.items) {
    if (item.kind === "intro") {
      const box = el("div", "goal");
      box.append(el("div", "label", "Today's goal"), el("p", "", item.goal));
      if (item.phrases.length) {
        box.append(el("div", "label", "Key phrases"));
        const list = el("div", "phrases");
        item.phrases.forEach((p) => {
          const b = el("button", "sbtn"); b.type = "button";
          b.append(lineBlock(p, { audio: false }));
          b.onclick = () => speak(p.zh);
          list.append(b);
        });
        box.append(list);
      }
      chat.append(box);
    } else if (item.kind === "tutor") {
      const w = el("div", "msg tutor");
      w.append(el("div", "who", `Lìlì · ${topic.zh}`));
      const b = el("div", "bubble");
      if (item.help) {
        const h = el("div", "help");
        h.append(el("div", "label", "Lìlì helps"), el("div", "", item.help));
        b.append(h);
      }
      b.append(lineBlock(item.reply));
      if (item.suggestions?.length && item === lastTutor(s)) {
        const sg = el("div", "sugg");
        sg.append(el("div", "label", "You could say · tap to hear"));
        item.suggestions.forEach((x) => {
          const btn = el("button", "sbtn"); btn.type = "button";
          btn.append(lineBlock(x, { audio: false }));
          btn.onclick = () => speak(x.zh, Math.max(0.5, db.settings.rate - 0.15));
          sg.append(btn);
        });
        b.append(sg);
      }
      w.append(b);
      chat.append(w);
    } else if (item.kind === "me") {
      const w = el("div", "msg me");
      w.append(el("div", "who", "You"));
      w.append(el("div", "bubble", item.text));
      w.append(el("div", "via", { spoken: "spoken", "spoken-en": "said in English", typed: "typed" }[item.via] || ""));
      const f = item.feedback;
      if (f) {
        const kind = f.verdict === "great" ? "great" : f.verdict === "small fix" ? "fix" : "try";
        const card = el("div", "fb " + kind);
        card.append(el("div", "tag", { great: "Natural — nice!", fix: "Small fix", try: "Say it like this" }[kind]));
        if (kind !== "great" && f.better_zh) card.append(lineBlock({ zh: f.better_zh, pinyin: f.better_pinyin }));
        if (f.note_en) card.append(el("div", "note", f.note_en));
        if (f.pronunciation_tip) {
          const p = el("div", "pron");
          p.append(el("b", "", "Pronunciation: "), document.createTextNode(f.pronunciation_tip));
          card.append(p);
        }
        w.append(card);
      }
      chat.append(w);
    }
  }
  if (s.done) {
    const d = el("div", "done-card");
    d.append(el("div", "", "That's the end of this conversation. 很好！"));
    const b = el("button", "btn primary", "See my summary");
    b.onclick = finish;
    d.append(b);
    chat.append(d);
  }
}
const lastTutor = (s) => [...s.items].reverse().find((i) => i.kind === "tutor");

async function finish() {
  const s = db.session;
  if (!s || busy) return;
  stopListening();
  speechSynthesis?.cancel();
  const spoken = s.items.filter((i) => i.kind === "me");
  const topic = topicById(s.topicId);
  if (!spoken.length) {
    db.session = null; save(); goHome();
    return;
  }
  markPracticed(0);
  show("summary");
  const body = $("#summary-body");
  body.textContent = "";
  body.append(el("div", "card thinking", "Putting together your summary…"));

  const transcript = s.items
    .filter((i) => i.kind === "me" || i.kind === "tutor")
    .map((i) => (i.kind === "me" ? `Learner (${i.via}): ${i.text}` : `Tutor: ${i.reply.zh}`))
    .join("\n");
  const entry = { date: dayKey(), topicId: s.topicId, turns: spoken.length, summary: null };
  try {
    const { data } = await askAI("summary", { topic, level: s.level, transcript });
    entry.summary = data;
  } catch (e) {
    console.error(e);
    body.textContent = "";
    const c = el("div", "card");
    c.append(el("p", "", errorMessage(e)), el("div", "details", errorDetails(e)));
    const retry = el("button", "btn primary", "Try again");
    retry.onclick = finish;
    const skip = el("button", "btn ghost", "Skip summary");
    skip.onclick = () => { db.history.unshift(entry); db.session = null; save(); goHome(); };
    const row = el("div", "row"); row.append(retry, skip);
    c.append(row);
    body.append(c);
    return;
  }
  db.history.unshift(entry);
  db.history = db.history.slice(0, 60);
  db.session = null;
  save();
  renderSummary(entry);
}

function renderSummary(entry) {
  const body = $("#summary-body");
  body.textContent = "";
  const topic = topicById(entry.topicId);
  const d = entry.summary;
  show("summary");

  const score = el("section", "card score");
  const n = Math.max(1, Math.min(5, Number(d.stars) || 3));
  score.append(el("div", "stars", "★".repeat(n) + "☆".repeat(5 - n)));
  score.append(el("h2", "", `${topic.en} · ${topic.zh}`));
  score.append(el("p", "muted", d.praise_en));
  const n1 = entry.turns, n2 = streak();
  score.append(el("div", "muted small", `${n1} ${n1 === 1 ? "thing" : "things"} said · ${n2} day${n2 === 1 ? "" : "s"} streak`));
  body.append(score);

  if (d.fixes?.length) {
    const c = el("section", "card");
    c.append(el("div", "eyebrow", "Worth practising"));
    d.fixes.forEach((f) => {
      const it = el("div", "fix-item");
      it.append(el("div", "said", f.you_said));
      it.append(lineBlock({ zh: f.better_zh, pinyin: f.better_pinyin }));
      it.append(el("div", "small", f.note_en));
      c.append(it);
    });
    body.append(c);
  }
  if (d.new_words?.length) {
    const c = el("section", "card");
    c.append(el("div", "eyebrow", "Words from this lesson · tap to hear"));
    const g = el("div", "words");
    d.new_words.forEach((w) => {
      const b = el("button", "word"); b.type = "button";
      b.append(lineBlock(w, { audio: false }));
      b.onclick = () => speak(w.zh, Math.max(0.5, db.settings.rate - 0.2));
      g.append(b);
    });
    c.append(g);
    body.append(c);
  }
  if (d.next_time_en) {
    const c = el("section", "card today");
    c.append(el("div", "eyebrow", "Next time"), el("p", "", d.next_time_en));
    body.append(c);
  }
  const done = el("button", "btn primary big", "Back to home");
  done.onclick = goHome;
  body.append(done);
}

// ---------------------------------------------------------------- home
function renderHome() {
  $("#key-card").hidden = !needsKey();
  const claude = db.settings.brain === "claude";
  $("#gkey-help").hidden = claude;
  $("#ckey-help").hidden = !claude;
  $("#key-input").placeholder = claude ? "sk-ant-…" : "AIza…";
  const hour = new Date().getHours();
  $("#greeting").textContent = hour < 11 ? "早上好 · Good morning" : hour < 18 ? "下午好 · Good afternoon" : "晚上好 · Good evening";

  const n = streak();
  $("#streak-num").textContent = n;
  $("#streak-label").textContent = n === 1 ? "day streak" : "days streak";

  const week = $("#week");
  week.textContent = "";
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const names = ["一", "二", "三", "四", "五", "六", "日"];
  let mins = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const k = dayKey(d);
    mins += db.minutes[k] || 0;
    const cell = el("div", "day" + (db.days.includes(k) ? " done" : "") + (k === dayKey() ? " today" : ""));
    cell.append(el("b", "", names[i]), el("span", "", String(d.getDate())));
    week.append(cell);
  }
  $("#week-minutes").textContent = `${Math.round(mins)} min spoken this week`;

  const t = todaysTopic();
  $("#today-zh").textContent = t.zh;
  $("#today-title").textContent = t.en;
  $("#today-brief").textContent = `Role-play with ${t.role}. About 5 minutes.`;
  $("#resume").hidden = !(db.session && db.session.items.length);

  renderTopics();
  $("#home-level").value = db.settings.level;

  const hist = $("#history");
  hist.textContent = "";
  const recent = db.history.slice(0, 8);
  $("#history-wrap").hidden = !recent.length;
  recent.forEach((h) => {
    const tp = topicById(h.topicId);
    const b = el("button", "hist"); b.type = "button";
    const left = el("div");
    left.append(el("div", "", tp.en), el("div", "muted small", `${h.date} · ${tp.zh}`));
    const n2 = Math.max(0, Math.min(5, Number(h.summary?.stars) || 0));
    b.append(left, el("span", "stars", n2 ? "★".repeat(n2) : ""));
    b.onclick = () => h.summary && renderSummary(h);
    hist.append(b);
  });
}

let currentCat = "all";
function renderTopics() {
  const cats = $("#cats");
  cats.textContent = "";
  CATEGORIES.forEach((c) => {
    const b = el("button", "cat"); b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(c.id === currentCat));
    b.append(el("span", "", c.en), el("span", "zh", c.zh));
    b.onclick = () => { currentCat = c.id; renderTopics(); };
    cats.append(b);
  });
  const grid = $("#topics");
  grid.textContent = "";
  TOPICS.filter((tp) => currentCat === "all" || tp.cat === currentCat).forEach((tp) => {
    const b = el("button", "topic"); b.type = "button";
    if (currentCat === "all" && tp.cat === "business") b.append(el("span", "tag", "Business"));
    b.append(el("span", "zh", tp.zh), el("span", "en", tp.en));
    b.onclick = () => begin(tp.id);
    grid.append(b);
  });
}

function begin(topicId) {
  if (needsKey()) {
    $("#key-card").hidden = false;
    $("#key-card").scrollIntoView({ behavior: "smooth" });
    $("#key-input").focus();
    return;
  }
  startSession(topicId);
}

function goHome() {
  stopListening();
  speechSynthesis?.cancel();
  show("home");
  renderHome();
  window.scrollTo(0, 0);
}

function show(view) {
  for (const v of ["home", "talk", "summary"]) $("#" + v).hidden = v !== view;
}

// ---------------------------------------------------------------- settings
function fillVoiceSelect() {
  const sel = $("#s-voice");
  sel.textContent = "";
  if (!voices.length) {
    sel.append(el("option", "", "No Chinese voice found"));
    sel.disabled = true;
    $("#s-voice-note").textContent = "Install a Chinese (Mandarin) voice in your phone's text-to-speech settings, e.g. Google Speech Services → Install voice data → 中文.";
    return;
  }
  sel.disabled = false;
  $("#s-voice-note").textContent = "";
  voices.forEach((v) => {
    const o = el("option", "", `${v.name} (${v.lang})`);
    o.value = v.voiceURI;
    sel.append(o);
  });
  sel.value = currentVoice()?.voiceURI || "";
}
function openSettings() {
  const s = db.settings;
  $("#s-key").value = s.apiKey;
  $("#s-gkey").value = s.geminiKey || "";
  $("#s-model").value = s.brain === "claude" ? s.model : s.brain === "gemini" ? "gemini" : `local-${s.localSize || "standard"}`;
  syncBrainField();
  $("#s-level").value = s.level;
  $("#s-rate").value = s.rate;
  $("#s-rate-val").textContent = `${Number(s.rate).toFixed(2)}×`;
  $("#s-auto").checked = s.autoSpeak;
  loadVoices();
  fillVoiceSelect();
  $("#settings").showModal();
}
$("#s-rate").addEventListener("input", (e) => ($("#s-rate-val").textContent = `${Number(e.target.value).toFixed(2)}×`));
$("#s-test").addEventListener("click", () => {
  db.settings.voice = $("#s-voice").value;
  speak("你好！我们一起练习说中文吧。", Number($("#s-rate").value));
});
$("#settings-form").addEventListener("submit", () => {
  const s = db.settings;
  s.apiKey = $("#s-key").value.trim();
  s.geminiKey = $("#s-gkey").value.trim();
  const choice = $("#s-model").value;
  if (choice === "gemini") {
    s.brain = "gemini";
  } else if (choice.startsWith("local-")) {
    s.brain = "local";
    s.localSize = choice.slice(6);
  } else {
    s.brain = "claude";
    s.model = choice;
  }
  s.level = $("#s-level").value;
  s.rate = Number($("#s-rate").value);
  s.autoSpeak = $("#s-auto").checked;
  if (!$("#s-voice").disabled) s.voice = $("#s-voice").value;
  save();
  renderHome();
});
$("#open-settings").onclick = openSettings;
function syncBrainField() {
  const v = $("#s-model").value;
  const local = v.startsWith("local-");
  const gemini = v === "gemini";
  $("#s-key-field").hidden = local || gemini;
  $("#s-gkey-field").hidden = !gemini;
  $("#s-brain-note").textContent = gemini
    ? "Free with a Google account. Fast and works on any phone."
    : local
      ? "Experimental: downloads once, but crashes on many phones."
      : "Claude is the smartest, but needs an Anthropic API key and you pay per use.";
}
$("#s-model").addEventListener("change", syncBrainField);

$("#key-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const k = $("#key-input").value.trim();
  if (!k) return;
  if (db.settings.brain === "claude") db.settings.apiKey = k;
  else { db.settings.brain = "gemini"; db.settings.geminiKey = k; }
  $("#key-input").value = "";
  save();
  renderHome();
});
$("#home-level").onchange = (e) => { db.settings.level = e.target.value; save(); };

// ---------------------------------------------------------------- talk controls
function applyToggles() {
  db.settings.showPy = $("#t-py").checked;
  db.settings.showEn = $("#t-en").checked;
  db.settings.handsFree = $("#t-hands").checked;
  document.body.classList.toggle("hide-py", !db.settings.showPy);
  document.body.classList.toggle("hide-en", !db.settings.showEn);
  save();
}
["#t-py", "#t-en", "#t-hands"].forEach((s) => $(s).addEventListener("change", applyToggles));

mic.onclick = () => (listening ? stopListening() : listen("zh-CN"));
$("#mic-en").onclick = () => (listening ? stopListening() : listen("en-US"));
$("#kbd").onclick = () => {
  const f = $("#type-form");
  f.hidden = !f.hidden;
  $("#kbd").classList.toggle("on", !f.hidden);
  if (!f.hidden) $("#type-input").focus();
};
$("#type-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = $("#type-input").value.trim();
  if (!t || busy) return;
  $("#type-input").value = "";
  sendLearner(t, "typed");
});
$("#finish").onclick = finish;
$("#talk-back").onclick = goHome;
$("#summary-back").onclick = goHome;
$("#start-today").onclick = () => begin(todaysTopic().id);
$("#resume").onclick = () => openTalk();

// ---------------------------------------------------------------- home Lìlì
const GREETINGS = [
  { zh: "你好！我是丽丽。我们一起说中文吧！", pinyin: "Nǐ hǎo! Wǒ shì Lì lì. Wǒ men yī qǐ shuō zhōng wén ba!", en: "Hi! I'm Lìlì. Let's speak Chinese together!" },
  { zh: "今天你想练习什么？", pinyin: "Jīn tiān nǐ xiǎng liàn xí shén me?", en: "What would you like to practise today?" },
  { zh: "别担心，说错了也没关系。", pinyin: "Bié dān xīn, shuō cuò le yě méi guān xi.", en: "Don't worry, it's fine to make mistakes." },
  { zh: "加油！每天说一点。", pinyin: "Jiā yóu! Měi tiān shuō yī diǎn.", en: "You can do it! Speak a little every day." },
];
let greetIdx = 0;
async function greet() {
  const g = GREETINGS[greetIdx++ % GREETINGS.length];
  $("#hero-zh").textContent = g.zh;
  $("#hero-py").textContent = g.pinyin;
  $("#hero-en").textContent = g.en;
  await speak(g.zh);
}
// Tap Lìlì (or "Talk to Lìlì") and a free conversation starts right away, hands-free.
function talkToLili() {
  if (needsKey()) {
    greet();
    $("#hero-en").textContent = "To talk with me, connect me to Google's free AI below first. It takes a minute.";
    $("#key-card").hidden = false;
    $("#key-card").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  startSession("free");
}
$("#hero-lili").onclick = talkToLili;
$("#hero-talk").onclick = talkToLili;

// ---------------------------------------------------------------- install on phone
// When the app runs on this PC (localhost), the phone reaches it over Wi-Fi at this address.
const LAN_URL = "http://192.168.0.49:8123/";
let installPrompt = null;
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isPhone = () => matchMedia("(pointer: coarse)").matches && innerWidth < 900;

function renderInstall() {
  const card = $("#install-card");
  let hiddenByUser = false;
  try { hiddenByUser = localStorage.getItem("shuoba:hideInstall") === "1"; } catch { /* ignore */ }
  if (isStandalone() || hiddenByUser) { card.hidden = true; return; }

  if (isPhone()) {
    $("#qr").textContent = "";
    $("#install-title").textContent = "Install Shuō ba on this phone";
    $("#install-help").innerHTML = installPrompt
      ? "Add Lìlì to your home screen so she opens like a normal app."
      : "In Chrome, tap <b>⋮ → Add to Home screen → Install</b>.";
    $("#install-btn").hidden = !installPrompt;
    $("#install-url").textContent = "";
    card.hidden = false;
    return;
  }

  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const url = local ? LAN_URL : location.origin + location.pathname;
  $("#install-url").textContent = url;
  $("#install-btn").hidden = true;
  $("#install-help").innerHTML = local
    ? "Phone on the same Wi-Fi as this PC: scan with the camera and open in Chrome. For the microphone to work over Wi-Fi, see “Test on your phone” in the README."
    : "Scan with your phone camera, open the link in Chrome, then tap <b>⋮ → Add to Home screen</b>.";
  const qrBox = $("#qr");
  qrBox.textContent = "";
  if (window.qrcode) {
    const qr = window.qrcode(0, "M");
    qr.addData(url);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  card.hidden = false;
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  renderInstall();
});
window.addEventListener("appinstalled", () => { installPrompt = null; $("#install-card").hidden = true; });
$("#install-btn").onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  renderInstall();
};
$("#install-close").onclick = () => {
  try { localStorage.setItem("shuoba:hideInstall", "1"); } catch { /* ignore */ }
  $("#install-card").hidden = true;
};

$("#s-install").onclick = () => {
  try { localStorage.removeItem("shuoba:hideInstall"); } catch { /* ignore */ }
  $("#settings").close();
  goHome();
  renderInstall();
  $("#install-card").scrollIntoView({ behavior: "smooth" });
};

// ---------------------------------------------------------------- boot
renderInstall();
document.body.classList.toggle("hide-py", !db.settings.showPy);
document.body.classList.toggle("hide-en", !db.settings.showEn);
renderHome();
if (!Recognition) setStatus("This browser can't listen. Use Chrome on Android, or tap Type.", "err");
if ("serviceWorker" in navigator) {
  // When an update arrives, reload once so the fix is used right away (not only on the next start).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded || !$("#talk").hidden) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
}
