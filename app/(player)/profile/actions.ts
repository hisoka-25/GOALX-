"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type ProfileActionState = {
  success: boolean;
  message: string;
  errors?: Record<string, string>;
};



function getFormText(
  formData: FormData,
  fieldName: string
): string {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function updateProfileAction(
  _previousState: ProfileActionState,
  formData: FormData
): Promise<ProfileActionState> {
  const username = getFormText(
    formData,
    "username"
  );

  const efootballUsername = getFormText(
    formData,
    "efootball_username"
  );

  const team = getFormText(
    formData,
    "team"
  );

  const divisionValue = getFormText(
    formData,
    "division"
  );

  const gameMode = getFormText(
    formData,
    "game_mode"
  ).toUpperCase();

  const errors: Record<string, string> = {};

  if (
    username.length < 3 ||
    username.length > 24
  ) {
    errors.username =
      "Le nom GOALX doit contenir entre 3 et 24 caractères.";
  } else if (
    !/^[a-zA-Z0-9_]+$/.test(username)
  ) {
    errors.username =
      "Utilise uniquement des lettres, chiffres et underscores.";
  }

  if (
    efootballUsername.length < 2 ||
    efootballUsername.length > 40
  ) {
    errors.efootball_username =
      "Le nom eFootball doit contenir entre 2 et 40 caractères.";
  }

  if (
    team.length < 2 ||
    team.length > 60
  ) {
    errors.team =
      "Le nom de l’équipe doit contenir entre 2 et 60 caractères.";
  }

  const division = Number(
    divisionValue
  );

  if (
    !Number.isInteger(division) ||
    division < 1 ||
    division > 10
  ) {
    errors.division =
      "Sélectionne une division valide.";
  }

  const allowedGameModes = [
    "MOBILE",
    "PLAYSTATION",
    "XBOX",
    "PC"
  ];

  if (
    !allowedGameModes.includes(
      gameMode
    )
  ) {
    errors.game_mode =
      "Sélectionne un mode de jeu valide.";
  }

  if (
    Object.keys(errors).length > 0
  ) {
    return {
      success: false,
      message:
        "Vérifie les informations du formulaire.",
      errors
    };
  }

  const supabase = await createClient();

  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    return {
      success: false,
      message:
        "Ta session a expiré. Reconnecte-toi."
    };
  }

  /*
   * Un changement de division ou de mode est
   * interdit lorsqu’un match est encore actif.
   */
  const {
    count: activeMatchCount,
    error: matchCheckError
  } = await supabase
    .from("matches")
    .select(
      "id",
      {
        count: "exact",
        head: true
      }
    )
    .or(
      `player_one_id.eq.${user.id},player_two_id.eq.${user.id}`
    )
    .in("status", [
      "MATCHED",
      "ACCEPTED",
      "IN_PROGRESS",
      "WAITING_FOR_EVIDENCE",
      "AI_REVIEW"
    ]);

  if (matchCheckError) {
    return {
      success: false,
      message:
        "Impossible de vérifier tes matchs actifs."
    };
  }

  const {
    data: currentProfile,
    error: currentProfileError
  } = await supabase
    .from("profiles")
    .select(
      `
        division,
        game_mode
      `
    )
    .eq("id", user.id)
    .single();

  if (
    currentProfileError ||
    !currentProfile
  ) {
    return {
      success: false,
      message:
        "Ton profil GOALX est introuvable."
    };
  }

  const divisionOrModeChanged =
    Number(currentProfile.division) !== division ||
    currentProfile.game_mode !== gameMode;

  if (
    divisionOrModeChanged &&
    Number(activeMatchCount ?? 0) > 0
  ) {
    return {
      success: false,
      message:
        "Termine ton match actif avant de modifier ta division ou ton mode de jeu."
    };
  }

  /*
   * Une recherche active est annulée avant un
   * changement de division ou de mode.
   */
  if (divisionOrModeChanged) {
    const {
      error: queueError
    } = await supabase.rpc(
      "cancel_matchmaking"
    );

    if (
      queueError &&
      !queueError.message
        .toUpperCase()
        .includes(
          "AUTHENTICATION_REQUIRED"
        )
    ) {
      return {
        success: false,
        message:
          "Impossible d’annuler ta recherche active."
      };
    }
  }

  const {
    error: updateError
  } = await supabase
    .from("profiles")
    .update({
      username,
      efootball_username:
        efootballUsername,
      team,
      division,
      game_mode: gameMode
    })
    .eq("id", user.id);

  if (updateError) {
    if (
      updateError.code === "23505" ||
      updateError.message
        .toLowerCase()
        .includes("duplicate")
    ) {
      return {
        success: false,
        message:
          "Ce nom d’utilisateur GOALX est déjà utilisé.",
        errors: {
          username:
            "Choisis un autre nom d’utilisateur."
        }
      };
    }

    return {
      success: false,
      message:
        "La modification du profil a échoué. Réessaie."
    };
  }

  revalidatePath(
    "/dashboard",
    "layout"
  );

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  revalidatePath("/matchmaking");
  revalidatePath("/matches");

  return {
    success: true,
    message:
      "Ton profil a été mis à jour avec succès."
  };
    }
