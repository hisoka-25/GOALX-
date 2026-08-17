import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowRight,
  Clock3,
  History,
  ShieldCheck,
  Swords,
  Trophy
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Mes matchs",
  description:
    "Consulte tes matchs GOALX en cours et terminés."
};

type MatchData = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  winner_id: string | null;
  stake: number;
  game_mode: string;
  status: string;
  created_at: string;
  player_one: ProfileData | ProfileData[];
  player_two: ProfileData | ProfileData[];
};

type ProfileData = {
  id: string;
  username: string;
  efootball_username: string;
};

function formatCredits(
  amount: number
): string {
  return new Intl.NumberFormat("fr-FR").format(
    amount
  );
}

function formatDate(
  date: string
): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}

function formatGameMode(
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

function getProfile(
  profile:
    | ProfileData
    | ProfileData[]
): ProfileData | null {
  if (Array.isArray(profile)) {
    return profile[0] ?? null;
  }

  return profile ?? null;
}

function getStatusInformation(
  match: MatchData,
  userId: string
): {
  label: string;
  description: string;
  className: string;
  icon: typeof Trophy;
} {
  if (
    match.status === "COMPLETED" &&
    match.winner_id === userId
  ) {
    return {
      label: "Victoire",
      description:
        "Le résultat a été validé.",
      className: styles.victory,
      icon: Trophy
    };
  }

  if (
    match.status === "COMPLETED"
  ) {
    return {
      label: "Défaite",
      description:
        "Le résultat a été validé.",
      className: styles.defeat,
      icon: Swords
    };
  }

  if (
    match.status === "UNFINISHED"
  ) {
    return {
      label: "Inachevé",
      description:
        "Chaque joueur récupère sa mise.",
      className: styles.unfinished,
      icon: ShieldCheck
    };
  }

  if (
    match.status === "CANCELLED"
  ) {
    return {
      label: "Annulé",
      description:
        "Ce match a été annulé.",
      className: styles.cancelled,
      icon: ShieldCheck
    };
  }

  if (
    match.status === "AI_REVIEW"
  ) {
    return {
      label: "Analyse IA",
      description:
        "Les captures sont en cours d’analyse.",
      className: styles.pending,
      icon: Clock3
    };
  }

  if (
    match.status ===
    "WAITING_FOR_EVIDENCE"
  ) {
    return {
      label: "Captures attendues",
      description:
        "Le délai de cinq minutes est actif.",
      className: styles.pending,
      icon: Clock3
    };
  }

  if (
    match.status === "IN_PROGRESS"
  ) {
    return {
      label: "En cours",
      description:
        "Le match eFootball peut être joué.",
      className: styles.active,
      icon: Swords
    };
  }

  return {
    label: "À accepter",
    description:
      "Les deux joueurs doivent confirmer.",
    className: styles.active,
    icon: Clock3
  };
}

export default async function MatchesPage() {
  const supabase = await createClient();

  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const {
    data,
    error
  } = await supabase
    .from("matches")
    .select(
      `
        id,
        player_one_id,
        player_two_id,
        winner_id,
        stake,
        game_mode,
        status,
        created_at,
        player_one:profiles!matches_player_one_id_fkey (
          id,
          username,
          efootball_username
        ),
        player_two:profiles!matches_player_two_id_fkey (
          id,
          username,
          efootball_username
        )
      `
    )
    .or(
      `player_one_id.eq.${user.id},player_two_id.eq.${user.id}`
    )
    .order("created_at", {
      ascending: false
    })
    .limit(50);

  if (error) {
    return (
      <div className={styles.page}>
        <div className="form-message form-message--error">
          Impossible de récupérer tes matchs
          pour le moment.
        </div>
      </div>
    );
  }

  const matches =
    (data ?? []) as unknown as MatchData[];

  const activeMatches =
    matches.filter(
      (match) =>
        ![
          "COMPLETED",
          "UNFINISHED",
          "CANCELLED"
        ].includes(match.status)
    );

  const finishedMatches =
    matches.filter(
      (match) =>
        [
          "COMPLETED",
          "UNFINISHED",
          "CANCELLED"
        ].includes(match.status)
    );

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="eyebrow">
          Historique
        </span>

        <h1>
          TES
          <br />
          <em>MATCHS.</em>
        </h1>

        <p>
          Retrouve tes défis en cours,
          les captures attendues et tes
          résultats précédents.
        </p>
      </header>

      {matches.length === 0 ? (
        <section className={styles.emptyState}>
          <History />

          <h2>
            AUCUN MATCH POUR LE MOMENT
          </h2>

          <p>
            Lance une recherche et affronte
            ton premier adversaire GOALX.
          </p>

          <Link
            href="/matchmaking"
            className="button"
          >
            Trouver un match
            <Swords />
          </Link>
        </section>
      ) : (
        <div className={styles.sections}>
          {activeMatches.length > 0 && (
            <MatchSection
              title="Matchs actifs"
              subtitle="Action requise"
              matches={activeMatches}
              userId={user.id}
            />
          )}

          {finishedMatches.length > 0 && (
            <MatchSection
              title="Historique"
              subtitle="Matchs terminés"
              matches={finishedMatches}
              userId={user.id}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MatchSection({
  title,
  subtitle,
  matches,
  userId
}: {
  title: string;
  subtitle: string;
  matches: MatchData[];
  userId: string;
}) {
  return (
    <section className={styles.matchSection}>
      <header className={styles.sectionHeader}>
        <div>
          <span>{subtitle}</span>
          <h2>{title}</h2>
        </div>

        <History />
      </header>

      <div className={styles.matchList}>
        {matches.map((match) => {
          const playerOne =
            getProfile(
              match.player_one
            );

          const playerTwo =
            getProfile(
              match.player_two
            );

          const opponent =
            match.player_one_id === userId
              ? playerTwo
              : playerOne;

          const status =
            getStatusInformation(
              match,
              userId
            );

          const StatusIcon =
            status.icon;

          return (
            <Link
              key={match.id}
              href={`/matches/${match.id}`}
              className={styles.matchCard}
            >
              <div
                className={`${styles.statusIcon} ${status.className}`}
              >
                <StatusIcon />
              </div>

              <div className={styles.opponent}>
                <span>Adversaire</span>

                <strong>
                  {opponent?.username ??
                    "Joueur GOALX"}
                </strong>

                <small>
                  {opponent?.efootball_username ??
                    "Nom eFootball indisponible"}
                </small>
              </div>

              <div className={styles.matchDetails}>
                <div>
                  <span>Statut</span>
                  <strong
                    className={
                      status.className
                    }
                  >
                    {status.label}
                  </strong>
                </div>

                <div>
                  <span>Mise</span>
                  <strong>
                    {formatCredits(
                      Number(match.stake)
                    )}{" "}
                    FCFA
                  </strong>
                </div>

                <div>
                  <span>Mode</span>
                  <strong>
                    {formatGameMode(
                      match.game_mode
                    )}
                  </strong>
                </div>
              </div>

              <div className={styles.date}>
                <span>
                  {formatDate(
                    match.created_at
                  )}
                </span>

                <small>
                  {status.description}
                </small>
              </div>

              <ArrowRight
                className={styles.arrow}
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
      }
