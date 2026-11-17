const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `electropanel-studio-v2-${encodeURIComponent(SCOPE.pathname)}-`;
const CACHE = `${CACHE_PREFIX}v207`;
const INDEX_URL = new URL("index.html", SCOPE).href;
const ASSETS = [
  "./", "./index.html", "./viewport.js?v=207", "./styles.css?v=207", "./wiring.css?v=207", "./templates.css?v=207", "./control-devices.js?v=207", "./mechanical.js?v=207", "./mechanical-ui.js?v=207", "./mechanical.css?v=207", "./schematic.js?v=207", "./schematic-ui.js?v=207", "./schematic.css?v=207", "./floor-geometry.js?v=207", "./floor-geometry-ui.js?v=207", "./floor-ux-ui.js?v=207", "./floor-plan.js?v=207", "./floor-pencil.js?v=207", "./floor-partition.js?v=207", "./vendor/polygon-clipping-0.15.7.js?v=207", "./floor-pencil-ui.js?v=207", "./floor-svg.js?v=207", "./floor-plan-ui.js?v=207", "./floor-plan.css?v=207", "./electrical.js?v=207", "./design.js?v=207", "./project-generation.js?v=207", "./project-generation-ui.js?v=207", "./wiring.js?v=207", "./controls-ui.js?v=207", "./templates-ui.js?v=207", "./project-store.js?v=207", "./app.js?v=207", "./ui-help.js?v=207", "./cable-report.js?v=207", "./cable-report-ui.js?v=207", "./manifest.webmanifest",
  "./assets/devices/mcb-1p.png", "./assets/devices/rccb-2p.png", "./assets/devices/spd-2p.png",
  "./assets/devices/contactor.png", "./assets/devices/voltage-relay.png", "./assets/devices/energy-meter.png",
  "./assets/devices/terminal-block.png", "./assets/devices/power-supply.svg", "./assets/devices/control-relay.svg", "./assets/devices/timer-relay.svg", "./assets/devices/contactor-2p.svg", "./assets/devices/contactor-3p.svg", "./assets/devices/motor-protection.svg", "./assets/devices/indicator.svg", "./assets/devices/outlet.svg", "./assets/devices/rccb-2p.svg", "./assets/devices/rccb-4p.svg", "./assets/devices/rcbo.svg", "./assets/devices/rcbo-afdd.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok && (url.pathname === SCOPE.pathname || url.href === INDEX_URL)) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then((cache) => cache.put(INDEX_URL, copy))); }
      return response;
    }).catch(() => caches.open(CACHE).then((cache) => cache.match(INDEX_URL))));
    return;
  }
  event.respondWith(caches.open(CACHE).then((cache) => cache.match(event.request)).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy))); }
    return response;
  })));
});
