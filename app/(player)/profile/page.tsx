import type {
  Metadata
} from "next";

import {
  redirect
} from "next/navigation";

import {
  Gamepad2,
  User
} from "lucide-react";

import {
  ProfileForm
} from "@/components/profile/ProfileForm";

import {
  createClient
} from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Mon profil",

  description:
    "Consulte et modifie ton profil de joueur GOALX."
};

type ProfileData = {
  username: string;
  efootball_username: string;
  team: string;
  division: number;
  game_mode: string;
  country_code: string;
  created_at: string;
};

function formatMemberDate(
  date: string
): string {
  return new Intl
    .DateTimeFormat(
      "fr-FR",
      {
        month: "long",
        year: "numeric"
      }
    )
    .format(
      new Date(date)
    );
}

function formatGameMode(
  gameMode: string
): string {
  const labels: Record<
    string,
    string
  > = {
    MOBILE: "Mobile",
    PLAYSTATION: "PlayStation",
    XBOX: "Xbox",
    PC: "PC"
  };

  return labels[gameMode] ??
    gameMode;
}

export default async function ProfilePage() {
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
    redirect("/login");
  }

  const {
    data,
    error
  } = await supabase
    .from("profiles")
    .select(
      `
        username,
        efootball_username,
        team,
        division,
        game_mode,
        country_code,
        created_at
      `
    )
    .eq(
      "id",
      user.id
    )
    .single();

  if (
    error ||
    !data
  ) {
    redirect(
      "/dashboard?error=profile_not_found"
    );
  }

  const profile =
    data as ProfileData;

  const initial =
    profile.username
      .trim()
      .charAt(0)
      .toUpperCase() ||
    "G";

  return (
    <div className={styles.page}>
      <header
        className={
          styles.heading
        }
      >
        <span className="eyebrow">
          Mon profil
        </span>

        <h1>
          IDENTITÉ DE
          <br />

          <em>
            JOUEUR.
          </em>
        </h1>

        <p>
          Gère les informations
          utilisées pour ton profil
          et le matchmaking GOALX.
        </p>
      </header>

      <section
        className={
          styles.identityCard
        }
      >
        <div
          className={
            styles.avatar
          }
        >
          {initial}
        </div>

        <div
          className={
            styles.identity
          }
        >
          <span>
            Joueur GOALX
          </span>

          <h2>
            {profile.username}
          </h2>

          <p>
            Membre depuis{" "}

            {formatMemberDate(
              profile.created_at
            )}
          </p>
        </div>

        <div
          className={
            styles.summary
          }
        >
          <div>
            <Gamepad2 />

            <span>
              Mode de jeu
            </span>

            <strong>
              {formatGameMode(
                profile.game_mode
              )}
            </strong>
          </div>

          <div>
            <User />

            <span>
              Division
            </span>

            <strong>
              Division{" "}
              {profile.division}
            </strong>
          </div>
        </div>
      </section>


      <ProfileForm
        username={
          profile.username
        }

        efootballUsername={
          profile
            .efootball_username
        }

        team={
          profile.team
        }

        division={
          profile.division
        }

        gameMode={
          profile.game_mode
        }

        countryCode={
          profile.country_code
        }
      />
    </div>
  );
}
