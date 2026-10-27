// Service worker do Ora Finance: deixa o app abrir rápido e continuar instalável.
// Os dados (Firestore, login e IA) nunca passam por aqui: ficam sempre online.
const CACHE = "ora-v3";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/logo.png", "/favicon.png"])).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/__/")) return;

  // Arquivos do app com nome único (/assets/...): cache primeiro
  if (u.pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(r).then((hit) => hit || fetch(r).then((res) => {
      if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); }
      return res;
    })));
    return;
  }

  // Página e imagens: rede primeiro (sempre a versão nova), cache só se estiver sem internet
  e.respondWith(fetch(r, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r.mode === "navigate" ? "/" : r, cp)); }
    return res;
  }).catch(() => caches.match(r.mode === "navigate" ? "/" : r)));
});
