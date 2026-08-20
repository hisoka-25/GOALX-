self.addEventListener(
  "install",
  () => {
    self.skipWaiting();
  }
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      self.clients.claim()
    );
  }
);

/*
 * GOALX n’enregistre volontairement
 * aucune page privée, aucun portefeuille,
 * aucun match et aucune réponse API.
 *
 * Le service worker sert uniquement à
 * rendre l’application installable.
 */
self.addEventListener(
  "fetch",
  () => {}
);
