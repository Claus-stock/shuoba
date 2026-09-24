// Free cloud option: Google's Gemini API on its free tier.
// Needs a free key from Google AI Studio (a Google account, no payment). The key stays on the phone
// and is sent only to Google, in a request header (never in the URL).

const API = "https://generativelanguage.googleapis.com/v1beta";
// Used only if Google's model list can't be read: newest first.
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"];
const RETRY_DELAYS = [1500, 4000]; // after a busy/overloaded answer, wait and try the same model again
// How much the model may think before answering: as little as the model allows (a conversation
// needs speed). If a model rejects a level, the next one is tried; what worked is remembered.
const THINKING_LEVELS = ["minimal", "low", null];
const thinkingFor = new Map();
// Models Google has told us are gone (kept on the phone), so they are never tried again.
const GONE_KEY = "shuoba:goneModels";
let goneModels = new Set();
try { goneModels = new Set(JSON.parse(localStorage.getItem(GONE_KEY) || "[]")); } catch { /* ignore */ }
function markGone(m) {
  goneModels.add(m);
  try { localStorage.setItem(GONE_KEY, JSON.stringify([...goneModels])); } catch { /* ignore */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One JSON answer. onModel(name): remember the model that worked. onBusy(text): tell the user we're retrying.
export function askGemini({ key, model, system, messages, maxTokens = 1024, onModel, onBusy, onAttemptError }) {
  return withModels({ key, model, onModel, onBusy, onAttemptError }, (m) => call(key, m, system, messages, maxTokens));
}

// A streamed plain-text answer: onDelta(text) gets each piece as soon as Google sends it, so speaking
// can start before the whole answer exists. Resolves with the full text.
// search: let the model look things up with Google Search (current news, results, facts).
export function streamGemini({ key, model, system, messages, maxTokens = 1024, onModel, onBusy, onDelta, onAttemptError, search = false }) {
  return withModels({ key, model, onModel, onBusy, onAttemptError }, (m) => streamCall(key, m, system, messages, maxTokens, onDelta, undefined, search, onAttemptError));
}

// Try the remembered model first. If it is busy, retry with a pause; if it is gone or stays busy,
// ask Google which Flash models this key can use (newest first, Flash-Lite last) and work down the list.
async function withModels({ key, model, onModel, onBusy, onAttemptError }, attempt) {
  if (!key) throw { code: "no_gkey" };
  let lastErr = null;
  let realErr = null; // the most useful error: a "model is gone" error says little about what went wrong
  const tried = new Set();
  let queue = model && !goneModels.has(model) ? [model] : [];
  let listed = false;

  while (true) {
    if (!queue.length) {
      if (listed) break;
      listed = true;
      const all = await flashModels(key);
      queue = (all.length ? all : FALLBACK_MODELS).filter((x) => !tried.has(x) && !goneModels.has(x));
      if (!queue.length) break;
    }
    const m = queue.shift();
    tried.add(m);
    // Only the first model gets repeated tries; after that, move quickly down the list.
    const delays = tried.size === 1 ? RETRY_DELAYS : [];
    for (let i = 0; i <= delays.length; i++) {
      try {
        const res = await attempt(m);
        if (m !== model) onModel?.(m);
        return res;
      } catch (e) {
        lastErr = { ...e, model: m };
        onAttemptError?.(lastErr);
        if (e?.started) throw lastErr; // part of the answer was already used: don't start over
        if (isModelGone(e)) { markGone(m); break; } // retired or not on this key: next model
        realErr = lastErr;
        if (!isBusy(e)) throw lastErr; // a real error (bad key, blocked, …): stop here
        if (i < delays.length) {
          onBusy?.("Google is busy — trying again…");
          await sleep(delays[i]);
        } else {
          onBusy?.("Google is busy — trying another model…");
        }
      }
    }
  }
  throw realErr || lastErr || { code: "gemini_http", status: 404, message: "No available Gemini model found." };
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

function requestBody(model, system, messages, maxTokens, json, level, search = false) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
  };
  if (json) body.generationConfig.responseMimeType = "application/json";
  if (search) body.tools = [{ google_search: {} }];
  const thinking = THINKING_LEVELS[level];
  if (thinking) {
    if (/^gemini-2\.5-flash/.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else if (/^gemini-[3-9]/.test(model)) body.generationConfig.thinkingConfig = { thinkingLevel: thinking };
  }
  return body;
}

async function post(url, key, body) {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
  } catch {
    throw { code: "gemini_offline" };
  }
}

async function httpError(r) {
  const j = await r.json().catch(() => ({}));
  return { code: "gemini_http", status: r.status, message: j.error?.message || r.statusText };
}
const thinkingRejected = (err, body) => err.status === 400 && /thinking/i.test(err.message) && !!body.generationConfig.thinkingConfig;

async function call(key, model, system, messages, maxTokens, level = thinkingFor.get(model) ?? 0) {
  const body = requestBody(model, system, messages, maxTokens, true, level);
  const r = await post(`${API}/models/${model}:generateContent`, key, body);
  if (!r.ok) {
    const err = await httpError(r);
    if (thinkingRejected(err, body)) return call(key, model, system, messages, maxTokens, level + 1);
    throw err;
  }
  thinkingFor.set(model, level);
  const j = await r.json();
  if (j.promptFeedback?.blockReason) throw { code: "refusal" };
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (cand?.finishReason === "MAX_TOKENS" && !text.trim().endsWith("}")) throw { code: "too_long" };
  const data = parseJson(text);
  if (!data) throw { code: "bad_json", message: text.slice(0, 120) };
  return { data, raw: text };
}

async function streamCall(key, model, system, messages, maxTokens, onDelta, level = thinkingFor.get(model) ?? 0, search = false, onAttemptError) {
  const body = requestBody(model, system, messages, maxTokens, false, level, search);
  const r = await post(`${API}/models/${model}:streamGenerateContent?alt=sse`, key, body);
  if (!r.ok) {
    const err = await httpError(r);
    if (thinkingRejected(err, body)) return streamCall(key, model, system, messages, maxTokens, onDelta, level + 1, search, onAttemptError);
    // Search refused (free search quota used up, not allowed for this model or key): answer
    // without searching rather than not at all.
    if (search && ([400, 403, 429].includes(err.status) || /search|tool|grounding/i.test(err.message))) {
      onAttemptError?.({ ...err, model, note: "retrying without web search" });
      return streamCall(key, model, system, messages, maxTokens, onDelta, level, false, onAttemptError);
    }
    throw err;
  }
  thinkingFor.set(model, level);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let full = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        let j;
        try { j = JSON.parse(line.slice(5)); } catch { continue; }
        if (j.promptFeedback?.blockReason) throw { code: "refusal" };
        const parts = j.candidates?.[0]?.content?.parts || [];
        const t = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");
        if (t) {
          full += t;
          onDelta?.(t);
        }
      }
    }
  } catch (e) {
    throw { ...(e?.code ? e : { code: "gemini_offline" }), started: full.length > 0 };
  }
  if (!full.trim()) throw { code: "bad_json", message: "empty answer" };
  return full;
}

export function parseJson(text) {
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
