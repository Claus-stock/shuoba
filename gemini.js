// Free cloud option: Google's Gemini API on its free tier.
// Needs a free key from Google AI Studio (a Google account, no payment). The key stays on the phone
// and is sent only to Google, in a request header (never in the URL).

const API = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-3.6-flash";

export async function askGemini({ key, model, system, messages, maxTokens = 2048, onModel }) {
  if (!key) throw { code: "no_gkey" };
  let use = model || DEFAULT_MODEL;
  const tried = new Set();
  // Google retires model names now and then. When a model is gone, switch to the one Google
  // names in its error message, else the newest Flash model on the account, else the Flash alias.
  for (let i = 0; i < 4; i++) {
    tried.add(use);
    try {
      const res = await call(key, use, system, messages, maxTokens);
      if (use !== model) onModel?.(use);
      return res;
    } catch (e) {
      if (!isModelGone(e)) throw e;
      const next = [suggested(e.message), await newestFlash(key), "gemini-flash-latest"].find((m) => m && !tried.has(m));
      if (!next) throw e;
      console.warn(`Gemini model ${use} unavailable, switching to ${next}`);
      use = next;
    }
  }
  throw { code: "gemini_http", status: 404, message: "No available Gemini model found." };
}

const isModelGone = (e) =>
  e?.code === "gemini_http" && (e.status === 404 || /no longer available|not found|deprecated|retired/i.test(e.message || ""));

// "…Please update your code to use models/gemini-3.6-flash for…" → "gemini-3.6-flash"
const suggested = (msg) => (String(msg || "").match(/use models\/(gemini-[\w.-]+)/i) || [])[1] || null;

async function call(key, model, system, messages, maxTokens, withThinking = true) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: maxTokens },
  };
  // Flash models think before answering; a conversation feels better with as little wait as possible.
  if (withThinking) {
    if (/^gemini-2\.5-flash/.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (/^gemini-[3-9]/.test(model)) body.generationConfig.thinkingConfig = { thinkingLevel: "low" };
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
    // If this model doesn't accept the thinking setting, ask again without it.
    if (withThinking && r.status === 400 && /thinking/i.test(err.message) && body.generationConfig.thinkingConfig) {
      return call(key, model, system, messages, maxTokens, false);
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

// The newest plain "gemini-X.Y-flash" model this key can use (no lite/preview/image/audio variants).
async function newestFlash(key) {
  try {
    const r = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) return null;
    const { models = [] } = await r.json();
    const version = (n) => parseFloat((n.match(/^gemini-([\d.]+)-flash/) || [])[1] || "0");
    const names = models
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /^gemini-[\d.]+-flash(-\d{3})?$/.test(n));
    names.sort((a, b) => version(b) - version(a));
    return names[0] || null;
  } catch {
    return null;
  }
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
