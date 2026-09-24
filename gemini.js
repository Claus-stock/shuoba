// Free cloud option: Google's Gemini API on its free tier.
// Needs a free key from Google AI Studio (a Google account, no payment). The key stays on the phone
// and is sent only to Google, in a request header (never in the URL).

const API = "https://generativelanguage.googleapis.com/v1beta";
// Used only if Google's model list can't be read: newest first.
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"];
const RETRY_DELAYS = [1500, 4000]; // after a busy/overloaded answer, wait and try the same model again

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// onModel(name): remember the model that worked. onBusy(text): tell the user we're retrying.
export async function askGemini({ key, model, system, messages, maxTokens = 1024, onModel, onBusy }) {
  if (!key) throw { code: "no_gkey" };
  let lastErr = null;
  // Try the remembered model first. Only if it fails, ask Google which Flash models this key can
  // use (newest first, Flash-Lite last) and work down that list.
  const tried = new Set();
  let queue = model ? [model] : [];
  let listed = false;

  while (true) {
    if (!queue.length) {
      if (listed) break;
      listed = true;
      const all = await flashModels(key);
      queue = (all.length ? all : FALLBACK_MODELS).filter((x) => !tried.has(x));
      if (!queue.length) break;
    }
    const m = queue.shift();
    tried.add(m);
    // Only the first model gets repeated tries; after that, move quickly down the list.
    const delays = tried.size === 1 ? RETRY_DELAYS : [];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const res = await call(key, m, system, messages, maxTokens);
        if (m !== model) onModel?.(m);
        return res;
      } catch (e) {
        lastErr = { ...e, model: m };
        if (isModelGone(e)) break; // this model is retired or not on this key: try the next one
        if (!isBusy(e)) throw lastErr; // a real error (bad key, blocked, …): stop here
        if (attempt < delays.length) {
          onBusy?.("Google is busy — trying again…");
          await sleep(delays[attempt]);
        } else {
          onBusy?.("Google is busy — trying another model…");
        }
      }
    }
  }
  throw lastErr || { code: "gemini_http", status: 404, message: "No available Gemini model found." };
}

// 503 overloaded, 500/504 server hiccups and 429 per-model rate limits are all worth retrying.
const isBusy = (e) => e?.code === "gemini_http" && [429, 500, 502, 503, 504].includes(e.status);
const isModelGone = (e) =>
  e?.code === "gemini_http" && (e.status === 404 || /no longer available|not found|deprecated|retired/i.test(e.message || ""));

async function flashModels(key) {
  try {
    const r = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) return [];
    const { models = [] } = await r.json();
    const version = (n) => parseFloat((n.match(/^gemini-([\d.]+)-flash/) || [])[1] || "0");
    const names = models
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));
    const flash = names.filter((n) => /^gemini-[\d.]+-flash(-\d{3})?$/.test(n)).sort((a, b) => version(b) - version(a));
    const lite = names.filter((n) => /^gemini-[\d.]+-flash-lite(-\d{3})?$/.test(n)).sort((a, b) => version(b) - version(a));
    return [...flash, ...lite];
  } catch {
    return [];
  }
}

// How much the model may think before answering: as little as the model allows (a conversation
// needs speed). If a model rejects a level, try the next one, and finally no setting at all.
const THINKING_LEVELS = ["minimal", "low", null];

async function call(key, model, system, messages, maxTokens, level = 0) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: maxTokens },
  };
  const thinking = THINKING_LEVELS[level];
  if (thinking) {
    if (/^gemini-2\.5-flash/.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (/^gemini-[3-9]/.test(model)) body.generationConfig.thinkingConfig = { thinkingLevel: thinking };
  }

  let r;
  try {
    r = await fetch(`${API}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
  } catch {
    throw { code: "gemini_offline" };
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const err = { code: "gemini_http", status: r.status, message: j.error?.message || r.statusText };
    // If this model doesn't accept the thinking setting, try the next level.
    if (r.status === 400 && /thinking/i.test(err.message) && body.generationConfig.thinkingConfig) {
      return call(key, model, system, messages, maxTokens, level + 1);
    }
    throw err;
  }
  const j = await r.json();
  if (j.promptFeedback?.blockReason) throw { code: "refusal" };
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (cand?.finishReason === "MAX_TOKENS" && !text.trim().endsWith("}")) throw { code: "too_long" };
  const data = parseJson(text);
  if (!data) throw { code: "bad_json", message: text.slice(0, 120) };
  return { data, raw: text };
}

function parseJson(text) {
  const t = String(text).replace(/```(?:json)?/gi, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}
