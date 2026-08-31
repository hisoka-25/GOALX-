import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Filet de sécurité : quand le joueur revient après paiement (ou via la
// page de retour), on interroge l'état de la recharge en base. Si elle est
// encore PENDING/PROCESSING, le client peut re-poll cette route pour se
// synchroniser (le webhook Jèko crédite normalement, mais on ne se fie
// jamais qu'au retour du client).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: depositId } = await params;

  if (!depositId || !UUID_REGEX.test(depositId)) {
    return NextResponse.json(
      { success: false, deposit: null },
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

  const { data: deposit } = await supabase
    .from("deposits")
    .select("id, status, amount")
    .eq("id", depositId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!deposit) {
    return NextResponse.json(
      { success: false, deposit: null },
      { status: 404 }
    );
  }

  // Si le webhook n'a pas encore crédité, on tente une confirmation
  // via la référence Jèko stockée (service_role) — au cas où le webhook
  // serait en retard. On lit d'abord la référence.
  if (
    deposit.status === "PENDING" ||
    deposit.status === "PROCESSING"
  ) {
    const admin = createAdminClient();

    const { data: full } = await admin
      .from("deposits")
      .select("geniuspay_reference, provider")
      .eq("id", depositId)
      .maybeSingle();

    // La confirmation définitive reste du ressort du webhook signé ;
    // ici on ne fait que renvoyer l'état courant pour le polling.
    void full;
  }

  return NextResponse.json({
    success: true,
    deposit: {
      id: deposit.id,
      status: deposit.status,
      amount: Number(deposit.amount)
    }
  });
}
