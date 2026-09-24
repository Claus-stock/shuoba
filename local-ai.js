// Free mode: Lìlì's brain runs on the phone itself.
// A small Chinese model (Qwen2.5) runs in Chrome with WebGPU via WebLLM. No account, no key, no cost.
// The model is downloaded once and kept in the browser's cache, so later sessions start quickly and work offline.
// Pinyin comes from pinyin-pro (a dictionary), which is more reliable than a small model's pinyin.

const WEBLLM = "https://esm.run/@mlc-ai/web-llm@0.2.85";
const PINYIN = "https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.4/+esm";

export const LOCAL_MODELS = {
  lite: { base: "Qwen2.5-0.5B-Instruct", size: "about 400 MB", label: "Lite" },
  standard: { base: "Qwen2.5-1.5B-Instruct", size: "about 1 GB", label: "Standard" },
  plus: { base: "Qwen2.5-3B-Instruct", size: "about 2 GB", label: "Plus" },
};

let engine = null;
let engineId = null;
let loading = null;
let pinyinFn = null;

async function modelId(size, forceF32) {
  const adapter = navigator.gpu ? await navigator.gpu.requestAdapter().catch(() => null) : null;
  if (!adapter) throw { code: "no_webgpu" };
  // Phones without 16-bit float shaders need the 32-bit build.
  const quant = adapter.features.has("shader-f16") && !forceF32 ? "q4f16_1" : "q4f32_1";
  return `${(LOCAL_MODELS[size] || LOCAL_MODELS.standard).base}-${quant}-MLC`;
}

export const localReady = () => !!engine;

export async function loadLocal(size, onProgress, { forceF32 = false } = {}) {
  const id = await modelId(size, forceF32);
  if (engine && engineId === id) return engine;
  if (loading?.id === id) return loading.promise;
  const promise = (async () => {
    const webllm = await import(WEBLLM);
    if (engine) {
      await engine.unload().catch(() => {});
      engine = null;
    }
    const e = await webllm.CreateMLCEngine(id, {
      initProgressCallback: (r) => onProgress?.(r.progress ?? 0, r.text || ""),
    });
    engine = e;
    engineId = id;
    return e;
  })();
  loading = { id, promise };
  try {
    return await promise;
  } finally {
    loading = null;
  }
}

export async function localChat({ system, messages, schema, maxTokens = 400 }) {
  if (!engine) throw { code: "not_loaded" };
  const req = {
    messages: [{ role: "system", content: system }, ...messages],
    temperature: 0.6,
    max_tokens: maxTokens,
  };
  let res;
  try {
    res = await engine.chat.completions.create({ ...req, response_format: { type: "json_object", schema: JSON.stringify(schema) } });
  } catch (e) {
    // Some builds can't use a strict schema; fall back to plain JSON mode with the shape described in words.
    console.warn("Schema mode failed, retrying with plain JSON", e);
    req.messages[0] = { role: "system", content: `${system}\nJSON shape: ${JSON.stringify(schema)}` };
    res = await engine.chat.completions.create({ ...req, response_format: { type: "json_object" } });
  }
  const text = res.choices?.[0]?.message?.content || "";
  try {
    return { data: JSON.parse(text), raw: text };
  } catch {
    throw { code: "bad_json" };
  }
}

// Fill in pinyin for every Chinese line in a reply: {zh} → pinyin, better_zh → better_pinyin.
export async function addPinyin(obj) {
  if (!pinyinFn) pinyinFn = (await import(PINYIN)).pinyin;
  const py = (zh) => pinyinFn(zh, { toneType: "symbol", nonZh: "consecutive" });
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    if (typeof o.zh === "string") o.pinyin = py(o.zh);
    if (typeof o.better_zh === "string") o.better_pinyin = py(o.better_zh);
    Object.values(o).forEach(walk);
  };
  walk(obj);
  return obj;
}
