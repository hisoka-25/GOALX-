import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// =========================================================
// GOALX — Analyse automatique des captures (verdict IA).
// Moteur unique : Claude (Anthropic), vision.
// L'administrateur peut également trancher manuellement
// depuis /admin (finalizeMatchByAdmin), indépendamment
// de cette fonction.
// =========================================================

const verdictSchema = z.object({
  verdict: z.enum(["PLAYER_ONE_WON", "PLAYER_TWO_WON", "UNFINISHED"]),
  confidence: z.number().min(0).max(1),
  detected_score: z.string().max(30),
  explanation: z.string().min(5).max(1000),
  player_one_name: z.string().max(100),
  player_two_name: z.string().max(100),
  evidence_consistent: z.boolean(),
  reasons: z.array(z.string().max(300))
});

type Verdict = z.infer<typeof verdictSchema>;
type MatchData = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  status: string;
  player_one: { username: string; efootball_username: string; team: string };
  player_two: { username: string; efootball_username: string; team: string };
};
type Evidence = { user_id: string; storage_path: string };

function contentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString("base64");
}

export async function analyzeMatch(matchId: string): Promise<{ status: string; verdict: Verdict }> {
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (!claudeKey) throw new Error("ANTHROPIC_API_KEY_MISSING");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

  const admin = createAdminClient();
  const bucket = process.env.SUPABASE_EVIDENCE_BUCKET ?? "match-evidence";

  const { data: rawMatch, error: matchError } = await admin
    .from("matches")
    .select(`
      id, player_one_id, player_two_id, status,
      player_one:profiles!matches_player_one_id_fkey(username,efootball_username,team),
      player_two:profiles!matches_player_two_id_fkey(username,efootball_username,team)
    `)
    .eq("id", matchId)
    .single();

  if (matchError || !rawMatch) throw new Error("MATCH_NOT_FOUND");
  const match = rawMatch as unknown as MatchData;
  if (["COMPLETED", "UNFINISHED"].includes(match.status)) {
    throw new Error("MATCH_ALREADY_FINALIZED");
  }

  const { data: rawEvidence, error: evidenceError } = await admin
    .from("match_evidence")
    .select("user_id,storage_path")
    .eq("match_id", matchId);
  if (evidenceError) throw new Error("EVIDENCE_QUERY_FAILED");

  const evidence = (rawEvidence ?? []) as Evidence[];
  const first = evidence.find((item) => item.user_id === match.player_one_id);
  const second = evidence.find((item) => item.user_id === match.player_two_id);
  if (!first || !second) throw new Error("TWO_EVIDENCES_REQUIRED");

  const { error: reviewError } = await admin
    .from("matches")
    .update({ status: "AI_REVIEW" })
    .eq("id", matchId)
    .in("status", ["WAITING_FOR_EVIDENCE", "AI_REVIEW"]);
  if (reviewError) throw new Error("AI_REVIEW_STATUS_FAILED");

  const [firstDownload, secondDownload] = await Promise.all([
    admin.storage.from(bucket).download(first.storage_path),
    admin.storage.from(bucket).download(second.storage_path)
  ]);
  if (firstDownload.error || !firstDownload.data) throw new Error("PLAYER_ONE_IMAGE_DOWNLOAD_FAILED");
  if (secondDownload.error || !secondDownload.data) throw new Error("PLAYER_TWO_IMAGE_DOWNLOAD_FAILED");

  const [firstBuffer, secondBuffer] = await Promise.all([
    firstDownload.data.arrayBuffer(),
    secondDownload.data.arrayBuffer()
  ]);

  const instructions = `Tu vérifies un match GOALX (eFootball) à partir de deux captures d'écran de fin de match.

JOUEUR 1 — nom GOALX: ${match.player_one.username}; nom eFootball: ${match.player_one.efootball_username}; ÉQUIPE DIRIGÉE PAR CE JOUEUR : « ${match.player_one.team} ».
JOUEUR 2 — nom GOALX: ${match.player_two.username}; nom eFootball: ${match.player_two.efootball_username}; ÉQUIPE DIRIGÉE PAR CE JOUEUR : « ${match.player_two.team} ».

IMPORTANT :
- Sur chaque capture, lis le score final et SURTOUT les deux noms d'ÉQUIPE affichés (les noms des clubs en haut de l'écran de résultat, ex: « ROYAUTÉ FC », « panama »).
- L'équipe qui a le plus de buts sur l'écran de résultat est l'équipe qui gagne ce match.
- Détermine lequel des deux JOUEURS (1 ou 2) a gagné, en comparant le nom de l'équipe gagnante visible sur la capture avec les équipes dirigées par chaque joueur ci-dessus.
- Les deux captures doivent être cohérentes (même score, même vainqueur).
- Ne devine rien. Si le score est nul/illisible/coupé, si les noms d'équipe ne correspondent à aucun des deux joueurs, ou si les captures sont contradictoires, réponds UNFINISHED.
- PLAYER_ONE_WON = le joueur 1 a gagné. PLAYER_TWO_WON = le joueur 2 a gagné.
- Dans player_one_name et player_two_name, mets le NOM DE L'ÉQUIPE de chaque joueur (ex: « panama », « ROYAUTÉ FC »), pas le pseudo.
- Dans explanation, écris une phrase avec le NOM DE L'ÉQUIPE gagnante, par exemple : « L'équipe panama gagne 3-0 ».

Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :
{"verdict":"PLAYER_ONE_WON ou PLAYER_TWO_WON ou UNFINISHED","confidence":0.95,"detected_score":"ex: 3-0","explanation":"courte explication","player_one_name":"équipe du joueur 1","player_two_name":"équipe du joueur 2","evidence_consistent":true,"reasons":["raison"]};`;

  const textPart = (label: string) => ({
    type: "text",
    text: label
  });

  // ---- Appel Claude + parsing, avec réessais automatiques ----
  // Objectif : le verdict tombe dans les secondes qui suivent la
  // 2e capture. Une erreur passagère de l'API (429/5xx/réseau ou
  // JSON mal formé) relance l'analyse immédiatement, sans laisser
  // le match en attente.
  const MAX_ATTEMPTS = 3;

  const requestVerdict = async (): Promise<Verdict> => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instructions },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: contentType(first.storage_path),
                  data: toBase64(firstBuffer)
                }
              },
              textPart("Capture du joueur 1 ci-dessus."),
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: contentType(second.storage_path),
                  data: toBase64(secondBuffer)
                }
              },
              textPart("Capture du joueur 2 ci-dessus.")
            ]
          }
        ]
      })
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`CLAUDE_ERROR: ${resp.status} ${errTxt.slice(0, 300)}`);
    }

    const data = await resp.json();
    const rawText: string | null =
      data?.content?.map((b: { type: string; text?: string }) =>
        b.type === "text" ? b.text ?? "" : ""
      ).join("") ?? null;

    if (!rawText) throw new Error("EMPTY_AI_RESPONSE");

    // Extraction robuste : retire d'éventuels ```json ... ``` ou texte autour.
    let jsonText = rawText.trim();
    const fenceMatch = jsonText.match(/\{[\s\S]*\}/);
    if (fenceMatch) jsonText = fenceMatch[0];

    try {
      return verdictSchema.parse(JSON.parse(jsonText));
    } catch (e) {
      throw new Error(
        `AI_JSON_PARSE_FAILED: ${(e as Error).message} / contenu: ${rawText.slice(0, 200)}`
      );
    }
  };

  let verdict: Verdict | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      verdict = await requestVerdict();
      break;
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message : "";
      // Clé invalide ou requête refusée : réessayer ne sert à rien.
      const fatal =
        message.startsWith("CLAUDE_ERROR: 401") ||
        message.startsWith("CLAUDE_ERROR: 403") ||
        message.startsWith("CLAUDE_ERROR: 404");
      if (fatal || attempt === MAX_ATTEMPTS) break;
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * 1500)
      );
    }
  }

  if (!verdict) {
    throw lastError instanceof Error
      ? lastError
      : new Error("AI_ANALYSIS_FAILED");
  }

  // Le verdict de Claude est appliqué tel quel : c'est l'IA qui
  // tranche (vainqueur ou match déclaré inachevé si elle juge les
  // preuves inexploitables). La confiance et la cohérence restent
  // enregistrées dans ai_reviews pour traçabilité.

  const { data: finalStatus, error: finalizationError } = await admin.rpc("finalize_match", {
    requested_match_id: matchId,
    requested_verdict: verdict.verdict,
    requested_confidence: verdict.confidence,
    requested_score: verdict.detected_score,
    requested_explanation: verdict.explanation,
    requested_extracted_data: {
      player_one_name: verdict.player_one_name,
      player_two_name: verdict.player_two_name,
      evidence_consistent: verdict.evidence_consistent,
      reasons: verdict.reasons
    },
    requested_model_name: model
  });
  if (finalizationError) throw new Error(`MATCH_FINALIZATION_FAILED: ${finalizationError.message}`);

  return {
    status: typeof finalStatus === "string" ? finalStatus : verdict.verdict === "UNFINISHED" ? "UNFINISHED" : "COMPLETED",
    verdict
  };
}
