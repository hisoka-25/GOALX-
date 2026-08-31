import "server-only";

import type {
  JekoContact,
  JekoPayment,
  JekoPaymentMethod,
  JekoPaymentRequest,
  JekoTransfer,
  JekoTransferRequest
} from "./jeko-types";

const BASE_URL =
  process.env.JEKO_BASE_URL || "https://api.jeko.africa";

export class JekoError extends Error {
  code: string;
  status: number;

  constructor(
    message: string,
    code: string = "JEKO_ERROR",
    status: number = 502
  ) {
    super(message);
    this.name = "JekoError";
    this.code = code;
    this.status = status;
  }
}

function getConfig() {
  const apiKey = process.env.JEKO_API_KEY;
  const apiKeyId = process.env.JEKO_API_KEY_ID;
  const storeId = process.env.JEKO_STORE_ID;

  if (!apiKey || !apiKeyId || !storeId) {
    throw new JekoError(
      "Jèko n'est pas configuré (clés ou magasin manquants).",
      "JEKO_NOT_CONFIGURED"
    );
  }

  return { apiKey, apiKeyId, storeId };
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const config = getConfig();

  const response = await fetch(`${BASE_URL}/partner_api${path}`, {
    ...init,
    headers: {
      "X-API-KEY": config.apiKey,
      "X-API-KEY-ID": config.apiKeyId,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) ?? {})
    },
    cache: "no-store"
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = payload as {
      id?: string;
      message?: string;
      extras?: string;
    } | null;

    const message =
      err?.message ||
      err?.extras ||
      `Jèko a répondu avec le statut ${response.status}.`;
    const code = err?.id || "JEKO_PROVIDER_ERROR";

    console.error("GOALX_JEKO_API_ERROR", {
      path,
      status: response.status,
      code,
      message
    });

    throw new JekoError(message, code, response.status);
  }

  return payload as T;
}

// ---------- Encaissement (pay-in) ----------

// Crée une demande de paiement et retourne l'URL de checkout Jèko.
export async function createPayment(
  input: JekoPaymentRequest
): Promise<JekoPayment> {
  const { storeId } = getConfig();

  // Jèko exprime les montants en centimes (XOF * 100).
  const amountCents = Math.round(input.amountCents);

  const body: Record<string, unknown> = {
    storeId,
    amountCents,
    currency: input.currency || "XOF",
    reference: input.reference,
    paymentDetails: {
      type: "redirect",
      data: {
        ...(input.paymentMethod
          ? { paymentMethod: input.paymentMethod }
          : {}),
        successUrl: input.successUrl,
        errorUrl: input.errorUrl
      }
    }
  };

  if (input.description) body.description = input.description;
  if (input.customerName || input.customerPhone || input.customerEmail) {
    body.customer = {
      ...(input.customerName ? { name: input.customerName } : {}),
      ...(input.customerPhone ? { phone: input.customerPhone } : {}),
      ...(input.customerEmail ? { email: input.customerEmail } : {})
    };
  }

  return request<JekoPayment>("/payment_requests", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

// ---------- Contacts bénéficiaires (pour les transferts) ----------

export async function findOrCreateContact(params: {
  name: string;
  phone: string;
  paymentMethod: JekoPaymentMethod;
}): Promise<string> {
  // On liste les contacts existants pour réutiliser celui qui correspond.
  const contacts = await request<JekoContact[]>("/contacts", {
    method: "GET"
  });

  const normalized = params.phone.replace(/[\s-]/g, "");
  const existing = contacts.find((c) => {
    const number =
      (c as unknown as { identifier?: { number?: string } })?.identifier
        ?.number || "";
    return (
      number.replace(/[\s-]/g, "") === normalized &&
      c.paymentMethod === params.paymentMethod
    );
  });

  if (existing?.id || existing?.contactId) {
    return (existing.id || existing.contactId) as string;
  }

  const created = await request<JekoContact>("/contacts", {
    method: "POST",
    body: JSON.stringify({
      name: params.name,
      paymentMethod: params.paymentMethod,
      identifier: { number: params.phone }
    })
  });

  const id = created.id || created.contactId;
  if (!id) {
    throw new JekoError(
      "Jèko n'a pas retourné d'identifiant de contact.",
      "JEKO_NO_CONTACT_ID"
    );
  }

  return id;
}

// ---------- Reversement (pay-out) ----------

export async function getStoreBalance(): Promise<{
  available?: number;
  [key: string]: unknown;
}> {
  const { storeId } = getConfig();
  return request(`/stores/${storeId}/balance`, { method: "GET" });
}

export async function createTransfer(
  input: JekoTransferRequest
): Promise<JekoTransfer> {
  const { storeId } = getConfig();

  const body = {
    storeId,
    contactId: input.contactId,
    amountCents: Math.round(input.amountCents),
    currency: input.currency || "XOF",
    reference: input.reference,
    description: input.narration || "Retrait GOALX"
  };

  return request<JekoTransfer>("/transfers", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
