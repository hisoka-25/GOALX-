"use server";

import {
  redirect
} from "next/navigation";

import {
  createClient
} from "@/lib/supabase/server";

function getValue(
  formData: FormData,
  name: string
): string {
  const item =
    formData.get(name);

  return typeof item === "string"
    ? item.trim()
    : "";
}

function getErrorMessage(
  error: string
): string {
  const normalized =
    error.toUpperCase();

  if (
    normalized.includes(
      "INSUFFICIENT_BALANCE"
    )
  ) {
    return "Solde insuffisant pour cette mise.";
  }

  if (
    normalized.includes(
      "ACTIVE_MATCH_EXISTS"
    )
  ) {
    return "Termine ton match actif avant d’accepter un défi.";
  }

  if (
    normalized.includes(
      "GAME_MODE_MISMATCH"
    )
  ) {
    return "Vous devez utiliser le même mode de jeu.";
  }

  if (
    normalized.includes(
      "CHALLENGE_UNAVAILABLE"
    )
  ) {
    return "Ce défi a expiré ou a déjà été accepté.";
  }

  if (
    normalized.includes(
      "NOT_CHALLENGED_PLAYER"
    )
  ) {
    return "Ce défi ne t’est pas adressé.";
  }

  return "Le défi n’a pas pu être accepté.";
}

// =========================================================
// DÉFIS REÇUS (page Accueil) — accepter ou refuser
// un défi direct ciblé sur le joueur connecté.
// Réutilise les RPC prod accept_friend_challenge et
// cancel_friend_challenge (cette dernière autorise
// désormais aussi la cible à annuler = refuser).
// =========================================================

export async function acceptReceivedChallengeAction(
  formData: FormData
): Promise<void> {
  const code = getValue(
    formData,
    "code"
  ).toUpperCase();

  const supabase =
    await createClient();

  const {
    data,
    error
  } = await supabase.rpc(
    "accept_friend_challenge",
    {
      requested_code: code
    }
  );

  if (
    error ||
    typeof data !== "string"
  ) {
    redirect(
      `/dashboard?challengeError=${encodeURIComponent(
        getErrorMessage(
          error?.message ?? ""
        )
      )}`
    );
  }

  redirect(
    `/matches/${data}`
  );
}

export async function refuseReceivedChallengeAction(
  formData: FormData
): Promise<void> {
  const code = getValue(
    formData,
    "code"
  ).toUpperCase();

  const supabase =
    await createClient();

  await supabase.rpc(
    "cancel_friend_challenge",
    {
      requested_code: code
    }
  );

  redirect(
    "/dashboard?challengeRefused=1"
  );
}
