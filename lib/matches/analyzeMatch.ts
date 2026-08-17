import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

const aiVerdictSchema = z.object({
  verdict: z.enum([
    "PLAYER_ONE_WON",
    "PLAYER_TWO_WON",
    "UNFINISHED"
  ]),

  confidence: z
    .number()
    .min(0)
    .max(1),

  detected_score: z
    .string()
    .max(30),

  explanation: z
    .string()
    .min(10)
    .max(1000),

  player_one_name: z
    .string()
    .max(100),

  player_two_name: z
    .string()
    .max(100),

  evidence_consistent: z.boolean(),

  reasons: z.array(
    z.string().max(300)
  )
});

type AiVerdict = z.infer<
  typeof aiVerdictSchema
>;

type MatchData = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  status: string;
  player_one: {
    username: string;
    efootball_username: string;
    team: string;
  };
  player_two: {
    username: string;
    efootball_username: string;
    team: string;
  };
};

type EvidenceData = {
  user_id: string;
  storage_path: string;
};

function bufferToDataUrl(
  buffer: ArrayBuffer,
  contentType: string
): string {
  const base64 = Buffer.from(
    buffer
  ).toString("base64");

  return `data:${contentType};base64,${base64}`;
}

function getImageContentType(
  storagePath: string
): string {
  const extension = storagePath
    .split(".")
    .pop()
    ?.toLowerCase();

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return "image/jpeg";
}

function normalizeVerdict(
  verdict: AiVerdict
): AiVerdict {
  /*
   * L’IA ne peut déclarer un gagnant que si :
   * - les deux captures sont cohérentes ;
   * - sa confiance atteint au moins 90 %.
   *
   * Dans le cas contraire, le match est inachevé.
   */
  if (
    !verdict.evidence_consistent ||
    verdict.confidence < 0.9
  ) {
    return {
      ...verdict,
      verdict: "UNFINISHED",
      explanation:
        "Les captures ne permettent pas de déterminer un gagnant avec une confiance suffisante. " +
        verdict.explanation
    };
  }

  return verdict;
}

export async function analyzeMatch(
  matchId: string
): Promise<{
  status: string;
  verdict: AiVerdict;
}> {
  const openAiApiKey =
    process.env.OPENAI_API_KEY;

  const evidenceBucket =
    process.env.SUPABASE_EVIDENCE_BUCKET ??
    "match-evidence";

  if (!openAiApiKey) {
    throw new Error(
      "OPENAI_API_KEY_MISSING"
    );
  }

  const admin = createAdminClient();

  /*
   * La clé service_role est utilisée uniquement
   * côté serveur. Elle permet de lire les images
   * du compartiment privé.
   */
  const {
    data: matchResult,
    error: matchError
  } = await admin
    .from("matches")
    .select(
      `
        id,
        player_one_id,
        player_two_id,
        status,
        player_one:profiles!matches_player_one_id_fkey (
          username,
          efootball_username,
          team
        ),
        player_two:profiles!matches_player_two_id_fkey (
          username,
          efootball_username,
          team
        )
      `
    )
    .eq("id", matchId)
    .single();

  if (
    matchError ||
    !matchResult
  ) {
    throw new Error(
      "MATCH_NOT_FOUND"
    );
  }

  const match =
    matchResult as unknown as MatchData;

  if (
    match.status === "COMPLETED" ||
    match.status === "UNFINISHED"
  ) {
    throw new Error(
      "MATCH_ALREADY_FINALIZED"
    );
  }

  const {
    data: evidenceResult,
    error: evidenceError
  } = await admin
    .from("match_evidence")
    .select(
      `
        user_id,
        storage_path
      `
    )
    .eq("match_id", matchId);

  if (evidenceError) {
    throw new Error(
      "EVIDENCE_QUERY_FAILED"
    );
  }

  const evidence =
    (evidenceResult ??
      []) as EvidenceData[];

  const playerOneEvidence =
    evidence.find(
      (item) =>
        item.user_id ===
        match.player_one_id
    );

  const playerTwoEvidence =
    evidence.find(
      (item) =>
        item.user_id ===
        match.player_two_id
    );

  if (
    !playerOneEvidence ||
    !playerTwoEvidence
  ) {
    throw new Error(
      "TWO_EVIDENCES_REQUIRED"
    );
  }

  /*
   * Le statut indique aux deux joueurs que
   * l’analyse a commencé.
   */
  const {
    error: statusError
  } = await admin
    .from("matches")
    .update({
      status: "AI_REVIEW"
    })
    .eq("id", matchId)
    .in("status", [
      "WAITING_FOR_EVIDENCE",
      "AI_REVIEW"
    ]);

  if (statusError) {
    throw new Error(
      "AI_REVIEW_STATUS_FAILED"
    );
  }

  const [
    playerOneImageResult,
    playerTwoImageResult
  ] = await Promise.all([
    admin.storage
      .from(evidenceBucket)
      .download(
        playerOneEvidence.storage_path
      ),

    admin.storage
      .from(evidenceBucket)
      .download(
        playerTwoEvidence.storage_path
      )
  ]);

  if (
    playerOneImageResult.error ||
    !playerOneImageResult.data
  ) {
    throw new Error(
      "PLAYER_ONE_IMAGE_DOWNLOAD_FAILED"
    );
  }

  if (
    playerTwoImageResult.error ||
    !playerTwoImageResult.data
  ) {
    throw new Error(
      "PLAYER_TWO_IMAGE_DOWNLOAD_FAILED"
    );
  }

  const [
    playerOneBuffer,
    playerTwoBuffer
  ] = await Promise.all([
    playerOneImageResult.data.arrayBuffer(),
    playerTwoImageResult.data.arrayBuffer()
  ]);

  const playerOneImageUrl =
    bufferToDataUrl(
      playerOneBuffer,
      getImageContentType(
        playerOneEvidence.storage_path
      )
    );

  const playerTwoImageUrl =
    bufferToDataUrl(
      playerTwoBuffer,
      getImageContentType(
        playerTwoEvidence.storage_path
      )
    );

  const openai = new OpenAI({
    apiKey: openAiApiKey
  });

  const instructions = `
Tu es le système officiel de vérification des matchs GOALX.

Tu dois comparer deux captures de fin de match eFootball.

Joueur 1 :
- Nom GOALX : ${match.player_one.username}
- Nom eFootball attendu : ${match.player_one.efootball_username}
- Équipe attendue : ${match.player_one.team}

Joueur 2 :
- Nom GOALX : ${match.player_two.username}
- Nom eFootball attendu : ${match.player_two.efootball_username}
- Équipe attendue : ${match.player_two.team}

Règles obligatoires :

1. Lis le score visible sur chaque capture.
2. Vérifie que les deux captures représentent le même match.
3. Vérifie la cohérence des noms, équipes et scores.
4. Ne désigne jamais de gagnant si le score est nul.
5. Ne désigne jamais de gagnant si une capture est illisible, coupée, contradictoire ou ne montre pas clairement le résultat final.
6. Ne tente pas de deviner une information invisible.
7. Si les preuves ne permettent pas une décision fiable, utilise UNFINISHED.
8. PLAYER_ONE_WON signifie que le joueur 1 a gagné.
9. PLAYER_TWO_WON signifie que le joueur 2 a gagné.
10. UNFINISHED signifie qu’aucun gagnant fiable ne peut être validé.

Réponds uniquement avec un objet JSON respectant exactement le format demandé.
  `.trim();

  const response =
    await openai.responses.create({
      model:
        process.env.OPENAI_VISION_MODEL ??
        "gpt-4.1-mini",

      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: instructions
            },
            {
              type: "input_text",
              text:
                "Capture envoyée par le joueur 1 :"
            },
            {
              type: "input_image",
              image_url:
                playerOneImageUrl,
              detail: "high"
            },
            {
              type: "input_text",
              text:
                "Capture envoyée par le joueur 2 :"
            },
            {
              type: "input_image",
              image_url:
                playerTwoImageUrl,
              detail: "high"
            }
          ]
        }
      ],

      text: {
        format: {
          type: "json_schema",
          name: "goalx_match_verdict",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              verdict: {
                type: "string",
                enum: [
                  "PLAYER_ONE_WON",
                  "PLAYER_TWO_WON",
                  "UNFINISHED"
                ]
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 1
              },
              detected_score: {
                type: "string"
              },
              explanation: {
                type: "string"
              },
              player_one_name: {
                type: "string"
              },
              player_two_name: {
                type: "string"
              },
              evidence_consistent: {
                type: "boolean"
              },
