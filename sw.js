// Caches the app shell so Shuō ba opens instantly and installs as an app.
// API calls to Anthropic are never cached. The free AI's model files live in WebLLM's own caches, which we never delete.
const CACHE = "shuoba-v12";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "local-ai.js",
  "gemini.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("shuoba-") && k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network first for our own files (so updates show up), falling back to the cache offline.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // "no-cache" asks GitHub whether the file changed (instead of trusting the browser's copy for
  // up to 10 minutes), so a fix reaches the phone the next time the app is opened.
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
