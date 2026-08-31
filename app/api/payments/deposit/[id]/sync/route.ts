import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Filet de sécurité : quand le joueur revient sur la page de retour après
// paiement, le client interroge cette route. Si le dépôt est encore
// PENDING/PROCESSING (webhook Jèko en retard), on force sa confirmation
// via la fonction idempotente. Le webhook signé reste la source principale.

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

  // Le webhook Jèko crédite normalement. Au retour du joueur (page de
  // succès), on force la confirmation par l'ID interne du dépôt : c'est
  // 100 % fiable et idempotent (aucun double crédit), même si le webhook
  // n'a pas transmis notre référence.
  if (
    deposit.status === "PENDING" ||
    deposit.status === "PROCESSING"
  ) {
    const admin = createAdminClient();

    await admin.rpc("confirm_deposit_by_id", {
      requested_deposit_id: depositId
    });

    // On relit l'état après confirmation.
    const { data: after } = await admin
      .from("deposits")
      .select("id, status, amount")
      .eq("id", depositId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      deposit: {
        id: after?.id ?? deposit.id,
        status: after?.status ?? deposit.status,
        amount: Number(after?.amount ?? deposit.amount)
      }
    });
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
