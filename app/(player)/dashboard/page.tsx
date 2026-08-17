import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  History,
  ShieldCheck,
  Swords,
  Trophy,
  Wallet
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Tableau de bord",
  description:
    "Retrouve ton profil, tes crédits et tes matchs GOALX."
};

type Profile = {
  username: string;
  efootball_username: string;
  team: string;
  division: number;
  game_mode: string;
};

type WalletData = {
  available_balance: number;
  reserved_balance: number;
};

type MatchData = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  winner_id: string | null;
  stake: number;
  status: string;
  created_at: string;
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
    month: "short",
    year: "numeric"
  }).format(new Date(date));
}

function getMatchLabel(
  match: MatchData,
  userId: string
): {
  label: string;
  className: string;
  amount: string;
} {
  if (match.status === "UNFINISHED") {
    return {
      label: "Match inachevé",
      className: styles.matchUnfinished,
      amount: "Mise restituée"
    };
  }

  if (
    match.status === "COMPLETED" &&
    match.winner_id === userId
  ) {
    const winnings = Math.floor(
      match.stake * 2 * 0.9
    );

    return {
      label: "Victoire",
      className: styles.matchWon,
      amount: `+${formatCredits(winnings)} FCFA`
    };
  }

  if (
    match.status === "COMPLETED" &&
    match.winner_id !== userId
  ) {
    return {
      label: "Défaite",
      className: styles.matchLost,
      amount: `-${formatCredits(match.stake)} FCFA`
    };
  }

  return {
    label: "En cours",
    className: styles.matchPending,
    amount: `${formatCredits(match.stake)} FCFA`
  };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    profileResult,
    walletResult,
    matchesResult
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        `
          username,
          efootball_username,
          team,
          division,
          game_mode
        `
      )
      .eq("id", user.id)
      .single(),

    supabase
      .from("wallets")
      .select(
        `
          available_balance,
          reserved_balance
        `
      )
      .eq("user_id", user.id)
      .single(),

    supabase
      .from("matches")
      .select(
        `
          id,
          player_one_id,
          player_two_id,
          winner_id,
          stake,
          status,
          created_at
        `
      )
      .or(
        `player_one_id.eq.${user.id},player_two_id.eq.${user.id}`
      )
      .order("created_at", {
        ascending: false
      })
      .limit(5)
  ]);

  if (
    profileResult.error ||
    !profileResult.data
  ) {
    redirect(
      "/login?error=profile_not_found"
    );
  }

  const profile =
    profileResult.data as Profile;

  const wallet =
    walletResult.data as WalletData | null;

  const matches =
    (matchesResult.data ?? []) as MatchData[];

  const victories = matches.filter(
    (match) =>
      match.status === "COMPLETED" &&
      match.winner_id === user.id
  ).length;

  const activeMatches = matches.filter(
    (match) =>
      ![
        "COMPLETED",
        "UNFINISHED",
        "CANCELLED"
      ].includes(match.status)
  ).length;

  return (
    <div className={styles.page}>
      <section className={styles.welcome}>
        <div className={styles.welcomeContent}>
          <span className="eyebrow">
            Tableau de bord
          </span>

          <h1>
            PRÊT À JOUER,
            <br />
            <em>{profile.username} ?</em>
          </h1>

          <p>
            Trouve un adversaire de ta division
            et entre dans l’arène.
          </p>

          <Link
            href="/matchmaking"
            className="button"
          >
            Trouver un match
            <Swords />
          </Link>
        </div>

        <div className={styles.division}>
          <span>Ta division</span>

          <strong>
            {String(profile.division).padStart(
              2,
              "0"
            )}
          </strong>

          <small>{profile.game_mode}</small>
        </div>
      </section>

      <section
        className={styles.statistics}
        aria-label="Statistiques du compte"
      >
        <article className={styles.statistic}>
          <span>Solde disponible</span>

          <strong>
            {formatCredits(
              Number(
                wallet?.available_balance ?? 0
              )
            )}
            <small> FCFA</small>
          </strong>

          <Wallet />
        </article>

        <article className={styles.statistic}>
          <span>Crédits réservés</span>

          <strong>
            {formatCredits(
              Number(
                wallet?.reserved_balance ?? 0
              )
            )}
            <small> FCFA</small>
          </strong>

          <ShieldCheck />
        </article>

        <article className={styles.statistic}>
          <span>Victoires récentes</span>

          <strong>
            {victories}
          </strong>

          <Trophy />
        </article>

        <article className={styles.statistic}>
          <span>Matchs actifs</span>

          <strong>
            {activeMatches}
          </strong>

          <Clock3 />
        </article>
      </section>

      <div className={styles.contentGrid}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span>Activité récente</span>
              <h2>TES DERNIERS MATCHS</h2>
            </div>

            <History />
          </header>

          {matches.length === 0 ? (
            <div className={styles.emptyState}>
              <Swords />

              <strong>
                Aucun match disputé
              </strong>

              <p>
                Ton historique apparaîtra ici
                après ton premier défi.
              </p>

              <Link href="/matchmaking">
                Lancer une recherche
                <ArrowRight />
              </Link>
            </div>
          ) : (
            <div className={styles.matchList}>
              {matches.map((match) => {
                const result = getMatchLabel(
                  match,
                  user.id
                );

                return (
                  <Link
                    href={`/matches/${match.id}`}
                    className={styles.matchItem}
                    key={match.id}
                  >
                    <span
                      className={
                        result.className
                      }
                    >
                      {result.label}
                    </span>

                    <div>
                      <strong>
                        Mise de{" "}
                        {formatCredits(
                          match.stake
                        )}{" "}
                        FCFA
                      </strong>

                      <small>
                        {formatDate(
                          match.created_at
                        )}
                      </small>
                    </div>

                    <b>{result.amount}</b>

                    <ArrowRight />
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <aside className={styles.sidePanels}>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <span>Profil eFootball</span>
                <h2>TON IDENTITÉ</h2>
              </div>

              <Trophy />
            </header>

            <dl className={styles.profileDetails}>
              <div>
                <dt>Nom eFootball</dt>
                <dd>
                  {profile.efootball_username}
                </dd>
              </div>

              <div>
                <dt>Équipe utilisée</dt>
                <dd>{profile.team}</dd>
              </div>

              <div>
                <dt>Division</dt>
                <dd>
                  Division {profile.division}
                </dd>
              </div>
            </dl>

            <Link
              href="/profile"
              className={styles.panelLink}
            >
              Modifier mon profil
              <ArrowRight />
            </Link>
          </section>

          <section
            className={`${styles.panel} ${styles.rules}`}
          >
            <header className={styles.panelHeader}>
              <div>
                <span>Avant de jouer</span>
                <h2>RÈGLES EXPRESS</h2>
              </div>

              <Bot />
            </header>

            <ol>
              <li>
                <i>1</i>
                <span>
                  Joue ton match sur eFootball.
                </span>
              </li>

              <li>
                <i>2</i>
                <span>
                  Capture clairement le résultat.
                </span>
              </li>

              <li>
                <i>3</i>
                <span>
                  Envoie la preuve sous cinq minutes.
                </span>
              </li>
            </ol>

            <p>
              <CheckCircle2 />
              Verdict gagné, perdu ou inachevé.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
    }
