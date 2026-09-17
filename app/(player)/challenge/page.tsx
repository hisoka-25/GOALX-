import type {
  Metadata
} from "next";

import Link from "next/link";
import {
  redirect
} from "next/navigation";

import {
  Gift,
  Swords,
  UserPlus
} from "lucide-react";

import ChallengeStakes from "@/components/challenge/ChallengeStakes";

import {
  createClient
} from "@/lib/supabase/server";

import {
  createChallengeAction
} from "./actions";

import styles from "./challenge.module.css";

export const metadata: Metadata = {
  title: "Défier un ami"
};

type ChallengePageProps = {
  searchParams: Promise<{
    error?: string;
    cancelled?: string;
    to?: string;
  }>;
};

type TargetData = {
  id: string;
  username: string;
  division: number;
  game_mode: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getModeLabel(
  gameMode: string
): string {
  const labels: Record<string, string> = {
    MOBILE: "Mobile",
    PLAYSTATION: "PlayStation",
    XBOX: "Xbox",
    PC: "PC"
  };

  return labels[gameMode] ?? gameMode;
}

export default async function NewChallengePage({
  searchParams
}: ChallengePageProps) {
  const parameters =
    await searchParams;

  const supabase =
    await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  // Défi direct : un joueur précis est ciblé (?to=).
  let target: TargetData | null = null;
  let targetError = "";

  if (parameters.to) {
    if (!user) {
      redirect(
        `/login?redirect=${encodeURIComponent(
          `/challenge?to=${parameters.to}`
        )}`
      );
    }

    if (!UUID_PATTERN.test(
      parameters.to
    )) {
      targetError =
        "Ce joueur est introuvable.";
    } else if (
      parameters.to ===
      user.id
    ) {
      targetError =
        "Tu ne peux pas te défier toi-même.";
    } else {
      const {
        data: targetProfile
      } = await supabase
        .from("profiles")
        .select(
          `
            id,
            username,
            division,
            game_mode
          `
        )
        .eq("id", parameters.to)
        .maybeSingle();

      if (!targetProfile) {
        targetError =
          "Ce joueur est introuvable.";
      } else {
        const {
          data: myProfile
        } = await supabase
          .from("profiles")
          .select("game_mode")
          .eq("id", user.id)
          .single();

        if (
          myProfile?.game_mode &&
          myProfile.game_mode !==
          targetProfile.game_mode
        ) {
          targetError =
            `${targetProfile.username} joue en ` +
            `${getModeLabel(
              targetProfile.game_mode
            )} et toi en ` +
            `${getModeLabel(
              myProfile.game_mode
            )} : vous n’êtes pas ` +
            `sur le même mode de jeu.`;
        } else {
          target = targetProfile;
        }
      }
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="eyebrow">
          {target
            ? "Défi direct"
            : "Match privé"}
        </span>

        <h1>
          {target ? (
            <>
              TU DÉFIES
              <br />
              <em>
                {target.username}.
              </em>
            </>
          ) : (
            <>
              DÉFIE
              <br />
              <em>UN AMI.</em>
            </>
          )}
        </h1>

        <p>
          {target
            ? `Le défi part directement sur le compte de ${target.username}. Il a 15 minutes pour l’accepter depuis son Accueil.`
            : "Crée un lien privé, partage-le sur WhatsApp et joue directement avec la personne de ton choix."}
        </p>
      </header>

      {parameters.error && (
        <div className="form-message form-message--error">
          {parameters.error}
        </div>
      )}

      {targetError && (
        <div className="form-message form-message--error">
          {targetError}{" "}

          <Link
            href="/players"
            className={styles.backLink}
          >
            Retour aux joueurs
          </Link>
        </div>
      )}

      {parameters.cancelled && (
        <div className="form-message form-message--success">
          Le défi a été annulé.
        </div>
      )}

      <form
        action={createChallengeAction}
        className={styles.createCard}
      >
        <div className={styles.cardTitle}>
          {target ? (
            <Swords />
          ) : (
            <UserPlus />
          )}

          <div>
            <span>
              {target
                ? `Division ${target.division} · ${getModeLabel(
                    target.game_mode
                  )}`
                : "Étape unique"}
            </span>

            <h2>
              {target
                ? "DEMANDER LE MATCH"
                : "CHOISIS LA MISE"}
            </h2>
          </div>
        </div>

        {target && (
          <div className={styles.targetCard}>
            <span
              className={
                styles.targetAvatar
              }
              aria-hidden="true"
            >
              {target.username
                .charAt(0)
                .toUpperCase()}
            </span>

            <div>
              <strong>
                {target.username}
              </strong>

              <small>
                Recevra ton défi sur
                son Accueil GOALX
              </small>
            </div>
          </div>
        )}

        <ChallengeStakes />

        <div className={styles.info}>
          <Gift />

          <p>
            <strong>
              Le défi expire après
              15 minutes.
            </strong>

            {target
              ? `${target.username} doit accepter depuis son compte.`
              : "Aucun crédit n’est réservé avant que ton ami accepte."}
          </p>
        </div>

        {target && (
          <input
            type="hidden"
            name="to"
            value={target.id}
          />
        )}

        <button
          className="button button--full"
          type="submit"
        >
          {target ? (
            <>
              <Swords />
              Envoyer le défi
            </>
          ) : (
            <>
              <UserPlus />
              Créer le lien privé
            </>
          )}
        </button>

      </form>
    </div>
  );
}
