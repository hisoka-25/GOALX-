"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

// =========================================================
// GOALX — Battement de présence.
// Marque le joueur comme « en ligne » à l'ouverture de
// l'application puis toutes les 60 secondes. Silencieux :
// aucune interface, aucune erreur visible en cas d'échec
// (la présence est un confort, jamais un blocage).
// =========================================================

const HEARTBEAT_INTERVAL_MS = 60_000;

export function Presence() {
  useEffect(() => {
    let stopped = false;

    async function touch() {
      if (stopped) return;
      try {
        await createClient().rpc("touch_presence");
      } catch {
        // Silencieux : perte de réseau, session expirée…
        // la prochaine tentative repartira d'elle-même.
      }
    }

    touch();

    const interval = setInterval(touch, HEARTBEAT_INTERVAL_MS);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}
