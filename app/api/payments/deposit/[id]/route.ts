import {
  NextResponse,
  type NextRequest
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPayment } from "@/lib/payments/geniuspay-client";

// =========================================================
// GOALX — Statut d'une recharge + synchronisation.
// Utilisée par la page de retour de paiement pour :
//   1. afficher l'état de la recharge ;
//   2. déclencher une contre-vérification GeniusPay si le
//      webhook tarde (filet de sécurité, notamment en local
//      où aucun webhook public ne peut atteindre l'app).
// GET /api/payments/deposit/{id}?sync=1
// =========================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  context: Context
) {
  const { id } = await context.params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { success: false, message: "Identifiant invalide." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Session expirée." },
      { status: 401 }
    );
  }

  // Lecture via RLS : l'utilisateur ne voit que SES recharges.
  const { data: deposit, error } = await supabase
    .from("deposits")
    .select(
      "id, amount, status, geniuspay_reference, payment_method, created_at, completed_at"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !deposit) {
    return NextResponse.json(
      { success: false, message: "Recharge introuvable." },
      { status: 404 }
    );
  }

  const shouldSync =
    request.nextUrl.searchParams.get("sync") === "1";

  // Synchronisation de secours : si la recharge est encore en
  // attente et qu'on connaît la référence GeniusPay, on
  // interroge GeniusPay et on applique le statut si nécessaire.
  if (
    shouldSync &&
    deposit.geniuspay_reference &&
    (deposit.status === "PENDING" ||
      deposit.status === "PROCESSING")
  ) {
    try {
      const payment = await getPayment(
        deposit.geniuspay_reference
      );

      const providerStatus = (
        payment.status || ""
      ).toUpperCase();

      if (
        ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(
          providerStatus
        )
      ) {
        const admin = createAdminClient();

        // Garde-fou montant avant tout crédit.
        if (
          providerStatus === "COMPLETED" &&
          Number(payment.amount) !==
            Number(deposit.amount)
        ) {
          console.error(
            "GOALX_DEPOSIT_SYNC_AMOUNT_MISMATCH",
            {
              depositId: deposit.id,
              depositAmount: deposit.amount,
              providerAmount: payment.amount
            }
          );
        } else {
          await admin.rpc("confirm_deposit", {
            requested_reference:
              deposit.geniuspay_reference,
            requested_provider_status: providerStatus,
            requested_payment_method:
              payment.payment_method ||
              payment.payment_provider ||
              payment.gateway ||
              null,
            requested_fees:
              typeof payment.fees === "number"
                ? Math.round(payment.fees)
                : null,
            requested_provider_payload: payment as unknown as Record<
              string,
              unknown
            >,
            requested_failure_reason:
              providerStatus === "FAILED"
                ? "Paiement refusé par l'opérateur."
                : null
          });

          // Relecture du statut après synchronisation.
          const { data: refreshed } = await supabase
            .from("deposits")
            .select("status, payment_method, completed_at")
            .eq("id", id)
            .maybeSingle();

          if (refreshed) {
            return NextResponse.json({
              success: true,
              deposit: {
                ...deposit,
                status: refreshed.status,
                payment_method:
                  refreshed.payment_method ??
                  deposit.payment_method,
                completed_at:
                  refreshed.completed_at ??
                  deposit.completed_at
              }
            });
          }
        }
      }
    } catch (syncError) {
      // En cas d'échec de synchro, on renvoie le statut connu
      // sans faire échouer la page.
      console.error(
        "GOALX_DEPOSIT_SYNC_ERROR",
        syncError
      );
    }
  }

  return NextResponse.json({
    success: true,
    deposit
  });
}
