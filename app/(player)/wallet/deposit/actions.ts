"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  JekoError,
  createPayment
} from "@/lib/payments/jeko-client";

// =========================================================
// GOALX — Action serveur : initier une recharge via Jèko.
// 1. On crée la recharge en base (PENDING) via RPC sécurisée.
// 2. On crée la transaction chez Jèko (checkout redirigé).
// 3. On attache la référence Jèko à la recharge.
// 4. On renvoie l'URL de checkout au client pour redirection.
// =========================================================

export type DepositState = {
  success: boolean;
  message: string;
  checkoutUrl: string | null;
};

const MIN_DEPOSIT = 500;
const MAX_DEPOSIT = 500_000;
const DEPOSIT_STEP = 500;

function getErrorMessage(
  errorMessage: string
): string {
  const normalized =
    errorMessage.toUpperCase();

  if (
    normalized.includes("AUTHENTICATION_REQUIRED")
  ) {
    return "Ta session a expiré. Reconnecte-toi.";
  }

  if (normalized.includes("INVALID_DEPOSIT_AMOUNT")) {
    return "Le montant doit être au moins 500 FCFA, par palier de 500.";
  }

  if (normalized.includes("WALLET_NOT_FOUND")) {
    return "Ton portefeuille est introuvable.";
  }

  if (normalized.includes("PROFILE_NOT_FOUND")) {
    return "Ton profil GOALX est introuvable.";
  }

  return "Impossible de démarrer le paiement. Réessaie dans quelques instants.";
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(
      /\/$/,
      ""
    ) || "http://localhost:3000"
  );
}

export async function initiateDepositAction(
  _previousState: DepositState,
  formData: FormData
): Promise<DepositState> {
  const amountValue = formData.get("amount");
  const methodValue = formData.get("method");

  const amount =
    typeof amountValue === "string"
      ? Number(amountValue)
      : Number.NaN;

  // Jèko exige le moyen de paiement. Par défaut Wave.
  const allowedMethods = [
    "wave",
    "orange",
    "orange_money",
    "mtn",
    "moov",
    "djamo",
    "card"
  ];
  const method =
    typeof methodValue === "string" &&
    allowedMethods.includes(methodValue.trim().toLowerCase())
      ? (methodValue.trim().toLowerCase() as
          | "wave"
          | "orange"
          | "orange_money"
          | "mtn"
          | "moov"
          | "djamo"
          | "card")
      : "wave";
  // Jèko utilise "orange_money" pour Orange.
  const jekoMethod =
    method === "orange" ? ("orange_money" as const) : method;

  if (
    !Number.isSafeInteger(amount) ||
    amount < MIN_DEPOSIT ||
    amount > MAX_DEPOSIT ||
    amount % DEPOSIT_STEP !== 0
  ) {
    return {
      success: false,
      message:
        "Choisis un montant valide : entre 500 et 500 000 FCFA, par palier de 500.",
      checkoutUrl: null
    };
  }

  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message:
        "Ta session a expiré. Reconnecte-toi.",
      checkoutUrl: null
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, efootball_username")
    .eq("id", user.id)
    .maybeSingle();

  // 1. Création de la recharge en base (RPC SECURITY DEFINER).
  const {
    data: depositId,
    error: depositError
  } = await supabase.rpc("initiate_deposit", {
    requested_amount: amount
  });

  if (depositError || !depositId) {
    return {
      success: false,
      message: depositError
        ? getErrorMessage(depositError.message)
        : "Impossible de créer la recharge.",
      checkoutUrl: null
    };
  }

  // 2. Création de la transaction chez Jèko.
  try {
    const appUrl = getAppUrl();

    // Jèko exprime les montants en centimes (montant * 100).
    const payment = await createPayment({
      amountCents: amount * 100,
      currency: "XOF",
      reference: `GOALX-DEP-${depositId}`,
      description: `Recharge portefeuille GOALX — ${amount} FCFA`,
      paymentMethod: jekoMethod,
      customerName:
        profile?.efootball_username ||
        profile?.username ||
        undefined,
      customerEmail: user.email || undefined,
      successUrl: `${appUrl}/wallet/deposit/return?deposit=${depositId}&result=success`,
      errorUrl: `${appUrl}/wallet/deposit/return?deposit=${depositId}&result=error`
    });

    // 3. Attache de la référence Jèko (service_role).
    const admin = createAdminClient();

    await admin
      .from("deposits")
      .update({
        geniuspay_reference: payment.id,
        provider: "jeko",
        updated_at: new Date().toISOString()
      })
      .eq("id", depositId);

    const redirectUrl = payment.redirectUrl;

    if (!redirectUrl) {
      return {
        success: false,
        message:
          "Le prestataire de paiement n'a pas renvoyé de lien de paiement.",
        checkoutUrl: null
      };
    }

    return {
      success: true,
      message: "Redirection vers le paiement…",
      checkoutUrl: redirectUrl
    };
  } catch (error) {
    if (error instanceof JekoError) {
      console.error(
        "GOALX_DEPOSIT_JEKO_ERROR",
        {
          code: error.code,
          message: error.message,
          status: error.status
        }
      );

      return {
        success: false,
        message:
          true ||
          true
            ? `Paiement indisponible : ${error.message}`
            : "Le paiement est momentanément indisponible. Réessaie plus tard.",
        checkoutUrl: null
      };
    }

    console.error(
      "GOALX_DEPOSIT_INIT_UNEXPECTED_ERROR",
      error
    );

    return {
      success: false,
      message:
        "Une erreur inattendue est survenue.",
      checkoutUrl: null
    };
  }
}
