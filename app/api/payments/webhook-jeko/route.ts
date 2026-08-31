import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  JekoWebhookTransaction
} from "@/lib/payments/jeko-types";

// =========================================================
// GOALX — Webhook Jèko.
// Reçoit les notifications de paiement ET de transfert.
// Signature : en-tête `Jeko-Signature` = HMAC-SHA256 du corps
// brut en hexadécimal minuscule, sans horodatage.
// =========================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Le corps brut est nécessaire pour vérifier la signature.
export const fetchCache = "force-no-store";

function verifyJekoSignature(
  rawBody: string,
  signature: string | null
): boolean {
  const secret = process.env.JEKO_WEBHOOK_SECRET;

  if (!secret || !signature) {
    return false;
  }

  const crypto = require("node:crypto");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature.trim().toLowerCase(), "hex")
    );
  } catch {
    return expected === signature.trim().toLowerCase();
  }
}

export async function POST(
  request: Request
) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("Jeko-Signature") ||
    request.headers.get("jeko-signature");

  if (!verifyJekoSignature(rawBody, signature)) {
    console.error(
      "GOALX_WEBHOOK_JEKO_INVALID_SIGNATURE"
    );
    return NextResponse.json(
      { success: false, message: "Signature invalide." },
      { status: 401 }
    );
  }

  let event:
    | JekoWebhookTransaction
    | { event?: string; payload?: unknown }
    | null = null;

  try {
    event = JSON.parse(rawBody);
  } catch {
    event = null;
  }

  if (!event) {
    return NextResponse.json(
      { success: false, message: "Charge utile invalide." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  try {
    // Enveloppe éventuelle (service provider) : on extrait la transaction.
    const tx = (
      "event" in event && event.payload
        ? event.payload
        : event
    ) as JekoWebhookTransaction;

    const status = String(tx.status || "").toLowerCase();
    const reference =
      tx.transactionDetails?.reference || undefined;
    const txType = String(
      tx.transactionType || ""
    );

    // ---- Paiement (dépôt) ----
    if (
      reference &&
      reference.startsWith("GOALX-DEP-")
    ) {
      const depositId = reference.replace(
        "GOALX-DEP-",
        ""
      );

      if (status === "success" || status === "completed") {
        await admin.rpc("confirm_deposit", {
          reference: tx.id || reference,
          provider_status: tx.status,
          payment_method: tx.paymentMethod ?? "jeko"
        });

        // Si le dépôt n'est pas lié par référence Jèko, on tente par l'ID interne.
        const { data } = await admin
          .from("deposits")
          .select("id, status")
          .eq("id", depositId)
          .maybeSingle();

        if (data && data.status !== "COMPLETED") {
          await admin
            .from("deposits")
            .update({
              status: "COMPLETED",
              provider: "jeko",
              geniuspay_reference:
                tx.id || reference,
              completed_at: new Date().toISOString()
            })
            .eq("id", depositId);

          await admin.rpc("confirm_deposit", {
            reference: String(depositId),
            provider_status: "COMPLETED",
            payment_method: tx.paymentMethod ?? "jeko"
          });
        }
      }

      return NextResponse.json({ success: true });
    }

    // ---- Transfert (retrait) ----
    if (
      reference &&
      reference.startsWith("GOALX-WTH-")
    ) {
      const withdrawalId = reference.replace(
        "GOALX-WTH-",
        ""
      );

      if (status === "success" || status === "completed") {
        await admin.rpc("confirm_withdrawal", {
          reference: tx.id || reference,
          provider_status: tx.status
        });
      } else if (
        status === "error" ||
        status === "failed"
      ) {
        await admin.rpc("fail_withdrawal", {
          requested_withdrawal_id: withdrawalId,
          requested_reason:
            "Le transfert Jèko a échoué."
        });
      }

      return NextResponse.json({ success: true });
    }

    // Événement non lié à Goalx : on accuse réception.
    console.log(
      "GOALX_WEBHOOK_JEKO_IGNORED",
      { reference, txType, status }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "GOALX_WEBHOOK_JEKO_UNEXPECTED_ERROR",
      error
    );

    return NextResponse.json(
      { success: false, message: "Une erreur est survenue." },
      { status: 500 }
    );
  }
}
