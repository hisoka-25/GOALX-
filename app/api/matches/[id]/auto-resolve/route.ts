import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { analyzeMatch } from "@/lib/matches/analyzeMatch";

// =========================================================
// GOALX — Auto-résolution des matchs (appelée quand un
// participant ouvre la salle de match).
//  - AI_REVIEW : l'IA lit les captures et finalise ELLE-MÊME
//    (analyzeMatch appelle finalize_match qui crédite + commission).
//  - WAITING_FOR_EVIDENCE + délai 5 min dépassé :
//      * 1 joueur a soumis -> forfait en sa faveur ;
//      * 0 -> annulation.
// Idempotent : si le match est COMPLETED/UNFINISHED, rien.
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
      `id, status, winner_id, player_one_id, player_two_id,
       evidence_deadline, created_at`
    )
    .eq("id", matchId)
    .maybeSingle();

  if (!match) {
    return NextResponse.json(
      { success: false, message: "Match introuvable." },
      { status: 404 }
    );
  }

  // Déjà réglé : rien à faire.
  if (match.status === "COMPLETED" || match.status === "UNFINISHED" || match.winner_id) {
    return NextResponse.json({ success: true, status: match.status });
  }

  // ---- Cas 1 : LITIGE (AI_REVIEW) -> l'IA finalise elle-même. ----
  if (match.status === "AI_REVIEW") {
    try {
      const result = await analyzeMatch(matchId);

      const { data: after } = await admin
        .from("matches")
        .select("status, winner_id")
        .eq("id", matchId)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        status: after?.status ?? result?.status ?? "AI_REVIEW",
        verdict: result?.verdict?.verdict ?? null
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erreur inconnue.";
      console.error("GOALX_AUTORESOLVE_IA_ERROR", message);
      return NextResponse.json({
        success: true,
        status: "AI_REVIEW",
        message
      });
    }
  }

  // ---- Cas 2 : FORFAIT après 5 minutes. ----
  if (match.status === "WAITING_FOR_EVIDENCE") {
    const deadline = match.evidence_deadline
      ? new Date(match.evidence_deadline).getTime()
      : null;

    if (deadline && Date.now() < deadline) {
      return NextResponse.json({ success: true, status: match.status });
    }

    const { data: reports } = await admin
      .from("match_score_reports")
      .select("reporter_id, winner_id")
      .eq("match_id", matchId);

    const { data: evidence } = await admin
      .from("match_evidence")
      .select("user_id")
      .eq("match_id", matchId);

    const evidenceUsers = new Set(
      (evidence ?? []).map((e) => e.user_id)
    );

    const submitted = (reports ?? []).filter((r) =>
      evidenceUsers.has(r.reporter_id)
    );

    if (submitted.length === 1) {
      await admin.rpc("apply_match_verdict", {
        requested_match_id: matchId,
        requested_winner_id: submitted[0].reporter_id,
        requested_reason:
          "Vainqueur par forfait : l'adversaire n'a pas soumis son résultat dans les 5 minutes."
      });
      return NextResponse.json({ success: true, status: "COMPLETED" });
    }

    if (submitted.length === 0) {
      // Aucun joueur n'a soumis : match inachevé, on rend les mises.
      try {
        await admin.rpc("finalize_match", {
          requested_match_id: matchId,
          requested_verdict: "UNFINISHED",
          requested_confidence: 1,
          requested_score: null,
          requested_explanation:
            "Aucun résultat soumis dans le délai de 5 minutes. Mises restituées.",
          requested_extracted_data: {
            method: "AUTO_TIMEOUT"
          },
          requested_model_name: "GOALX_AUTO"
        });
      } catch (e) {
        console.error("GOALX_AUTORESOLVE_UNFINISHED_ERROR", e);
      }

      return NextResponse.json({ success: true, status: "UNFINISHED" });
    }

    // Deux soumissions mais pas réglé -> passe en litige IA.
    await admin
      .from("matches")
      .update({ status: "AI_REVIEW" })
      .eq("id", matchId);

    return NextResponse.json({ success: true, status: "AI_REVIEW" });
  }

  return NextResponse.json({ success: true, status: match.status });
}
