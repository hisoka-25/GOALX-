"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  JekoError,
  createTransfer,
  findOrCreateContact
} from "@/lib/payments/jeko-client";

// =========================================================
// GOALX — Retrait des commissions par l'admin via Jèko.
// Vérifie que l'utilisateur connecté est bien ADMIN, débite
// le portefeuille plateforme puis crée le transfert Jèko
// vers le Mobile Money de l'exploitant.
// =========================================================

export type PlatformWithdrawState = {
  success: boolean;
  message: string;
};

function normalizePhone(raw: string): string {
  const trimmed = raw.replace(/[\s.-]/g, "");

  if (/^0\d{9}$/.test(trimmed)) {
    return `+225${trimmed}`;
  }

  return trimmed.startsWith("+")
    ? trimmed
    : `+${trimmed}`;
}

export async function requestPlatformWithdrawalAction(
  _previousState: PlatformWithdrawState,
  formData: FormData
): Promise<PlatformWithdrawState> {
  const amountValue = formData.get("amount");
  const phoneValue = formData.get("phone");

  const amount =
    typeof amountValue === "string"
      ? Number(amountValue)
      : Number.NaN;

  const phone =
    typeof phoneValue === "string"
      ? normalizePhone(phoneValue)
      : "";

  // Vérification du rôle admin.
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "Session expirée. Reconnecte-toi."
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "ADMIN") {
    return {
      success: false,
      message: "Accès réservé à l'administration."
    };
  }

  if (
    !Number.isSafeInteger(amount) ||
    amount < 2000 ||
    amount % 500 !== 0
  ) {
    return {
      success: false,
      message:
        "Montant invalide : au moins 2 000 FCFA, par palier de 500."
    };
  }

  if (phone.replace(/\D/g, "").length < 8) {
    return {
      success: false,
      message: "Saisis un numéro Mobile Money valide."
    };
  }

  const admin = createAdminClient();

  // 1. Débit du portefeuille plateforme.
  const {
    data: withdrawalId,
    error: rpcError
  } = await admin.rpc(
    "request_platform_withdrawal",
    {
      requested_amount: amount,
      requested_phone: phone,
      requested_provider: "wave"
    }
  );

  if (rpcError || !withdrawalId) {
    const message = (rpcError?.message ?? "").toUpperCase();

    return {
      success: false,
      message: message.includes("INSUFFICIENT_PLATFORM_BALANCE")
        ? "Le solde des commissions est inférieur à ce montant."
        : "Impossible de traiter ce retrait pour le moment."
    };
  }

  // 2. Création du contact bénéficiaire puis du transfert Jèko.
  let transfer;
  try {
    const contactId = await findOrCreateContact({
      name: "GOALX Admin",
      phone,
      paymentMethod: "wave"
    });

    transfer = await createTransfer({
      contactId,
      amountCents: amount * 100,
      currency: "XOF",
      reference: `GOALX-PLAT-${withdrawalId}`,
      narration: `Retrait commissions GOALX — ${amount} FCFA`
    });

    const reference =
      transfer.reference ??
      (typeof transfer.id === "string" ? transfer.id : null);

    if (reference) {
      await admin.rpc(
        "attach_platform_withdrawal_reference",
        {
          requested_withdrawal_id: withdrawalId,
          requested_reference: String(reference)
        }
      );
    }
  } catch (error) {
    await admin.rpc("fail_platform_withdrawal", {
      requested_withdrawal_id: withdrawalId,
      requested_reason:
        error instanceof JekoError
          ? error.message
          : "Échec création du retrait."
    });

    revalidatePath("/admin");

    return {
      success: false,
      message:
        "Le retrait est momentanément indisponible (fonds en cours de réapprovisionnement). Le montant a été recrédité."
    };
  }

  revalidatePath("/admin");

  return {
    success: true,
    message:
      "Retrait des commissions lancé. Tu recevras les fonds sur ton compte Mobile Money dans quelques instants."
  };
}
