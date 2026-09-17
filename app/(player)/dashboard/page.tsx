import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  History,
  ShieldCheck,
  Swords,
  Trophy,
  Wallet
} from "lucide-react";

import {
  createAdminClient
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  acceptReceivedChallengeAction,
  refuseReceivedChallengeAction
} from "./actions";

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

type CreatorData = {
  username: string;
  division: number;
  game_mode: string;
};

type ReceivedChallenge = {
  code: string;
  stake: number;
  game_mode: string;
  expires_at: string;
  creator:
    | CreatorData
    | CreatorData[]
    | null;
};

function getCreator(
  creator:
    | CreatorData
    | CreatorData[]
    | null
): CreatorData | null {
  if (!creator) {
    return null;
  }

  return Array.isArray(
    creator
  )
    ? creator[0] ?? null
    : creator;
}

function getModeLabel(
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

  return (
    labels[gameMode] ??
    gameMode
  );
}

function minutesLeft(
  expiresAt: string
): number {
  return Math.max(
    1,
    Math.ceil(
      (new Date(
        expiresAt
      ).getTime() -
        Date.now()) /
        60_000
    )
  );
}

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

type DashboardPageProps = {
  searchParams: Promise<{
    challengeError?: string;
    challengeRefused?: string;
  }>;
};

export default async function DashboardPage({
  searchParams
}: DashboardPageProps) {
  const parameters =
    await searchParams;

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

  // Défis directs reçus : PENDING, ciblés sur moi, non expirés.
  // Requête via client admin (comme la page de code de défi),
  // filtrée côté serveur sur mon identifiant.
  const admin =
    createAdminClient();

  const {
    data: receivedData
  } = await admin
    .from("friend_challenges")
    .select(
      `
        code,
        stake,
        game_mode,
        expires_at,
        creator:profiles!friend_challenges_creator_id_fkey (
          username,
          division,
          game_mode
        )
      `
    )
    .eq(
      "challenged_profile_id",
      user.id
    )
    .eq("status", "PENDING")
    .gt(
      "expires_at",
      new Date().toISOString()
    )
    .order("created_at", {
      ascending: true
    })
    .limit(10);

  const receivedChallenges =
    (receivedData ??
      []) as unknown as ReceivedChallenge[];

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
            Trouve un adversaire compatible,
            proche de ta zone de jeu, et entre
            dans l’arène.
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

      {parameters.challengeError && (
        <div className="form-message form-message--error">
          {parameters.challengeError}
        </div>
      )}

      {parameters.challengeRefused && (
        <div className="form-message form-message--success">
          Le défi a bien été refusé.
        </div>
      )}

      {receivedChallenges.length >
        0 && (
        <section
          className={styles.received}
          aria-label="Défis reçus"
        >
          <header
            className={
              styles.receivedHeader
            }
          >
            <Swords />

            <div>
              <span>
                Urgent
              </span>

              <h2>
                DÉFIS REÇUS
              </h2>

              <p>
                Un joueur t’attend
                en ce moment. Chaque
                défi expire après
                15 minutes.
              </p>
            </div>
          </header>

          {receivedChallenges.map(
            (challenge) => {
              const creator =
                getCreator(
                  challenge.creator
                );

              return (
                <article
                  key={
                    challenge.code
                  }
                  className={
                    styles.receivedCard
                  }
                >
                  <div
                    className={
                      styles.receivedInfo
                    }
                  >
                    <strong>
                      {creator?.username ??
                        "Un joueur"}{" "}
                      te défie
                    </strong>

                    <small>
                      Mise{" "}
                      {formatCredits(
                        Number(
                          challenge.stake
                        )
                      )}{" "}
                      FCFA ·{" "}
                      {getModeLabel(
                        challenge.game_mode
                      )}{" "}
                      · Expire dans{" "}
                      {minutesLeft(
                        challenge.expires_at
                      )}{" "}
                      min
                    </small>
                  </div>

                  <div
                    className={
                      styles.receivedActions
                    }
                  >
                    <form
                      action={
                        acceptReceivedChallengeAction
                      }
                    >
                      <input
                        type="hidden"
                        name="code"
                        value={
                          challenge.code
                        }
                      />

                      <button
                        className="button"
                        type="submit"
                      >
                        <Swords />
                        Accepter
                      </button>
                    </form>

                    <form
                      action={
                        refuseReceivedChallengeAction
                      }
                    >
                      <input
                        type="hidden"
                        name="code"
                        value={
                          challenge.code
                        }
                      />

                      <button
                        className="button button--secondary"
                        type="submit"
                      >
                        Refuser
                      </button>
                    </form>
                  </div>
                </article>
              );
            }
          )}
        </section>
      )}

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

              <ClipboardCheck />
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
              Résultat validé ou match inachevé.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
    }
