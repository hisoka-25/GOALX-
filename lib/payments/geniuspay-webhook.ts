import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { GeniusPayWebhookEvent } from "./geniuspay-types";

// =========================================================
// GOALX — Vérification des webhooks GeniusPay.
// Signature attendue :
//   HMAC_SHA256(timestamp + "." + payload_json_brut, secret)
// Le payload doit être le corps JSON BRUT de la requête,
// pas un objet re-sérialisé (l'ordre des clés compte).
// =========================================================

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes

export type WebhookVerification =
  | { valid: true; event: GeniusPayWebhookEvent }
  | { valid: false; reason: string; status: number };

function getWebhookSecret(): string {
  const secret =
    process.env.GENIUSPAY_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      "La variable GENIUSPAY_WEBHOOK_SECRET est manquante."
    );
  }

  return secret;
}

function computeSignature(
  timestamp: string,
  rawBody: string,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function signaturesMatch(
  expected: string,
  provided: string
): boolean {
  const expectedBuffer =
    Buffer.from(expected, "utf8");
  const providedBuffer =
    Buffer.from(provided, "utf8");

  if (
    expectedBuffer.length !==
    providedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    providedBuffer
  );
}

export function verifyWebhookRequest(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): WebhookVerification {
  const { rawBody, signature, timestamp } =
    input;

  if (!signature || !timestamp) {
    return {
      valid: false,
      reason: "En-têtes de signature absents.",
      status: 401
    };
  }

  const unixTimestamp = Number(timestamp);

  if (
    !Number.isFinite(unixTimestamp) ||
    Math.abs(
      Math.floor(Date.now() / 1000) -
        unixTimestamp
    ) > SIGNATURE_TOLERANCE_SECONDS
  ) {
    return {
      valid: false,
      reason: "Timestamp trop ancien ou invalide.",
      status: 400
    };
  }

  const secret = getWebhookSecret();

  const expectedSignature = computeSignature(
    timestamp,
    rawBody,
    secret
  );

  if (
    !signaturesMatch(expectedSignature, signature)
  ) {
    return {
      valid: false,
      reason: "Signature invalide.",
      status: 401
    };
  }

  let event: GeniusPayWebhookEvent;

  try {
    event = JSON.parse(
      rawBody
    ) as GeniusPayWebhookEvent;
  } catch {
    return {
      valid: false,
      reason: "Charge utile JSON invalide.",
      status: 400
    };
  }

  return { valid: true, event };
}

// Traduit un événement webhook GeniusPay en statut Goalx.
// Retourne null pour les événements qui ne modifient pas
// une recharge (ex : webhook.test, payment.initiated).
export function mapWebhookEventToDepositStatus(
  event: GeniusPayWebhookEvent
):
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  | "PROCESSING"
  | null {
  switch (event.event) {
    case "payment.success":
      return "COMPLETED";
    case "payment.failed":
      return "FAILED";
    case "payment.cancelled":
      return "CANCELLED";
    case "payment.expired":
      return "EXPIRED";
    case "payment.initiated":
      return "PROCESSING";
    default:
      return null;
  }
}

// Même logique pour les retraits (payout / cashout).
// completed  => retrait payé ;
// failed     => le portefeuille est recrédité par la RPC.
export function mapWebhookEventToWithdrawalStatus(
  event: GeniusPayWebhookEvent
):
  | "COMPLETED"
  | "FAILED"
  | "PROCESSING"
  | null {
  switch (event.event) {
    case "cashout.completed":
      return "COMPLETED";
    case "cashout.approved":
      // Approuvé mais pas encore envoyé : en cours.
      return "PROCESSING";
    case "cashout.failed":
      return "FAILED";
    case "cashout.requested":
      return "PROCESSING";
    default:
      return null;
  }
}

// Indique si un événement concerne un retrait.
export function isCashoutEvent(
  event: GeniusPayWebhookEvent
): boolean {
  return event.event.startsWith("cashout.");
}
