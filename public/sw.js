const CACHE_NAME =
  "goalx-public-v1";

const OFFLINE_URL =
  "/offline.html";

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then((cache) =>
          cache.addAll([
            OFFLINE_URL,
            "/goalx-icon-192.png",
            "/goalx-icon-512.png"
          ])
        )
    );

    self.skipWaiting();
  }
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      Promise.all([
        self.clients.claim(),

        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter(
                  (key) =>
                    key !==
                    CACHE_NAME
                )
                .map(
                  (key) =>
                    caches.delete(
                      key
                    )
                )
            )
          )
      ])
    );
  }
);

self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    /*
     * Les requêtes POST et toutes
     * les opérations de match restent
     * directement sur le réseau.
     */
    if (
      request.method !== "GET"
    ) {
      return;
    }

    /*
     * Les pages utilisent toujours
     * le réseau. Si Internet est coupé,
     * seule la page publique hors ligne
     * est affichée.
     */
    if (
      request.mode === "navigate"
    ) {
      event.respondWith(
        fetch(request).catch(
          () =>
            caches.match(
              OFFLINE_URL
            )
        )
      );

      return;
    }

    /*
     * Les ressources normales restent
     * en réseau et ne sont pas conservées.
     */
    event.respondWith(
      fetch(request)
    );
  }
);
