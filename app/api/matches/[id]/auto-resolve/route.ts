import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { analyzeMatch } from "@/lib/matches/analyzeMatch";

// =========================================================
// GOALX — Auto-résolution des matchs (appelée quand un
// participant ouvre la salle de match).
//  - DISPUTED        : l'IA lit les captures et tranche.
//  - WAITING_EVIDENCE + délai 5 min dépassé :
//      * 1 joueur a soumis -> forfait en sa faveur ;
//      * 0 ou 2 -> géré ailleurs (2 = concordance déjà faite).
// Idempotent : si le match est COMPLETED, on ne touche rien.
// =========================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FIVE_MIN_MS = 5 * 60 * 1000;

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
  if (match.status === "COMPLETED" || match.winner_id) {
    return NextResponse.json({ success: true, status: match.status });
  }

  // ---- Cas 1 : LITIGE -> l'IA tranche ----
  if (match.status === "DISPUTED") {
    try {
      const result = await analyzeMatch(matchId);

      const verdict = result?.verdict?.verdict;

      if (verdict === "PLAYER_ONE_WON") {
        await admin.rpc("apply_match_verdict", {
          requested_match_id: matchId,
          requested_winner_id: match.player_one_id,
          requested_reason:
            "Verdict automatique par analyse IA des captures (litige)."
        });
        return NextResponse.json({ success: true, status: "COMPLETED" });
      }

      if (verdict === "PLAYER_TWO_WON") {
        await admin.rpc("apply_match_verdict", {
          requested_match_id: matchId,
          requested_winner_id: match.player_two_id,
          requested_reason:
            "Verdict automatique par analyse IA des captures (litige)."
        });
        return NextResponse.json({ success: true, status: "COMPLETED" });
      }

      // L'IA n'a pas pu conclure (UNFINISHED / confiance faible) :
      // on reste en litige, l'admin pourra exceptionnellement trancher.
      return NextResponse.json({
        success: true,
        status: "DISPUTED",
        message: "Analyse IA non concluante."
      });
    } catch (error) {
      console.error("GOALX_AUTORESOLVE_IA_ERROR", error);
      return NextResponse.json({
        success: false,
        status: "DISPUTED",
        message: "Erreur d'analyse IA."
      });
    }
  }

  // ---- Cas 2 : FORFAIT après 5 minutes ----
  if (match.status === "WAITING_EVIDENCE") {
    const deadline = match.evidence_deadline
      ? new Date(match.evidence_deadline).getTime()
      : null;

    if (deadline && Date.now() < deadline) {
      // Pas encore dépassé.
      return NextResponse.json({ success: true, status: match.status });
    }

    // Délai dépassé : qui a soumis score + capture ?
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
      // Un seul a soumis dans les temps -> forfait, il gagne.
      await admin.rpc("apply_match_verdict", {
        requested_match_id: matchId,
        requested_winner_id: submitted[0].reporter_id,
        requested_reason:
          "Vainqueur par forfait : l'adversaire n'a pas soumis son résultat dans les 5 minutes."
      });
      return NextResponse.json({ success: true, status: "COMPLETED" });
    }

    if (submitted.length === 0) {
      // Aucun n'a soumi -> match annulé (pas de vainqueur, pas de gain).
      await admin
        .from("matches")
        .update({
          status: "CANCELLED",
          updated_at: new Date().toISOString()
        })
        .eq("id", matchId);

      return NextResponse.json({ success: true, status: "CANCELLED" });
    }

    // Deux soumissions mais pas réglé -> c'est un litige : on bascule DISPUTED.
    await admin
      .from("matches")
      .update({ status: "DISPUTED" })
      .eq("id", matchId);

    return NextResponse.json({ success: true, status: "DISPUTED" });
  }

  return NextResponse.json({ success: true, status: match.status });
}
