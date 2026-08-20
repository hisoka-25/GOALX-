"use server";

import {
  redirect
} from "next/navigation";

import {
  createClient
} from "@/lib/supabase/server";

import {
  countryCodes
} from "@/lib/countries";

export type AuthState = {
  success: boolean;
  message: string;
  errors?: Record<
    string,
    string
  >;
};

function getText(
  formData: FormData,
  field: string
): string {
  const value =
    formData.get(field);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function getSafeRedirectPath(
  formData: FormData
): string {
  const requestedPath =
    getText(
      formData,
      "redirect"
    );

  if (
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//")
  ) {
    return requestedPath;
  }

  return "/dashboard";
}

export async function registerAction(
  _previousState: AuthState,
  formData: FormData
): Promise<AuthState> {
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

  const divisionValue =
    getText(
      formData,
      "division"
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

  const email =
    getText(
      formData,
      "email"
    ).toLowerCase();

  const password =
    getText(
      formData,
      "password"
    );

  const confirmPassword =
    getText(
      formData,
      "confirm_password"
    );

  const acceptedTerms =
    formData.get(
      "accepted_terms"
    ) === "on";

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
      "Entre un nom eFootball valide.";
  }

  if (
    team.length < 2 ||
    team.length > 60
  ) {
    errors.team =
      "Entre le nom de l’équipe utilisée.";
  }

  const division =
    Number(divisionValue);

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
    !countryCodes.has(
      countryCode
    )
  ) {
    errors.country_code =
      "Sélectionne un pays valide.";
  }

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    errors.email =
      "Entre une adresse e-mail valide.";
  }

  if (
    password.length < 8
  ) {
    errors.password =
      "Le mot de passe doit contenir au moins 8 caractères.";
  }

  if (
    password !==
    confirmPassword
  ) {
    errors.confirm_password =
      "Les deux mots de passe ne correspondent pas.";
  }

  if (!acceptedTerms) {
    errors.accepted_terms =
      "Tu dois accepter les conditions de la version fictive.";
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
    data,
    error
  } =
    await supabase.auth.signUp({
      email,
      password,

      options: {
        data: {
          username,

          efootball_username:
            efootballUsername,

          team,
          division,

          game_mode:
            gameMode,

          country_code:
            countryCode
        },

        emailRedirectTo: `${
          process.env
            .NEXT_PUBLIC_APP_URL ??
          "http://localhost:3000"
        }/auth/confirm`
      }
    });

  if (error) {
    const normalizedMessage =
      error.message
        .toLowerCase();

    if (
      normalizedMessage.includes(
        "already"
      ) ||
      normalizedMessage.includes(
        "registered"
      )
    ) {
      return {
        success: false,

        message:
          "Cette adresse e-mail ou ce nom d’utilisateur est déjà utilisé."
      };
    }

    return {
      success: false,

      message:
        "Impossible de créer le compte pour le moment. Réessaie plus tard."
    };
  }

  if (data.session) {
    redirect(
      "/dashboard"
    );
  }

  return {
    success: true,

    message:
      "Compte créé. Consulte ta boîte e-mail pour confirmer ton inscription."
  };
}

export async function loginAction(
  _previousState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email =
    getText(
      formData,
      "email"
    ).toLowerCase();

  const password =
    getText(
      formData,
      "password"
    );

  const redirectPath =
    getSafeRedirectPath(
      formData
    );

  const errors: Record<
    string,
    string
  > = {};

  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    errors.email =
      "Entre une adresse e-mail valide.";
  }

  if (!password) {
    errors.password =
      "Entre ton mot de passe.";
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
    error
  } =
    await supabase.auth
      .signInWithPassword({
        email,
        password
      });

  if (error) {
    return {
      success: false,

      message:
        "Adresse e-mail ou mot de passe incorrect."
    };
  }

  redirect(
    redirectPath
  );
}

export async function logoutAction():
  Promise<void> {
  const supabase =
    await createClient();

  await supabase.auth
    .signOut();

  redirect("/");
}
