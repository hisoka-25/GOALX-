import {
  NextResponse,
  type NextRequest
} from "next/server";

import { analyzeMatch } from "@/lib/matches/analyzeMatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type MatchData = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  status: string;
  evidence_deadline: string | null;
};

const allowedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getFileExtension(
  contentType: string
): string {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function jsonError(
  message: string,
  status: number
) {
  return NextResponse.json(
    {
      success: false,
      message
    },
    {
      status
    }
  );
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const {
    id: matchId
  } = await context.params;

  if (!isValidUuid(matchId)) {
    return jsonError(
      "L’identifiant du match est invalide.",
      400
    );
  }

  const supabase = await createClient();

  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError(
      "Ta session a expiré. Reconnecte-toi.",
      401
    );
  }

  /*
   * La politique RLS empêche déjà de lire
   * un match auquel le joueur ne participe pas.
   */
  const {
    data: matchResult,
    error: matchError
  } = await supabase
    .from("matches")
    .select(
      `
        id,
        player_one_id,
        player_two_id,
        status,
        evidence_deadline
      `
    )
    .eq("id", matchId)
    .maybeSingle();

  if (
    matchError ||
    !matchResult
  ) {
    return jsonError(
      "Ce match est introuvable ou inaccessible.",
      404
    );
  }

  const match =
    matchResult as MatchData;

  const isParticipant =
    match.player_one_id === user.id ||
    match.player_two_id === user.id;

  if (!isParticipant) {
    return jsonError(
      "Tu ne participes pas à ce match.",
      403
    );
  }

  if (
    match.status !==
    "WAITING_FOR_EVIDENCE"
  ) {
    return jsonError(
      "Ce match n’accepte pas de capture actuellement.",
      409
    );
  }

  if (!match.evidence_deadline) {
    return jsonError(
      "Le délai d’envoi des captures est introuvable.",
      409
    );
  }

  if (
    new Date(
      match.evidence_deadline
    ).getTime() <= Date.now()
  ) {
    return jsonError(
      "Le délai de cinq minutes est terminé.",
      410
    );
  }

  /*
   * Vérification d’une éventuelle preuve
   * déjà envoyée par ce joueur.
   */
  const {
    data: existingEvidence
  } = await supabase
    .from("match_evidence")
    .select("id")
    .eq("match_id", matchId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingEvidence) {
    return NextResponse.json({
      success: true,
      message:
        "Ta capture a déjà été enregistrée."
    });
  }

  let formData: FormData;

  try {
    formData =
      await request.formData();
  } catch {
    return jsonError(
      "Le formulaire envoyé est invalide.",
      400
    );
  }

  const evidence =
    formData.get("evidence");

  if (!(evidence instanceof File)) {
    return jsonError(
      "Aucune capture n’a été envoyée.",
      400
    );
  }

  if (
    !allowedImageTypes.includes(
      evidence.type
    )
  ) {
    return jsonError(
      "Utilise une image PNG, JPG ou WEBP.",
      415
    );
  }

  if (evidence.size <= 0) {
    return jsonError(
      "La capture est vide.",
      400
    );
  }

  const maximumFileSize =
    10 * 1024 * 1024;

  if (
    evidence.size >
    maximumFileSize
  ) {
    return jsonError(
      "La capture ne doit pas dépasser 10 Mo.",
      413
    );
  }

  const extension =
    getFileExtension(
      evidence.type
    );

  /*
   * Le chemin ne contient aucun nom fourni
   * directement par l’utilisateur.
   */
  const storagePath =
    `${matchId}/${user.id}.${extension}`;

  const bucket =
    process.env.SUPABASE_EVIDENCE_BUCKET ??
    "match-evidence";

  const admin =
    createAdminClient();

  const fileBuffer =
    await evidence.arrayBuffer();

  const {
    error: uploadError
  } = await admin.storage
    .from(bucket)
    .upload(
      storagePath,
      fileBuffer,
      {
        contentType: evidence.type,
        cacheControl: "3600",
        upsert: false
      }
    );

  if (uploadError) {
    /*
     * Si le fichier existe déjà mais que la ligne
     * PostgreSQL manque après une ancienne erreur,
     * on tente de réutiliser le fichier privé.
     */
    const isDuplicateFile =
      uploadError.message
        .toLowerCase()
        .includes("already exists") ||
      uploadError.message
        .toLowerCase()
        .includes("duplicate");

    if (!isDuplicateFile) {
      return jsonError(
        "Le stockage de la capture a échoué.",
        500
      );
    }
  }

  const {
    error: insertError
  } = await admin
    .from("match_evidence")
    .insert({
      match_id: matchId,
      user_id: user.id,
      storage_path: storagePath,
      status: "PENDING"
    });

  if (insertError) {
    const duplicateEvidence =
      insertError.code === "23505";

    if (!duplicateEvidence) {
      /*
       * Nettoyage du fichier si la base refuse
       * définitivement l’enregistrement.
       */
      await admin.storage
        .from(bucket)
        .remove([
          storagePath
        ]);

      return jsonError(
        "L’enregistrement de la preuve a échoué.",
        500
      );
    }
  }

  /*
   * Vérification du nombre de preuves présentes.
   */
  const {
    count,
    error: countError
  } = await admin
    .from("match_evidence")
    .select(
      "id",
      {
        count: "exact",
        head: true
      }
    )
    .eq("match_id", matchId);

  if (countError) {
    return NextResponse.json({
      success: true,
      message:
        "Capture enregistrée. La vérification démarrera bientôt.",
      analysisStarted: false
    });
  }

  if (
    typeof count === "number" &&
    count >= 2
  ) {
    try {
      const analysis =
        await analyzeMatch(matchId);

      return NextResponse.json({
        success: true,
        message:
          "Les deux captures ont été analysées. Le verdict est disponible.",
        analysisStarted: true,
        matchStatus:
          analysis.status
      });
    } catch (error) {
      /*
       * La capture reste enregistrée.
       * Si l’IA rencontre une erreur temporaire,
       * le match revient en attente afin de pouvoir
       * relancer l’analyse ultérieurement.
       */
      const errorMessage =
        error instanceof Error
          ? error.message
          : "UNKNOWN_ANALYSIS_ERROR";

      if (
        !errorMessage.includes(
          "MATCH_ALREADY_FINALIZED"
        )
      ) {
        await admin
          .from("matches")
          .update({
            status:
              "WAITING_FOR_EVIDENCE"
          })
          .eq("id", matchId)
          .eq(
            "status",
            "AI_REVIEW"
          );
      }

      console.error(
        "GOALX_AI_ANALYSIS_ERROR",
        {
          matchId,
          error: errorMessage
        }
      );

      return NextResponse.json({
        success: true,
        message:
          "Les deux captures sont enregistrées. L’analyse du verdict sera relancée.",
        analysisStarted: false
      });
    }
  }

  return NextResponse.json({
    success: true,
    message:
      "Capture enregistrée. En attente de la preuve adverse.",
    analysisStarted: false
  });
    }
