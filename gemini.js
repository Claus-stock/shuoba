// Free cloud option: Google's Gemini API on its free tier.
// Needs a free key from Google AI Studio (a Google account, no payment). The key stays on the phone
// and is sent only to Google, in a request header (never in the URL).

const API = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

export async function askGemini({ key, model, system, messages, maxTokens = 2048, onModel }) {
  if (!key) throw { code: "no_gkey" };
  const use = model || DEFAULT_MODEL;
  try {
    return await call(key, use, system, messages, maxTokens);
  } catch (e) {
    // Google retires model names from time to time: pick the current Flash model and try again.
    if (e?.status !== 404) throw e;
    const next = await pickFlashModel(key);
    if (!next || next === use) throw e;
    onModel?.(next);
    return call(key, next, system, messages, maxTokens);
  }
}

async function call(key, model, system, messages, maxTokens) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: maxTokens },
  };
  // Gemini 2.5 Flash thinks before answering by default; a conversation feels better without the wait.
  if (/^gemini-2\.5-flash/.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };

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
    throw { code: "gemini_http", status: r.status, message: j.error?.message || r.statusText };
  }
  const j = await r.json();
  if (j.promptFeedback?.blockReason) throw { code: "refusal" };
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("");
  if (cand?.finishReason === "MAX_TOKENS") throw { code: "too_long" };
  const data = parseJson(text);
  if (!data) throw { code: "bad_json", message: text.slice(0, 120) };
  return { data, raw: text };
}

async function pickFlashModel(key) {
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    if (!r.ok) return null;
    const { models = [] } = await r.json();
    const names = models
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => /^gemini-[\d.]+-flash$/.test(n) || /^gemini-flash-latest$/.test(n));
    names.sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]));
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
