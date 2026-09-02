import {
  NextResponse,
  type NextRequest
} from "next/server";

import sharp from "sharp";

import {
  analyzeMatch
} from "@/lib/matches/analyzeMatch";

import {
  createAdminClient
} from "@/lib/supabase/admin";

import {
  createClient
} from "@/lib/supabase/server";

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

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp"
];

const allowedRealFormats = [
  "jpeg",
  "png",
  "webp"
];

const maximumFileSize =
  10 * 1024 * 1024;

const maximumPixels =
  40_000_000;

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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

async function sanitizeImage(
  file: File
): Promise<Buffer> {
  const input = Buffer.from(
    await file.arrayBuffer()
  );

  const image = sharp(
    input,
    {
      failOn: "error",
      limitInputPixels:
        maximumPixels
    }
  );

  const metadata =
    await image.metadata();

  if (
    !metadata.format ||
    !allowedRealFormats.includes(
      metadata.format
    )
  ) {
    throw new Error(
      "UNSUPPORTED_REAL_FORMAT"
    );
  }

  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 200 ||
    metadata.height < 200
  ) {
    throw new Error(
      "IMAGE_TOO_SMALL"
    );
  }

  if (
    (metadata.pages ?? 1) > 1
  ) {
    throw new Error(
      "ANIMATED_IMAGE_NOT_ALLOWED"
    );
  }

  return image
    .rotate()
    .resize({
      width: 1920,
      height: 1920,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({
      quality: 82,
      effort: 4
    })
    .toBuffer();
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

  const supabase =
    await createClient();

  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    return jsonError(
      "Ta session a expiré. Reconnecte-toi.",
      401
    );
  }

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
    match.player_one_id ===
      user.id ||
    match.player_two_id ===
      user.id;

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
      "Le délai d’envoi est introuvable.",
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

  if (
    !(evidence instanceof File)
  ) {
    return jsonError(
      "Aucune capture n’a été envoyée.",
      400
    );
  }

  if (
    !allowedMimeTypes.includes(
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

  if (
    evidence.size >
    maximumFileSize
  ) {
    return jsonError(
      "La capture ne doit pas dépasser 10 Mo.",
      413
    );
  }

  let sanitizedImage: Buffer;

  try {
    sanitizedImage =
      await sanitizeImage(
        evidence
      );
  } catch (error) {
    console.warn(
      "GOALX_REJECTED_IMAGE",
      {
        matchId,
        userId: user.id,
        reason:
          error instanceof Error
            ? error.message
            : "INVALID_IMAGE"
      }
    );

    return jsonError(
      "Le fichier n’est pas une image valide ou sa résolution est dangereuse.",
      415
    );
  }

  /*
   * Toutes les images valides sont reconstruites
   * au format WEBP. Les anciennes métadonnées et
   * les données supplémentaires disparaissent.
   */
  const storagePath =
    `${matchId}/${user.id}.webp`;

  const bucket =
    process.env
      .SUPABASE_EVIDENCE_BUCKET ??
    "match-evidence";

  const admin =
    createAdminClient();

  const {
    error: uploadError
  } = await admin.storage
    .from(bucket)
    .upload(
      storagePath,
      sanitizedImage,
      {
        contentType: "image/webp",
        cacheControl: "3600",
        upsert: true
      }
    );

  if (uploadError) {
    return jsonError(
      "Le stockage sécurisé de la capture a échoué.",
      500
    );
  }

  const {
    error: insertError
  } = await admin
    .from("match_evidence")
    .insert({
      match_id: matchId,
      user_id: user.id,
      storage_path:
        storagePath,
      status: "PENDING"
    });

  if (
    insertError &&
    insertError.code !== "23505"
  ) {
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
        "Capture sécurisée et enregistrée. La vérification démarrera bientôt.",
      analysisStarted: false
    });
  }

  /*
   * L’analyse IA (Claude) est lancée uniquement
   * si la clé Anthropic existe. Sinon, les preuves
   * restent disponibles pour l’administrateur.
   */
  if (
    typeof count === "number" &&
    count >= 2 &&
    process.env.ANTHROPIC_API_KEY
  ) {
    try {
      const analysis =
        await analyzeMatch(
          matchId
        );

      return NextResponse.json({
        success: true,
        message:
          "Les deux captures ont été analysées. Le verdict est disponible.",
        analysisStarted: true,
        matchStatus:
          analysis.status
      });
    } catch (error) {
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
    }
  }

  return NextResponse.json({
    success: true,

    message:
      typeof count === "number" &&
      count >= 2
        ? "Les deux captures sécurisées sont prêtes pour le verdict administrateur."
        : "Capture sécurisée et enregistrée. En attente de la preuve adverse.",

    analysisStarted: false
  });
    }
