import {
  NextResponse,
  type NextRequest
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  GeniusPayError,
  getPayment
} from "@/lib/payments/geniuspay-client";
import {
  mapWebhookEventToDepositStatus,
  verifyWebhookRequest
} from "@/lib/payments/geniuspay-webhook";

// =========================================================
// GOALX — Webhook GeniusPay.
// Reçoit les notifications de paiement, vérifie la
// signature, contre-vérifie la transaction auprès de
// GeniusPay, puis crédite le portefeuille via la RPC
// idempotente confirm_deposit (service_role).
// =========================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function ok(message: string) {
  // On répond toujours 200 quand le webhook a été traité
  // (ou ne concerne pas une recharge) pour éviter que
  // GeniusPay ne réessaie inutilement.
  return NextResponse.json({
    success: true,
    received: true,
    message
  });
}

export async function POST(
  request: NextRequest
) {
  // Le corps brut est indispensable : la signature est
  // calculée sur le JSON exact envoyé par GeniusPay.
  const rawBody = await request.text();

  const verification =
    verifyWebhookRequest({
      rawBody,
      signature: request.headers.get(
        "X-Webhook-Signature"
      ),
      timestamp: request.headers.get(
        "X-Webhook-Timestamp"
      )
    });

  if (!verification.valid) {
    console.error(
      "GOALX_WEBHOOK_SIGNATURE_INVALID",
      verification.reason
    );

    return NextResponse.json(
      {
        success: false,
        message: verification.reason
      },
      { status: verification.status }
    );
  }

  const event = verification.event;

  // Événement de test ou événement sans objet transaction.
  if (event.event === "webhook.test") {
    return ok("Événement de test accepté.");
  }

  const reference =
    event.data?.reference ?? null;

  if (!reference) {
    return ok(
      "Événement sans référence de transaction ignoré."
    );
  }

  const targetStatus =
    mapWebhookEventToDepositStatus(event);

  if (!targetStatus) {
    return ok(
      `Événement ${event.event} ignoré pour les recharges.`
    );
  }

  try {
    const admin = createAdminClient();

    // La recharge doit exister chez Goalx.
    const { data: deposit, error: depositError } =
      await admin
        .from("deposits")
        .select(
          "id, user_id, amount, status, geniuspay_reference"
        )
        .eq("geniuspay_reference", reference)
        .maybeSingle();

    if (depositError || !deposit) {
      console.error(
        "GOALX_WEBHOOK_DEPOSIT_NOT_FOUND",
        {
          reference,
          message: depositError?.message
        }
      );

      // 200 pour éviter les boucles de réessai ; l'anomalie
      // est journalisée pour réconciliation manuelle.
      return ok(
        "Aucune recharge ne correspond à cette référence."
      );
    }

    // Idempotence : déjà complétée, on ne retouche rien.
    if (deposit.status === "COMPLETED") {
      return ok("Recharge déjà créditée.");
    }

    // Contre-vérification auprès de GeniusPay : on ne fait
    // jamais confiance au seul contenu du webhook.
    let providerStatus = targetStatus;
    let paymentMethod =
      event.data?.payment_method ??
      event.data?.provider ??
      null;
    let fees =
      typeof event.data?.fees === "number"
        ? Math.round(event.data.fees)
        : null;

    try {
      const payment =
        await getPayment(reference);

      providerStatus = (
        payment.status || targetStatus
      ).toUpperCase() as typeof targetStatus;

      paymentMethod =
        payment.payment_method ||
        payment.payment_provider ||
        payment.gateway ||
        paymentMethod;

      fees =
        typeof payment.fees === "number"
          ? Math.round(payment.fees)
          : fees;

      // Contrôle de cohérence du montant.
      if (
        providerStatus === "COMPLETED" &&
        Number(payment.amount) !==
          Number(deposit.amount)
      ) {
        console.error(
          "GOALX_WEBHOOK_AMOUNT_MISMATCH",
          {
            reference,
            depositAmount: deposit.amount,
            providerAmount: payment.amount
          }
        );

        return NextResponse.json(
          {
            success: false,
            message:
              "Montant incohérent, crédit bloqué."
          },
          { status: 422 }
        );
      }
    } catch (error) {
      if (error instanceof GeniusPayError) {
        // Impossible de vérifier : on demande un réessai.
        return NextResponse.json(
          {
            success: false,
            message:
              "Vérification GeniusPay indisponible."
          },
          { status: 502 }
        );
      }

      throw error;
    }

    const { data: result, error: confirmError } =
      await admin.rpc("confirm_deposit", {
        requested_reference: reference,
        requested_provider_status: providerStatus,
        requested_payment_method: paymentMethod,
        requested_fees: fees,
        requested_provider_payload:
          event.data as unknown as Record<string, unknown>,
        requested_failure_reason:
          providerStatus === "FAILED"
            ? "Paiement refusé par l'opérateur."
            : null
      });

    if (confirmError) {
      console.error(
        "GOALX_WEBHOOK_CONFIRM_ERROR",
        {
          reference,
          message: confirmError.message
        }
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "La confirmation de la recharge a échoué."
        },
        { status: 500 }
      );
    }

    return ok(
      `Recharge traitée : ${String(result)}.`
    );
  } catch (error) {
    console.error(
      "GOALX_WEBHOOK_UNEXPECTED_ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Une erreur inattendue est survenue."
      },
      { status: 500 }
    );
  }
}
