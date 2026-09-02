import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { analyzeMatch } from "@/lib/matches/analyzeMatch";

// =========================================================
// GOALX — Auto-résolution des matchs (appelée quand un
// participant ouvre la salle).
//  - 2 captures reçues -> l'IA lit et tranche (immédiat).
//  - AI_REVIEW -> relance l'analyse (verrou anti-boucle).
//  - délai 5 min dépassé : 1 capture -> forfait ; 0 -> inachevé.
// Idempotent : COMPLETED/UNFINISHED = rien.
// =========================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  if (!matchId || !UUID_REGEX.test(matchId)) {
    return NextResponse.json(
      { success: false, message: "Match invalide." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Non authentifié." },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  const { data: match } = await admin
    .from("matches")
    .select(
      `id, status, winner_id, player_one_id, player_two_id, evidence_deadline`
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json(
      { success: false, message: "Match introuvable." },
      { status: 404 }
    );
  }

  if (
    match.status === "COMPLETED" ||
    match.status === "UNFINISHED" ||
    match.winner_id
  ) {
    return NextResponse.json({ success: true, status: match.status });
  }

  // Compte les captures reçues.
  const { data: evidence } = await admin
    .from("match_evidence")
    .select("user_id")
    .eq("match_id", matchId);

  const evidenceUsers = new Set((evidence ?? []).map((e) => e.user_id));
  const evidenceCount = evidenceUsers.size;

  // ---- LES DEUX captures sont là -> analyse IA ----
  const needsAnalysis =
    match.status === "AI_REVIEW" ||
    (match.status === "WAITING_FOR_EVIDENCE" && evidenceCount >= 2);

  if (needsAnalysis) {
    // Verrou anti-boucle (1 appel IA / min) pour économiser le quota.
    const LOCK_TTL_MS = 60_000;
    const { data: lockRow } = await admin
      .from("matches")
      .select("updated_at")
      .eq("id", matchId)
      .maybeSingle();

    const lastUpdate = lockRow?.updated_at
      ? new Date(lockRow.updated_at).getTime()
      : 0;

    if (
      match.status === "AI_REVIEW" &&
      Date.now() - lastUpdate < LOCK_TTL_MS
    ) {
      return NextResponse.json({
        success: true,
        status: "AI_REVIEW",
        message: "Analyse déjà en cours."
      });
    }

    try {
      // Passe en AI_REVIEW si besoin.
      await admin
        .from("matches")
        .update({
          status: "AI_REVIEW",
          updated_at: new Date().toISOString()
        })
        .eq("id", matchId)
        .in("status", ["WAITING_FOR_EVIDENCE", "AI_REVIEW"]);

      await analyzeMatch(matchId);

      const { data: after } = await admin
        .from("matches")
        .select("status, winner_id")
        .eq("id", matchId)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        status: after?.status ?? "COMPLETED"
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur inconnue.";
      console.error("GOALX_AUTORESOLVE_IA_ERROR", message);
      // L'admin peut trancher manuellement pendant que l'IA échoue.
      return NextResponse.json({
        success: true,
        status: "AI_REVIEW",
        message
      });
    }
  }

  // ---- FORFAIT après 5 min (WAITING_FOR_EVIDENCE, < 2 captures) ----
  if (match.status === "WAITING_FOR_EVIDENCE") {
    const deadline = match.evidence_deadline
      ? new Date(match.evidence_deadline).getTime()
      : null;

    if (deadline && Date.now() < deadline) {
      return NextResponse.json({ success: true, status: match.status });
    }

    if (evidenceCount === 1) {
      const onlyUser = (evidence ?? [])[0].user_id;
      try {
        await admin.rpc("apply_match_verdict", {
          requested_match_id: matchId,
          requested_winner_id: onlyUser,
          requested_reason:
            "Vainqueur par forfait : l'adversaire n'a pas envoyé sa capture dans les 5 minutes."
        });
      } catch (e) {
        console.error("GOALX_FORFAIT_ERROR", e);
      }
      return NextResponse.json({ success: true, status: "COMPLETED" });
    }

    if (evidenceCount === 0) {
      try {
        await admin.rpc("finalize_match", {
          requested_match_id: matchId,
          requested_verdict: "UNFINISHED",
          requested_confidence: 1,
          requested_score: null,
          requested_explanation:
            "Aucune capture envoyée dans le délai. Mises restituées.",
          requested_extracted_data: { method: "AUTO_TIMEOUT" },
          requested_model_name: "GOALX_AUTO"
        });
      } catch (e) {
        console.error("GOALX_UNFINISHED_ERROR", e);
      }
      return NextResponse.json({ success: true, status: "UNFINISHED" });
    }
  }

  return NextResponse.json({ success: true, status: match.status });
}
