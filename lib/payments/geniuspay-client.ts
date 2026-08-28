import "server-only";

import type {
  CreatePayoutInput,
  CreatePaymentInput,
  GeniusPayApiResponse,
  GeniusPayPayment,
  GeniusPayPayout,
  GeniusPayWallet
} from "./geniuspay-types";

// =========================================================
// GOALX — Client HTTP GeniusPay (serveur uniquement).
// La clé API ne quitte jamais le serveur.
//
// Authentification GeniusPay (vérifiée contre l'API) :
//   - une seule clé API (sk_sandbox_... ou sk_live_...)
//     est envoyée dans le header X-API-Key ;
//   - le header X-API-Secret est accepté par l'API mais
//     non vérifié : on l'envoie uniquement s'il est fourni
//     (rétro-compat avec l'ancien modèle pk/sk).
// Le secret de signature webhook (ss_sandbox_...) est géré
// séparément dans geniuspay-webhook.ts.
// =========================================================

const DEFAULT_BASE_URL =
  "https://geniuspay.ci/api/v1/merchant";

type GeniusPayConfig = {
  apiKey: string;
  apiSecret?: string;
  baseUrl: string;
};

function getConfig(): GeniusPayConfig {
  const apiKey = process.env.GENIUSPAY_API_KEY;
  const apiSecret =
    process.env.GENIUSPAY_API_SECRET || undefined;
  const baseUrl =
    process.env.GENIUSPAY_BASE_URL ||
    DEFAULT_BASE_URL;

  if (!apiKey) {
    throw new Error(
      "La variable GENIUSPAY_API_KEY est manquante."
    );
  }

  return { apiKey, apiSecret, baseUrl };
}

export class GeniusPayError extends Error {
  code: string;
  status: number;

  constructor(
    message: string,
    code = "GENIUSPAY_ERROR",
    status = 502
  ) {
    super(message);
    this.name = "GeniusPayError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit
): Promise<T> {
  const config = getConfig();

  const headers: Record<string, string> = {
    "X-API-Key": config.apiKey,
    "Content-Type": "application/json",
    ...(config.apiSecret
      ? { "X-API-Secret": config.apiSecret }
      : {}),
    ...((init.headers as Record<string, string>) ??
      {})
  };

  const response = await fetch(
    `${config.baseUrl}${path}`,
    {
      ...init,
      headers,
      cache: "no-store"
    }
  );

  let payload: GeniusPayApiResponse<T> | null =
    null;

  try {
    payload =
      (await response.json()) as GeniusPayApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    // L'API GeniusPay renvoie l'erreur sous plusieurs formes
    // selon le contexte : error.message, error.errors (Laravel),
    // ou message au niveau racine.
    const errorObj = (
      payload as unknown as {
        error?: {
          message?: string;
          code?: string;
          errors?: Record<string, string[]>;
        };
        message?: string;
      }
    )?.error;

    const fieldErrors = errorObj?.errors
      ? Object.entries(errorObj.errors)
          .map(([field, msgs]) =>
            Array.isArray(msgs)
              ? `${field}: ${msgs.join(", ")}`
              : `${field}: ${String(msgs)}`
          )
          .join(" | ")
      : "";

    const message =
      errorObj?.message ||
      fieldErrors ||
      (payload as unknown as { message?: string })
        ?.message ||
      `GeniusPay a répondu avec le statut ${response.status}.`;

    const code =
      errorObj?.code ||
      "PAYMENT_PROVIDER_ERROR";

    console.error("GOALX_GENIUSPAY_API_ERROR", {
      path,
      status: response.status,
      code,
      message
    });

    throw new GeniusPayError(
      message,
      code,
      response.status
    );
  }

  return payload.data as T;
}

// Crée un paiement. Sans payment_method dans input,
// GeniusPay renvoie une checkout_url (mode recommandé).
export async function createPayment(
  input: CreatePaymentInput
): Promise<GeniusPayPayment> {
  return request<GeniusPayPayment>("/payments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

// Récupère une transaction par sa référence MTX-XXXX.
export async function getPayment(
  reference: string
): Promise<GeniusPayPayment> {
  return request<GeniusPayPayment>(
    `/payments/${encodeURIComponent(reference)}`,
    { method: "GET" }
  );
}

// Liste les fournisseurs mobile money d'un pays.
export async function getProviders(
  country = "CI"
): Promise<unknown> {
  return request<unknown>(
    `/pawapay/providers?country=${encodeURIComponent(country)}`,
    { method: "GET" }
  );
}

// ---------------------------------------------------------
// RETRAITS (PAYOUT / CASHOUT)
// ---------------------------------------------------------

// Liste les portefeuilles marchands GeniusPay. On utilise
// celui de type "api_available" (« API Disponible ») comme
// source des fonds pour les payouts.
export async function getPayoutWallets(): Promise<{
  wallets: GeniusPayWallet[];
}> {
  return request<{ wallets: GeniusPayWallet[] }>(
    "/wallets",
    { method: "GET" }
  );
}

// Crée un payout (envoi d'argent vers un Mobile Money).
export async function createPayout(
  input: CreatePayoutInput
): Promise<GeniusPayPayout> {
  return request<GeniusPayPayout>("/payouts", {
    method: "POST",
    body: JSON.stringify(input)
  });
}
