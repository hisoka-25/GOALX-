"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  GeniusPayError,
  createPayout,
  getPayoutWallets
} from "@/lib/payments/geniuspay-client";

// =========================================================
// GOALX — Action serveur : demander un retrait (cashout).
// 1. RPC request_withdrawal : débite le portefeuille + crée
//    la demande (le solde réservé aux matchs n'est pas touché).
// 2. On crée le payout GeniusPay vers le Mobile Money.
// 3. On attache la référence. En cas d'échec côté GeniusPay,
//    le portefeuille est automatiquement recrédité.
// =========================================================

export type WithdrawState = {
  success: boolean;
  message: string;
};

const MIN_WITHDRAWAL = 500;
const MAX_WITHDRAWAL = 500_000;
const STEP = 500;

function normalizePhone(raw: string): string {
  const trimmed = raw.replace(/[\s.-]/g, "");

  // Numéro ivoirien local à 10 chiffres (07..., 01..., 05...).
  if (/^0\d{9}$/.test(trimmed)) {
    return `+225${trimmed}`;
  }

  return trimmed.startsWith("+")
    ? trimmed
    : `+${trimmed}`;
}

function getErrorMessage(errorMessage: string): string {
  const m = errorMessage.toUpperCase();

  if (m.includes("AUTHENTICATION_REQUIRED")) {
    return "Ta session a expiré. Reconnecte-toi.";
  }
  if (m.includes("INVALID_WITHDRAWAL_AMOUNT")) {
    return "Le montant du retrait doit être au moins 500 FCFA, par palier de 500.";
  }
  if (m.includes("INVALID_PHONE")) {
    return "Vérifie ton numéro Mobile Money.";
  }
  if (m.includes("INSUFFICIENT_BALANCE")) {
    return "Ton solde disponible est inférieur à ce montant.";
  }
  if (m.includes("WALLET_NOT_FOUND")) {
    return "Ton portefeuille est introuvable.";
  }
  return "Impossible de traiter ce retrait pour le moment.";
}

export async function requestWithdrawalAction(
  _previousState: WithdrawState,
  formData: FormData
): Promise<WithdrawState> {
  const amountValue = formData.get("amount");
  const phoneValue = formData.get("phone");
  const providerValue = formData.get("provider");

  const amount =
    typeof amountValue === "string"
      ? Number(amountValue)
      : Number.NaN;

  const phone =
    typeof phoneValue === "string"
      ? normalizePhone(phoneValue)
      : "";

  const provider =
    typeof providerValue === "string" &&
    providerValue.trim() !== ""
      ? providerValue.trim()
      : "wave";

  if (
    !Number.isSafeInteger(amount) ||
    amount < MIN_WITHDRAWAL ||
    amount > MAX_WITHDRAWAL ||
    amount % STEP !== 0
  ) {
    return {
      success: false,
      message:
        "Montant invalide : entre 500 et 500 000 FCFA, par palier de 500."
    };
  }

  if (phone.replace(/\D/g, "").length < 8) {
    return {
      success: false,
      message:
        "Saisis un numéro Mobile Money valide (ex : 07 00 00 00 00)."
    };
  }

  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "Ta session a expiré. Reconnecte-toi."
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, efootball_username")
    .eq("id", user.id)
    .maybeSingle();

  // 1. Débit du portefeuille + création de la demande.
  const {
    data: withdrawalId,
    error: rpcError
  } = await supabase.rpc("request_withdrawal", {
    requested_amount: amount,
    requested_phone: phone,
    requested_provider: provider
  });

  if (rpcError || !withdrawalId) {
    return {
      success: false,
      message: rpcError
        ? getErrorMessage(rpcError.message)
        : "Impossible de créer la demande de retrait."
    };
  }

  // 2. Récupération du portefeuille marchand source.
  let payout;
  try {
    const { wallets } = await getPayoutWallets();

    const sourceWallet =
      wallets.find(
        (w) => w.type === "api_available"
      ) ??
      wallets.find(
        (w) => w.type === "api_collected"
      ) ??
      wallets[0];

    if (!sourceWallet) {
      throw new GeniusPayError(
        "Aucun portefeuille de décaissement disponible.",
        "PAYOUT_WALLET_MISSING"
      );
    }

    payout = await createPayout({
      amount,
      wallet_id: sourceWallet.id,
      recipient: {
        name:
          profile?.efootball_username ||
          profile?.username ||
          "Joueur GOALX",
        phone
      },
      destination: {
        type: "mobile_money",
        account: phone,
        provider
      },
      description: `Retrait GOALX — ${amount} FCFA`,
      metadata: {
        withdrawal_id: String(withdrawalId),
        user_id: user.id
      }
    });
  } catch (error) {
    // Échec de création : on recrédite immédiatement.
    const admin = createAdminClient();

    await admin.rpc("fail_withdrawal", {
      requested_withdrawal_id: withdrawalId,
      requested_reason:
        error instanceof GeniusPayError
          ? error.message
          : "Échec lors de la création du retrait."
    });

    console.error(
      "GOALX_WITHDRAWAL_INIT_ERROR",
      error
    );

    const message =
      error instanceof GeniusPayError &&
      error.code === "PAYOUT_INITIATION_FAILED"
        ? "Le service de retrait est momentanément indisponible (fonds en cours de réapprovisionnement). Ton montant a été recrédité."
        : "Le retrait n'a pas pu être envoyé. Ton montant a été recrédité sur ton portefeuille.";

    return { success: false, message };
  }

  // 3. Attache de la référence GeniusPay (si fournie).
  const reference =
    payout.reference ??
    (typeof payout.id === "string"
      ? payout.id
      : null);

  if (reference) {
    const admin = createAdminClient();

    const { error: attachError } =
      await admin.rpc(
        "attach_withdrawal_reference",
        {
          requested_withdrawal_id: withdrawalId,
          requested_reference: String(reference)
        }
      );

    if (attachError) {
      console.error(
        "GOALX_WITHDRAWAL_REFERENCE_ATTACH_ERROR",
        {
          withdrawalId,
          reference,
          message: attachError.message
        }
      );
    }
  }

  return {
    success: true,
    message:
      "Ta demande de retrait est en cours. Tu recevras l'argent sur ton compte Mobile Money dans quelques instants."
  };
}
