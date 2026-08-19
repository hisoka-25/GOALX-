"use server";

import {
  revalidatePath
} from "next/cache";

import {
  createAdminClient
} from "@/lib/supabase/admin";

import {
  createClient
} from "@/lib/supabase/server";

function getTargetId(
  formData: FormData
): string {
  const value =
    formData.get("user_id");

  if (
    typeof value !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(value)
  ) {
    throw new Error(
      "Utilisateur invalide."
    );
  }

  return value;
}

async function getCurrentAdmin() {
  const supabase =
    await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "Session expirée."
    );
  }

  const {
    data: profile
  } = await supabase
    .from("profiles")
    .select(
      "role, account_status"
    )
    .eq("id", user.id)
    .single();

  if (
    profile?.role !== "ADMIN" ||
    profile.account_status !== "ACTIVE"
  ) {
    throw new Error(
      "Accès administrateur refusé."
    );
  }

  return user.id;
}

export async function suspendUserAction(
  formData: FormData
): Promise<void> {
  const adminId =
    await getCurrentAdmin();

  const userId =
    getTargetId(formData);

  if (userId === adminId) {
    throw new Error(
      "Tu ne peux pas suspendre ton propre compte."
    );
  }

  const admin =
    createAdminClient();

  const {
    data: target
  } = await admin
    .from("profiles")
    .select(
      `
        role,
        username,
        account_status
      `
    )
    .eq("id", userId)
    .single();

  if (!target) {
    throw new Error(
      "Compte introuvable."
    );
  }

  if (target.role === "ADMIN") {
    throw new Error(
      "Un administrateur ne peut pas être suspendu ici."
    );
  }

  if (
    target.account_status ===
    "SUSPENDED"
  ) {
    return;
  }

  const {
    error: authError
  } =
    await admin.auth.admin
      .updateUserById(
        userId,
        {
          ban_duration: "876000h"
        }
      );

  if (authError) {
    throw new Error(
      "La suspension Auth a échoué."
    );
  }

  const {
    error: profileError
  } = await admin
    .from("profiles")
    .update({
      account_status: "SUSPENDED"
    })
    .eq("id", userId);

  if (profileError) {
    await admin.auth.admin
      .updateUserById(
        userId,
        {
          ban_duration: "none"
        }
      );

    throw new Error(
      "La suspension du profil a échoué."
    );
  }

  await admin
    .from("admin_audit_logs")
    .insert({
      admin_id: adminId,
      target_user_id: userId,
      action: "USER_SUSPENDED",
      details: {
        username: target.username
      }
    });

  revalidatePath(
    "/admin/users"
  );
}

export async function reactivateUserAction(
  formData: FormData
): Promise<void> {
  const adminId =
    await getCurrentAdmin();

  const userId =
    getTargetId(formData);

  const admin =
    createAdminClient();

  const {
    data: target
  } = await admin
    .from("profiles")
    .select(
      `
        role,
        username,
        account_status
      `
    )
    .eq("id", userId)
    .single();

  if (!target) {
    throw new Error(
      "Compte introuvable."
    );
  }

  if (target.role === "ADMIN") {
    throw new Error(
      "Ce compte administrateur ne peut pas être modifié ici."
    );
  }

  if (
    target.account_status ===
    "ACTIVE"
  ) {
    return;
  }

  const {
    error: authError
  } =
    await admin.auth.admin
      .updateUserById(
        userId,
        {
          ban_duration: "none"
        }
      );

  if (authError) {
    throw new Error(
      "La réactivation Auth a échoué."
    );
  }

  const {
    error: profileError
  } = await admin
    .from("profiles")
    .update({
      account_status: "ACTIVE"
    })
    .eq("id", userId);

  if (profileError) {
    await admin.auth.admin
      .updateUserById(
        userId,
        {
          ban_duration: "876000h"
        }
      );

    throw new Error(
      "La réactivation du profil a échoué."
    );
  }

  await admin
    .from("admin_audit_logs")
    .insert({
      admin_id: adminId,
      target_user_id: userId,
      action: "USER_REACTIVATED",
      details: {
        username: target.username
      }
    });

  revalidatePath(
    "/admin/users"
  );
}
