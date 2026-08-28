"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  GeniusPayError,
  createPayment
} from "@/lib/payments/geniuspay-client";

// =========================================================
// GOALX — Action serveur : initier une recharge GeniusPay.
// 1. On crée la recharge en base (PENDING) via RPC sécurisée.
// 2. On crée la transaction chez GeniusPay (mode checkout).
// 3. On attache la référence MTX-... à la recharge.
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

  const amount =
    typeof amountValue === "string"
      ? Number(amountValue)
      : Number.NaN;

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

  // Récupération du profil pour enrichir le paiement.
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

  // 2. Création de la transaction chez GeniusPay.
  try {
    const appUrl = getAppUrl();

    const payment = await createPayment({
      amount,
      currency: "XOF",
      description: `Recharge portefeuille GOALX — ${amount} FCFA`,
      customer: {
        name:
          profile?.efootball_username ||
          profile?.username ||
          undefined,
        email: user.email,
        country: "CI"
      },
      // Mode checkout : le joueur choisit Wave, Orange,
      // MTN, Moov ou carte sur la page GeniusPay.
      success_url: `${appUrl}/wallet/deposit/return?deposit=${depositId}&result=success`,
      error_url: `${appUrl}/wallet/deposit/return?deposit=${depositId}&result=error`,
      metadata: {
        deposit_id: String(depositId),
        user_id: user.id
      }
    });

    // 3. Attache de la référence GeniusPay (service_role).
    const admin = createAdminClient();

    const { error: attachError } =
      await admin.rpc("attach_deposit_reference", {
        requested_deposit_id: depositId,
        requested_reference: payment.reference
      });

    if (attachError) {
      // La transaction existe chez GeniusPay mais la référence
      // n'est pas attachée : on journalise pour réconciliation.
      console.error(
        "GOALX_DEPOSIT_REFERENCE_ATTACH_ERROR",
        {
          depositId,
          reference: payment.reference,
          message: attachError.message
        }
      );
    }

    const redirectUrl =
      payment.checkout_url ||
      payment.payment_url ||
      null;

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
    if (error instanceof GeniusPayError) {
      console.error(
        "GOALX_DEPOSIT_GENIUSPAY_ERROR",
        {
          code: error.code,
          message: error.message,
          status: error.status
        }
      );

      return {
        success: false,
        message:
          process.env.GENIUSPAY_ENV === "live"
            ? `Paiement refusé par GeniusPay : ${error.message} (${error.code ?? "erreur"}). Vérifie que le compte marchand est activé en production.`
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
        "Une erreur inattendue est survenue. Réessaie.",
      checkoutUrl: null
    };
  }
}
