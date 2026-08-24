"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type MatchActionState = {
  success: boolean;
  status: string;
  message: string;
  evidenceDeadline: string | null;
};

type EvidenceSubmissionResult = {
  match_status: string;
  evidence_deadline: string;
};

type ScoreReportResult = {
  report_status: string;
  match_status: string;
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

function isValidGoals(
  value: string
): boolean {
  return /^([0-9]|[1-9][0-9])$/.test(value);
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

function getScoreReportErrorMessage(
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
    message.includes("INVALID_SCORE")
  ) {
    return "Score invalide. Entre un score entre 0 et 99 buts.";
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
      "MATCH_NOT_REPORTABLE"
    )
  ) {
    return "Ce match ne peut plus être déclaré.";
  }

  if (
    message.includes("ALREADY_REPORTED")
  ) {
    return "Tu as déjà déclaré ton score. Une seule déclaration est possible.";
  }

  if (
    message.includes(
      "MATCH_NOT_READY_FOR_REVIEW"
    )
  ) {
    return "Le règlement n’a pas pu aboutir. Contacte le support.";
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

export async function startEvidenceAction(
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
   * La fonction Supabase vérifie que :
   * - l’utilisateur participe au match ;
   * - le match est réellement en cours ;
   * - le délai n’a pas déjà été créé.
   */
  const {
    data,
    error
  } = await supabase.rpc(
    "start_evidence_submission",
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

  const results =
    (data ?? []) as EvidenceSubmissionResult[];

  const result = results[0];

  if (
    !result ||
    !result.evidence_deadline
  ) {
    return {
      success: false,
      status: "ERROR",
      message:
        "Le délai d’envoi des captures n’a pas pu être créé.",
      evidenceDeadline: null
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);

  return {
    success: true,
    status: result.match_status,
    message:
      "Le délai de cinq minutes a commencé. Envoie maintenant ta capture.",
    evidenceDeadline:
      result.evidence_deadline
  };
}

/*
 * Déclaration croisée du score.
 *
 * Chaque joueur saisit le score vu de son côté :
 * - si les deux déclarations concordent, le match est
 *   réglé automatiquement (sans IA ni admin) ;
 * - si elles se contredisent, on bascule sur le flux
 *   habituel captures + vérification.
 */
export async function reportScoreAction(
  _previousState: MatchActionState,
  formData: FormData
): Promise<MatchActionState> {
  const matchId = getFormText(
    formData,
    "match_id"
  );

  const myGoalsRaw = getFormText(
    formData,
    "my_goals"
  );

  const opponentGoalsRaw = getFormText(
    formData,
    "opponent_goals"
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

  if (
    !isValidGoals(myGoalsRaw) ||
    !isValidGoals(opponentGoalsRaw)
  ) {
    return {
      success: false,
      status: "ERROR",
      message:
        "Entre un score valide entre 0 et 99 buts.",
      evidenceDeadline: null
    };
  }

  const myGoals = Number(myGoalsRaw);
  const opponentGoals = Number(opponentGoalsRaw);

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
   * La fonction PostgreSQL report_match_score vérifie :
   * - la participation du joueur ;
   * - le statut du match ;
   * - l’absence de double déclaration ;
   * - et règle le match si les scores concordent.
   */
  const {
    data,
    error
  } = await supabase.rpc(
    "report_match_score",
    {
      requested_match_id: matchId,
      reported_my_goals: myGoals,
      reported_opponent_goals: opponentGoals
    }
  );

  if (error) {
    return {
      success: false,
      status: "ERROR",
      message: getScoreReportErrorMessage(
        error.message
      ),
      evidenceDeadline: null
    };
  }

  const results =
    (data ?? []) as ScoreReportResult[];

  const result = results[0];

  if (!result) {
    return {
      success: false,
      status: "ERROR",
      message:
        "La déclaration n’a pas pu être traitée.",
      evidenceDeadline: null
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}`);

  if (result.report_status === "WAITING_OPPONENT") {
    return {
      success: true,
      status: "WAITING_OPPONENT",
      message:
        "Score enregistré. En attente de la déclaration adverse.",
      evidenceDeadline: null
    };
  }

  if (result.report_status === "CONFIRMED") {
    return {
      success: true,
      status: "CONFIRMED",
      message:
        "Scores identiques. Le match a été réglé automatiquement.",
      evidenceDeadline: null
    };
  }

  if (result.report_status === "DRAW_REFUND") {
    return {
      success: true,
      status: "DRAW_REFUND",
      message:
        "Match nul confirmé par les deux joueurs. Les mises sont restituées.",
      evidenceDeadline: null
    };
  }

  if (result.report_status === "CONFLICT") {
    return {
      success: true,
      status: "CONFLICT",
      message:
        "Scores contradictoires. Envoie ta capture comme preuve.",
      evidenceDeadline: null
    };
  }

  return {
    success: true,
    status: result.report_status,
    message: "Score enregistré.",
    evidenceDeadline: null
  };
}
