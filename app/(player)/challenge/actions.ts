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

  if (
    normalized.includes(
      "CANNOT_CHALLENGE_SELF"
    )
  ) {
    return "Tu ne peux pas te défier toi-même.";
  }

  if (
    normalized.includes(
      "TARGET_NOT_FOUND"
    )
  ) {
    return "Ce joueur est introuvable.";
  }

  return "L’opération a échoué. Réessaie.";
}

// URL de retour en erreur : conserve le joueur cible
// du défi direct pour ne pas perdre le contexte.
function errorUrl(
  to: string,
  message: string
): string {
  const query: string[] = [];

  if (to) {
    query.push(`to=${to}`);
  }

  query.push(
    `error=${encodeURIComponent(
      message
    )}`
  );

  return `/challenge?${query.join(
    "&"
  )}`;
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

  const to = getValue(
    formData,
    "to"
  );

  if (
    !Number.isSafeInteger(stake) ||
    stake < 500 ||
    stake % 500 !== 0
  ) {
    redirect(
      errorUrl(
        to,
        "Mise invalide."
      )
    );
  }

  const supabase =
    await createClient();

  const rpcParams: {
    requested_stake: number;
    target_profile_id?: string;
  } = {
    requested_stake: stake
  };

  if (to) {
    rpcParams.target_profile_id =
      to;
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "create_friend_challenge",
    rpcParams
  );

  if (error) {
    redirect(
      errorUrl(
        to,
        getErrorMessage(
          error.message
        )
      )
    );
  }

  const result =
    Array.isArray(data)
      ? data[0]
      : null;

  if (!result?.challenge_code) {
    redirect(
      errorUrl(
        to,
        "Le code du défi n’a pas été créé."
      )
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
