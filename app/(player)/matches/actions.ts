"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type MatchActionState = {
  success: boolean;
  status: string;
  message: string;
  evidenceDeadline: string | null;
};

function getFormText(
  formData: FormData,
  fieldName: string
): string {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}


function getMatchErrorMessage(
  errorMessage: string
): string {
  const message = errorMessage.toUpperCase();

  if (
    message.includes(
      "AUTHENTICATION_REQUIRED"
    )
  ) {
    return "Ta session a expiré. Reconnecte-toi.";
  }

  if (
    message.includes("MATCH_NOT_FOUND")
  ) {
    return "Ce match est introuvable.";
  }

  if (
    message.includes("ACCESS_DENIED")
  ) {
    return "Tu ne participes pas à ce match.";
  }

  if (
    message.includes(
      "MATCH_NOT_IN_PROGRESS"
    )
  ) {
    return "Le match ne peut pas encore passer à l’envoi des captures.";
  }

  return "L’opération a échoué. Réessaie dans quelques instants.";
}


export async function acceptMatchAction(
  _previousState: MatchActionState,
  formData: FormData
): Promise<MatchActionState> {
  const matchId = getFormText(
    formData,
    "match_id"
  );

  if (!isValidUuid(matchId)) {
    return {
      success: false,
      status: "ERROR",
      message:
        "L’identifiant du match est invalide.",
      evidenceDeadline: null
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
      evidenceDeadline: null
    };
  }

  /*
   * La fonction PostgreSQL vérifie elle-même :
   * - l’existence du match ;
   * - la participation du joueur ;
   * - le statut actuel du match.
   */
  const {
    data,
    error
  } = await supabase.rpc(
    "accept_match",
    {
      requested_match_id: matchId
    }
  );

  if (error) {
    return {
      success: false,
      status: "ERROR",
      message: getMatchErrorMessage(
        error.message
      ),
      evidenceDeadline: null
    };
  }

  const newStatus =
    typeof data === "string"
      ? data
      : "ACCEPTED";

  revalidatePath("/dashboard");
  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);

  if (newStatus === "IN_PROGRESS") {
    return {
      success: true,
      status: "IN_PROGRESS",
      message:
        "Les deux joueurs ont accepté. Le match peut commencer.",
      evidenceDeadline: null
    };
  }

  if (newStatus === "ACCEPTED") {
    return {
      success: true,
      status: "ACCEPTED",
      message:
        "Match accepté. En attente de l’adversaire.",
      evidenceDeadline: null
    };
  }

  return {
    success: true,
    status: newStatus,
    message:
      "Le statut du match a été actualisé.",
    evidenceDeadline: null
  };
}

// =========================================================
// Déclaration du résultat par bouton (« J'ai gagné » /
// « J'ai perdu ») — la concordance règle le match sans IA ;
// une contradiction bascule en litige (IA ou admin).
// =========================================================

function getOutcomeErrorMessage(
  errorMessage: string
): string {
  const message = errorMessage.toUpperCase();

  if (
    message.includes("AUTHENTICATION_REQUIRED")
  ) {
    return "Ta session a expiré. Reconnecte-toi.";
  }

  if (message.includes("INVALID_OUTCOME")) {
    return "Déclaration invalide.";
  }

  if (message.includes("MATCH_NOT_FOUND")) {
    return "Ce match est introuvable.";
  }

  if (
    message.includes("MATCH_NOT_REPORTABLE")
  ) {
    return "Ce match ne peut plus être déclaré.";
  }

  if (message.includes("EVIDENCE_REQUIRED")) {
    return "Envoie d'abord ta capture pour pouvoir déclarer ton résultat.";
  }

  return "L'opération a échoué. Réessaie dans quelques instants.";
}

export async function reportOutcomeAction(
  _previousState: MatchActionState,
  formData: FormData
): Promise<MatchActionState> {
  const matchId = getFormText(formData, "match_id");
  const outcome = getFormText(formData, "outcome");

  if (!isValidUuid(matchId)) {
    return {
      success: false,
      status: "ERROR",
      message: "L'identifiant du match est invalide.",
      evidenceDeadline: null
    };
  }

  if (outcome !== "WON" && outcome !== "LOST") {
    return {
      success: false,
      status: "ERROR",
      message: "Déclaration invalide.",
      evidenceDeadline: null
    };
  }

  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      status: "ERROR",
      message: "Ta session a expiré. Reconnecte-toi.",
      evidenceDeadline: null
    };
  }

  const { data, error } = await supabase.rpc(
    "report_match_outcome",
    {
      requested_match_id: matchId,
      requested_outcome: outcome
    }
  );

  if (error) {
    return {
      success: false,
      status: "ERROR",
      message: getOutcomeErrorMessage(error.message),
      evidenceDeadline: null
    };
  }

  const result = typeof data === "string" ? data : "WAITING_OPPONENT";

  revalidatePath("/dashboard");
  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);

  if (result === "CONFIRMED") {
    return {
      success: true,
      status: "CONFIRMED",
      message:
        "Résultat confirmé par les deux joueurs : le gain est crédité !",
      evidenceDeadline: null
    };
  }

  if (result === "CONFLICT") {
    return {
      success: true,
      status: "CONFLICT",
      message:
        "Déclarations contradictoires : la vérification des captures va trancher.",
      evidenceDeadline: null
    };
  }

  return {
    success: true,
    status: "WAITING_OPPONENT",
    message: "Déclaration enregistrée. En attente de ton adversaire.",
    evidenceDeadline: null
  };
}
