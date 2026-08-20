"use server";

import {
  revalidatePath
} from "next/cache";

import {
  countryCodes
} from "@/lib/countries";

import {
  createClient
} from "@/lib/supabase/server";

export type ProfileActionState = {
  success: boolean;
  message: string;
  errors?: Record<
    string,
    string
  >;
};

function getText(
  formData: FormData,
  name: string
): string {
  const value =
    formData.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function updateProfileAction(
  _previousState:
    ProfileActionState,

  formData: FormData
): Promise<ProfileActionState> {
  const username =
    getText(
      formData,
      "username"
    );

  const efootballUsername =
    getText(
      formData,
      "efootball_username"
    );

  const team =
    getText(
      formData,
      "team"
    );

  const division =
    Number(
      getText(
        formData,
        "division"
      )
    );

  const gameMode =
    getText(
      formData,
      "game_mode"
    ).toUpperCase();

  const countryCode =
    getText(
      formData,
      "country_code"
    ).toUpperCase();

  const errors: Record<
    string,
    string
  > = {};

  if (
    username.length < 3 ||
    username.length > 24
  ) {
    errors.username =
      "Le nom GOALX doit contenir entre 3 et 24 caractères.";
  } else if (
    !/^[a-zA-Z0-9_]+$/.test(
      username
    )
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

  if (
    !Number.isInteger(
      division
    ) ||
    division < 1 ||
    division > 10
  ) {
    errors.division =
      "Sélectionne une division valide.";
  }

  if (
    ![
      "MOBILE",
      "PLAYSTATION",
      "XBOX",
      "PC"
    ].includes(gameMode)
  ) {
    errors.game_mode =
      "Sélectionne un mode de jeu valide.";
  }

  if (
    !countryCodes.has(
      countryCode
    )
  ) {
    errors.country_code =
      "Sélectionne un pays valide.";
  }

  if (
    Object.keys(
      errors
    ).length > 0
  ) {
    return {
      success: false,

      message:
        "Vérifie les informations du formulaire.",

      errors
    };
  }

  const supabase =
    await createClient();

  const {
    data: {
      user
    },

    error: userError
  } =
    await supabase.auth
      .getUser();

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

  const [
    matchResult,
    profileResult
  ] = await Promise.all([
    supabase
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
      .in(
        "status",
        [
          "MATCHED",
          "ACCEPTED",
          "IN_PROGRESS",
          "WAITING_FOR_EVIDENCE",
          "AI_REVIEW"
        ]
      ),

    supabase
      .from("profiles")
      .select(
        `
          division,
          game_mode,
          country_code
        `
      )
      .eq(
        "id",
        user.id
      )
      .single()
  ]);

  if (
    matchResult.error ||
    profileResult.error ||
    !profileResult.data
  ) {
    return {
      success: false,

      message:
        "Impossible de vérifier ton profil et tes matchs actifs."
    };
  }

  const currentProfile =
    profileResult.data;

  const matchmakingChanged =
    Number(
      currentProfile.division
    ) !== division ||
    currentProfile.game_mode !==
      gameMode ||
    currentProfile.country_code !==
      countryCode;

  if (
    matchmakingChanged &&
    Number(
      matchResult.count ?? 0
    ) > 0
  ) {
    return {
      success: false,

      message:
        "Termine ton match actif avant de modifier ta division, ton mode ou ton pays."
    };
  }

  if (
    matchmakingChanged
  ) {
    await supabase.rpc(
      "cancel_matchmaking"
    );
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

      game_mode:
        gameMode,

      country_code:
        countryCode
    })
    .eq(
      "id",
      user.id
    );

  if (updateError) {
    if (
      updateError.code ===
      "23505"
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

  revalidatePath(
    "/dashboard"
  );

  revalidatePath(
    "/profile"
  );

  revalidatePath(
    "/matchmaking"
  );

  revalidatePath(
    "/matches"
  );

  return {
    success: true,

    message:
      "Ton profil a été mis à jour avec succès."
  };
    }
