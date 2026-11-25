/* StudyAI service worker: app shell, runtime cache, share target and local notifications. */
const VERSION = "v2";
const SHELL = `studyai-shell-${VERSION}`;
const STATIC = `studyai-static-${VERSION}`;
const MATERIALS = `studyai-materials-${VERSION}`;
const SHARED = "studyai-shared-v1";
const SAFE_SHELL_ROUTES = [
  "/",
  "/biblioteca",
  "/estudo",
  "/importar",
  "/organizar",
  "/planejamento",
  "/provas",
  "/aprendizagem",
  "/configuracoes",
  "/tutor",
  "/storage",
];
const SAFE_SHELL_ROUTE_SET = new Set(SAFE_SHELL_ROUTES);
const PRECACHE = [
  "/",
  "/estudo",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable.png",
];
const NO_CACHE_PREFIXES = ["/api/", "/auth", "/sync", "/profile", "/backup", "/share", "/compartilhar"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then(async (cache) => {
    await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("studyai-") && ![SHELL, STATIC, MATERIALS, SHARED].includes(name))
          .map((name) => caches.delete(name)),
      ),
    ),
    self.clients.claim(),
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAR_RUNTIME") event.waitUntil(Promise.all([caches.delete(STATIC), caches.delete(MATERIALS)]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.pathname === "/share-target" && request.method === "POST") {
    event.respondWith(storeSharedFiles(request));
    return;
  }
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    NO_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/offline.html"));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || ["style", "script", "font", "image"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, STATIC));
    return;
  }
  if (["audio", "video"].includes(request.destination) || /\.(pdf|mp3|wav|m4a|mp4|webm|mov)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, MATERIALS));
  }
});

async function storeSharedFiles(request) {
  const data = await request.formData();
  const files = data.getAll("files").filter((item) => item instanceof File);
  const cache = await caches.open(SHARED);
  const manifest = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    manifest.push({ id, name: file.name, type: file.type, lastModified: file.lastModified });
    await cache.put(`/__shared__/${id}`, new Response(file, { headers: { "content-type": file.type || "application/octet-stream" } }));
  }
  await cache.put("/__shared__/manifest", new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } }));
  return Response.redirect(new URL("/importar?shared=1", self.location.origin), 303);
}

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response.ok && SAFE_SHELL_ROUTE_SET.has(url.pathname)) {
      await cache.put(url.pathname, response.clone());
    }
    return response;
  } catch {
    const exactMatch = await cache.match(request);
    if (exactMatch) return exactMatch;
    if (SAFE_SHELL_ROUTE_SET.has(url.pathname)) {
      const shellMatch = await cache.match(url.pathname);
      if (shellMatch) return shellMatch;
    }
    return (await cache.match(fallback)) || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || fresh;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const current = clients.find((client) => "focus" in client);
    return current ? current.focus() : self.clients.openWindow("/estudo");
  }));
});
