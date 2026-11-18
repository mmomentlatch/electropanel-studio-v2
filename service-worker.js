const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `electropanel-studio-v2-${encodeURIComponent(SCOPE.pathname)}-`;
const CACHE = `${CACHE_PREFIX}v233`;
const INDEX_URL = new URL("index.html", SCOPE).href;
const ASSETS = [
  "./", "./index.html", "./viewport.js?v=233", "./styles.css?v=233", "./buttons.css?v=233", "./wiring.css?v=233", "./templates.css?v=233", "./control-devices.js?v=233", "./mechanical.js?v=233", "./mechanical-ui.js?v=233", "./protection-face.js?v=233", "./device-visuals.js?v=233", "./rail-layout.js?v=233", "./mechanical.css?v=233", "./schematic.js?v=233", "./schematic-ui.js?v=233", "./schematic.css?v=233", "./floor-geometry.js?v=233", "./floor-geometry-ui.js?v=233", "./floor-ux-ui.js?v=233", "./floor-circuits-ui.js?v=233", "./floor-plan.js?v=233", "./floor-pencil.js?v=233", "./floor-partition.js?v=233", "./vendor/polygon-clipping-0.15.7.js?v=233", "./floor-pencil-ui.js?v=233", "./floor-svg.js?v=233", "./floor-plan-ui.js?v=233", "./floor-plan.css?v=233", "./electrical.js?v=233", "./design.js?v=233", "./project-generation.js?v=233", "./project-generation-ui.js?v=233", "./wiring.js?v=233", "./controls-ui.js?v=233", "./templates-ui.js?v=233", "./project-store.js?v=233", "./form-drafts.js?v=233", "./floor-forms-ui.js?v=233", "./project-issues.js?v=233", "./project-issues-ui.js?v=233", "./app.js?v=233", "./ui-help.js?v=233", "./cable-report.js?v=233", "./cable-report-ui.js?v=233", "./manifest.webmanifest",
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
