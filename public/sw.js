const CACHE = "painel-bordo-v157-ais-svg-icons";
const OFFLINE = "/offline";
const ASSETS = [
  OFFLINE,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icons/baco-malha-v152.svg",
  "/icons/ais/barco_ais_svg_verde.svg",
  "/icons/ais/barco_ais_svg_dourado.svg",
  "/icons/ais/ambulancia_maritima.svg",
  "/icons/ais/apoio_offshore.svg",
  "/icons/ais/balsa.svg",
  "/icons/ais/balsa_servico.svg",
  "/icons/ais/barcaca.svg",
  "/icons/ais/barco_salvamento.svg",
  "/icons/ais/barco_turistico.svg",
  "/icons/ais/catamara.svg",
  "/icons/ais/draga.svg",
  "/icons/ais/empurrador_fluvial.svg",
  "/icons/ais/ferry_boat.svg",
  "/icons/ais/graneleiro.svg",
  "/icons/ais/guindaste_flutuante.svg",
  "/icons/ais/iate.svg",
  "/icons/ais/lancha.svg",
  "/icons/ais/lancha_piloto.svg",
  "/icons/ais/navio_cargueiro.svg",
  "/icons/ais/navio_cargueiro_topdown.svg",
  "/icons/ais/navio_cruzeiro.svg",
  "/icons/ais/navio_cruzeiro_topdown.svg",
  "/icons/ais/navio_frigorifico.svg",
  "/icons/ais/navio_gaseiro.svg",
  "/icons/ais/navio_graneleiro.svg",
  "/icons/ais/navio_militar.svg",
  "/icons/ais/navio_petroleiro.svg",
  "/icons/ais/navio_porta_carros.svg",
  "/icons/ais/navio_quimico.svg",
  "/icons/ais/navio_roro.svg",
  "/icons/ais/rebocador.svg",
  "/icons/ais/veleiro.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      ),
      caches.open(CACHE).then((cache) =>
        Promise.allSettled(ASSETS.map((asset) => cache.add(asset)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          return (await caches.match(request))
            || (await caches.match("/"))
            || (await caches.match(OFFLINE));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
