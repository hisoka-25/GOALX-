import "server-only";

import type {
  CreatePaymentInput,
  GeniusPayApiResponse,
  GeniusPayPayment
} from "./geniuspay-types";

// =========================================================
// GOALX — Client HTTP GeniusPay (serveur uniquement).
// La clé secrète ne quitte jamais le serveur.
// =========================================================

const DEFAULT_BASE_URL =
  "https://geniuspay.ci/api/v1/merchant";

type GeniusPayConfig = {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
};

function getConfig(): GeniusPayConfig {
  const apiKey = process.env.GENIUSPAY_API_KEY;
  const apiSecret =
    process.env.GENIUSPAY_API_SECRET;
  const baseUrl =
    process.env.GENIUSPAY_BASE_URL ||
    DEFAULT_BASE_URL;

  if (!apiKey || !apiSecret) {
    throw new Error(
      "Les variables GENIUSPAY_API_KEY et " +
        "GENIUSPAY_API_SECRET sont manquantes."
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

  const response = await fetch(
    `${config.baseUrl}${path}`,
    {
      ...init,
      headers: {
        "X-API-Key": config.apiKey,
        "X-API-Secret": config.apiSecret,
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      },
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
    const message =
      payload?.error?.message ||
      `GeniusPay a répondu avec le statut ${response.status}.`;

    const code =
      payload?.error?.code ||
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
