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
export const maxDuration = 60;

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

  // ---- LITIGE (AI_REVIEW) : l'IA tranche si sa clé existe ----
  // Sans clé Anthropic, le match reste visible côté /admin :
  // l'administrateur tranche manuellement.
  if (match.status === "AI_REVIEW") {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        success: true,
        status: "AI_REVIEW",
        message: "Verdict administrateur en attente."
      });
    }

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

    if (Date.now() - lastUpdate < LOCK_TTL_MS) {
      return NextResponse.json({
        success: true,
        status: "AI_REVIEW",
        message: "Analyse déjà en cours."
      });
    }

    try {
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

  // ---- DÉLAI EXPIRÉ (WAITING_FOR_EVIDENCE) : verdict SQL ----
  // Logique centralisée dans resolve_expired_match :
  //   0 capture → inachevé (mises restituées) ;
  //   1 capture → forfait (ou victoire déclarée par l'adversaire) ;
  //   2 captures → concordance tardive, sinon arbitrage IA/admin.
  if (match.status === "WAITING_FOR_EVIDENCE") {
    const deadline = match.evidence_deadline
      ? new Date(match.evidence_deadline).getTime()
      : null;

    if (deadline && Date.now() >= deadline) {
      try {
        const { data: resolvedStatus } = await admin.rpc(
          "resolve_expired_match",
          { requested_match_id: matchId }
        );

        return NextResponse.json({
          success: true,
          status:
            typeof resolvedStatus === "string"
              ? resolvedStatus
              : match.status
        });
      } catch (e) {
        console.error("GOALX_EXPIRED_RESOLVE_ERROR", e);
      }
    }

    return NextResponse.json({ success: true, status: match.status });
  }

  return NextResponse.json({ success: true, status: match.status });
}
