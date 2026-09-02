import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

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

function dataUrl(buffer: ArrayBuffer, type: string) {
  return `data:${type};base64,${Buffer.from(buffer).toString("base64")}`;
}

export async function analyzeMatch(matchId: string): Promise<{ status: string; verdict: Verdict }> {
  // Moteur de lecture : Google Gemini (gratuit, vision) en priorité,
  // repli OpenAI si une clé est fournie.
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openaiKey) throw new Error("NO_VISION_API_KEY");

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

  let rawText: string | null = null;

  if (geminiKey) {
    // ---- Google Gemini (gratuit, vision) ----
    const model = process.env.GEMINI_VISION_MODEL ?? "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: instructions },
            { inline_data: { mime_type: contentType(first.storage_path), data: dataUrl(firstBuffer, contentType(first.storage_path)).split(",")[1] } },
            { text: "Capture du joueur 1 (ci-dessus). Capture du joueur 2 (ci-dessous)." },
            { inline_data: { mime_type: contentType(second.storage_path), data: dataUrl(secondBuffer, contentType(second.storage_path)).split(",")[1] } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        response_mime_type: "application/json",
        maxOutputTokens: 1200
      }
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`GEMINI_ERROR: ${resp.status} ${errTxt.slice(0, 300)}`);
    }

    const json = await resp.json();
    rawText =
      json?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? "")
        .join("") ?? null;
  } else if (openaiKey) {
    // ---- OpenAI (repli, payant) ----
    const openai = new OpenAI({ apiKey: openaiKey });
    const response = await openai.responses.create({
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: instructions },
          { type: "input_text", text: "Capture du joueur 1" },
          { type: "input_image", image_url: dataUrl(firstBuffer, contentType(first.storage_path)), detail: "high" },
          { type: "input_text", text: "Capture du joueur 2" },
          { type: "input_image", image_url: dataUrl(secondBuffer, contentType(second.storage_path)), detail: "high" }
        ]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "goalx_match_verdict",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              verdict: { type: "string", enum: ["PLAYER_ONE_WON", "PLAYER_TWO_WON", "UNFINISHED"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              detected_score: { type: "string" },
              explanation: { type: "string" },
              player_one_name: { type: "string" },
              player_two_name: { type: "string" },
              evidence_consistent: { type: "boolean" },
              reasons: { type: "array", items: { type: "string" } }
            },
            required: ["verdict", "confidence", "detected_score", "explanation", "player_one_name", "player_two_name", "evidence_consistent", "reasons"]
          }
        }
      },
      max_output_tokens: 1200
    });
    rawText = response.output_text;
  }

  if (!rawText) throw new Error("EMPTY_AI_RESPONSE");

  // Extraction robuste : retire d'éventuels ```json ... ``` ou texte autour.
  let jsonText = rawText.trim();
  const fenceMatch = jsonText.match(/\{[\s\S]*\}/);
  if (fenceMatch) jsonText = fenceMatch[0];

  let verdict: Verdict;
  try {
    verdict = verdictSchema.parse(JSON.parse(jsonText));
  } catch (e) {
    throw new Error(
      `AI_JSON_PARSE_FAILED: ${(e as Error).message} / contenu: ${rawText.slice(0, 200)}`
    );
  }

  if (!verdict.evidence_consistent || verdict.confidence < 0.9) {
    verdict = {
      ...verdict,
      verdict: "UNFINISHED" as Verdict["verdict"],
      explanation: `Confiance insuffisante ou preuves incohérentes. ${verdict.explanation}`
    };
  }

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
    requested_model_name: geminiKey ? (process.env.GEMINI_VISION_MODEL ?? "gemini-3.6-flash") : (process.env.OPENAI_VISION_MODEL ?? "gpt-4.1-mini")
  });
  if (finalizationError) throw new Error(`MATCH_FINALIZATION_FAILED: ${finalizationError.message}`);

  return {
    status: typeof finalStatus === "string" ? finalStatus : verdict.verdict === "UNFINISHED" ? "UNFINISHED" : "COMPLETED",
    verdict
  };
  }
