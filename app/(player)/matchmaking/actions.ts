"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type MatchmakingState = {
  success: boolean;
  status:
    | "IDLE"
    | "SEARCHING"
    | "MATCHED"
    | "CANCELLED"
    | "ERROR";
  message: string;
  queueId: string | null;
  matchId: string | null;
};



type MatchmakingResult = {
  queue_id: string | null;
  queue_status: string;
  found_match_id: string | null;
};

function getErrorMessage(
  errorMessage: string
): string {
  const normalizedMessage =
    errorMessage.toUpperCase();

  if (
    normalizedMessage.includes(
      "AUTHENTICATION_REQUIRED"
    )
  ) {
    return "Ta session a expiré. Reconnecte-toi.";
  }

  if (
    normalizedMessage.includes(
      "INSUFFICIENT_BALANCE"
    )
  ) {
    return "Ton solde est insuffisant pour cette mise.";
  }

  if (
    normalizedMessage.includes(
      "INVALID_STAKE_INCREMENT"
    )
  ) {
    return "La mise doit être un multiple de 500 FCFA.";
  }

  if (
    normalizedMessage.includes(
      "INVALID_STAKE"
    )
  ) {
    return "La mise minimale est de 500 FCFA.";
  }

  if (
    normalizedMessage.includes(
      "PROFILE_NOT_FOUND"
    )
  ) {
    return "Ton profil GOALX est introuvable.";
  }

  if (
    normalizedMessage.includes(
      "WALLET_NOT_FOUND"
    )
  ) {
    return "Ton portefeuille fictif est introuvable.";
  }

  return "Impossible de lancer la recherche. Réessaie dans quelques instants.";
}

export async function joinMatchmakingAction(
  _previousState: MatchmakingState,
  formData: FormData
): Promise<MatchmakingState> {
  const stakeValue = formData.get("stake");

  const stake =
    typeof stakeValue === "string"
      ? Number(stakeValue)
      : Number.NaN;

  if (
    !Number.isSafeInteger(stake) ||
    stake < 500 ||
    stake % 500 !== 0
  ) {
    return {
      success: false,
      status: "ERROR",
      message:
        "Choisis une mise valide à partir de 500 FCFA.",
      queueId: null,
      matchId: null
    };
  }

  const supabase = await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      status: "ERROR",
      message:
        "Ta session a expiré. Reconnecte-toi.",
      queueId: null,
      matchId: null
    };
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "join_matchmaking",
    {
      requested_stake: stake
    }
  );

  if (error) {
    return {
      success: false,
      status: "ERROR",
      message: getErrorMessage(
        error.message
      ),
      queueId: null,
      matchId: null
    };
  }

  const results =
    (data ?? []) as MatchmakingResult[];

  const result = results[0];

  if (!result) {
    return {
      success: false,
      status: "ERROR",
      message:
        "Le serveur n’a retourné aucune recherche.",
      queueId: null,
      matchId: null
    };
  }

  if (
    result.queue_status === "MATCHED" &&
    result.found_match_id
  ) {
    revalidatePath("/dashboard");
    revalidatePath("/matchmaking");
    revalidatePath("/matches");

    return {
      success: true,
      status: "MATCHED",
      message: "Adversaire trouvé !",
      queueId: result.queue_id,
      matchId: result.found_match_id
    };
  }

  return {
    success: true,
    status: "SEARCHING",
    message:
      "Recherche en cours. GOALX cherche un adversaire compatible.",
    queueId: result.queue_id,
    matchId: null
  };
}

export async function cancelMatchmakingAction(): Promise<MatchmakingState> {
  const supabase = await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      status: "ERROR",
      message:
        "Ta session a expiré. Reconnecte-toi.",
      queueId: null,
      matchId: null
    };
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "cancel_matchmaking"
  );

  if (error) {
    return {
      success: false,
      status: "ERROR",
      message:
        "Impossible d’annuler la recherche.",
      queueId: null,
      matchId: null
    };
  }

  revalidatePath("/matchmaking");

  return {
    success: true,
    status: "CANCELLED",
    message:
      data === true
        ? "La recherche a été annulée."
        : "Aucune recherche active.",
    queueId: null,
    matchId: null
  };
    }
