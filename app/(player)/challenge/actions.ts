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
  const item = formData.get(name);

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
    return "Termine ton match actif avant de créer ou accepter un défi.";
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
      "CANNOT_ACCEPT_OWN_CHALLENGE"
    )
  ) {
    return "Tu ne peux pas accepter ton propre défi.";
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
      "CHALLENGE_NOT_FOUND"
    )
  ) {
    return "Ce défi est introuvable.";
  }

  return "L’opération a échoué. Réessaie.";
}

export async function createChallengeAction(
  formData: FormData
): Promise<void> {
  const stake = Number(
    getValue(
      formData,
      "stake"
    )
  );

  if (
    !Number.isSafeInteger(stake) ||
    stake < 500 ||
    stake % 500 !== 0
  ) {
    redirect(
      `/challenge?error=${encodeURIComponent(
        "Mise invalide."
      )}`
    );
  }

  const supabase =
    await createClient();

  const {
    data,
    error
  } = await supabase.rpc(
    "create_friend_challenge",
    {
      requested_stake: stake
    }
  );

  if (error) {
    redirect(
      `/challenge?error=${encodeURIComponent(
        getErrorMessage(
          error.message
        )
      )}`
    );
  }

  const result =
    Array.isArray(data)
      ? data[0]
      : null;

  if (!result?.challenge_code) {
    redirect(
      `/challenge?error=${encodeURIComponent(
        "Le code du défi n’a pas été créé."
      )}`
    );
  }

  redirect(
    `/challenge/${result.challenge_code}`
  );
}

export async function acceptChallengeAction(
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

  if (error) {
    redirect(
      `/challenge/${code}?error=${encodeURIComponent(
        getErrorMessage(
          error.message
        )
      )}`
    );
  }

  if (typeof data !== "string") {
    redirect(
      `/challenge/${code}?error=${encodeURIComponent(
        "Le match n’a pas été créé."
      )}`
    );
  }

  redirect(
    `/matches/${data}`
  );
}

export async function cancelChallengeAction(
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
    "/challenge?cancelled=true"
  );
      }
