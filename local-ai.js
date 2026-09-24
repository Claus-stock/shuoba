// Free mode: Bīng's brain runs on the phone itself.
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
export const localStats = () => engine?.runtimeStatsText?.();

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

// Ask the model for one JSON object shaped like `example`.
// We don't use WebLLM's grammar-constrained JSON mode: on some phones it fails with
// "Object has already been disposed". Plain generation plus tolerant parsing is sturdier.
export async function localChat({ system, messages, example, maxTokens = 400 }) {
  if (!engine) throw { code: "not_loaded" };
  const res = await engine.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `${system}

Answer with ONLY one JSON object, no other text. Fill in this exact JSON structure, replacing every <...> with your own content. Keep it short:
${JSON.stringify(example)}`,
      },
      ...messages,
    ],
    temperature: 0.6,
    max_tokens: maxTokens,
  });
  const text = res.choices?.[0]?.message?.content || "";
  const u = res.usage;
  if (u) console.info(`Free AI: ${u.prompt_tokens} in, ${u.completion_tokens} out, prefill ${u.extra?.prefill_tokens_per_s?.toFixed?.(1)} tok/s, decode ${u.extra?.decode_tokens_per_s?.toFixed?.(1)} tok/s`);
  const data = parseJson(text);
  if (!data) throw { code: "bad_json", message: text.slice(0, 120) };
  // Keep the exact text: sending it back unchanged next turn lets WebLLM reuse its memory (KV cache)
  // of the conversation, so it only has to read the new message.
  return { data, raw: text };
}

function parseJson(text) {
  const t = text.replace(/```(?:json)?/gi, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

// After a GPU error the engine can't be reused: throw it away so the next call loads a fresh one.
export async function resetLocal() {
  const e = engine;
  engine = null;
  engineId = null;
  if (e) await e.unload().catch(() => {});
}
export const isEngineBroken = (e) => /disposed|device|lost|GPU|mapAsync|Instance reference|out of memory|OOM/i.test(String(e?.message || e));

// Pinyin for each character of a Chinese string, e.g. "一杯" → ["yī", "bēi"] (tone changes like 一 → yì applied).
export async function pinyinArray(zh) {
  if (!pinyinFn) pinyinFn = (await import(PINYIN)).pinyin;
  return pinyinFn(zh, { toneType: "symbol", type: "array" });
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
