import type {
  Metadata
} from "next";
import Link from "next/link";
import {
  notFound,
  redirect
} from "next/navigation";

import {
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Swords,
  Trophy,
  Users
} from "lucide-react";

import {
  finalizeMatchByAdmin
} from "./actions";

import {
  createAdminClient
} from "@/lib/supabase/admin";

import {
  createClient
} from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Administration"
};

type Player = {
  username: string;
  efootball_username: string;
  team: string;
};

type Evidence = {
  id: string;
  user_id: string;
  storage_path: string;
  uploaded_at: string;
};

type PendingMatch = {
  id: string;
  player_one_id: string;
  player_two_id: string;
  stake: number;
  status: string;
  evidence_deadline: string | null;
  created_at: string;
  player_one: Player | Player[];
  player_two: Player | Player[];
  match_evidence: Evidence[];
};

function getPlayer(
  value: Player | Player[]
): Player | undefined {
  return Array.isArray(value)
    ? value[0]
    : value;
}

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/login?redirect=/admin"
    );
  }

  const {
    data: profile
  } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  if (
    profile?.role !== "ADMIN"
  ) {
    notFound();
  }

  const admin =
    createAdminClient();

  const {
    data,
    error
  } = await admin
    .from("matches")
    .select(
      `
        id,
        player_one_id,
        player_two_id,
        stake,
        status,
        evidence_deadline,
        created_at,
        player_one:profiles!matches_player_one_id_fkey (
          username,
          efootball_username,
          team
        ),
        player_two:profiles!matches_player_two_id_fkey (
          username,
          efootball_username,
          team
        ),
        match_evidence (
          id,
          user_id,
          storage_path,
          uploaded_at
        )
      `
    )
    .in("status", [
      "WAITING_FOR_EVIDENCE",
      "AI_REVIEW"
    ])
    .order(
      "created_at",
      {
        ascending: true
      }
    );

  if (error) {
    throw new Error(
      "Impossible de charger les matchs à examiner."
    );
  }

  const matches =
    (data ?? []) as unknown as PendingMatch[];

  const bucket =
    process.env
      .SUPABASE_EVIDENCE_BUCKET ??
    "match-evidence";

  const preparedMatches =
    await Promise.all(
      matches.map(
        async (match) => {
          const evidence =
            await Promise.all(
              match.match_evidence.map(
                async (item) => {
                  const {
                    data: signed
                  } = await admin.storage
                    .from(bucket)
                    .createSignedUrl(
                      item.storage_path,
                      3600
                    );

                  return {
                    ...item,
                    signedUrl:
                      signed?.signedUrl ??
                      null
                  };
                }
              )
            );

          return {
            ...match,
            evidence
          };
        }
      )
    );

    return (
      <main className={styles.page}>
      <Link
        href="/admin/users"
        className="button"
      >
        <Users />
        Gérer les joueurs
      </Link>
      <header className={styles.heading}>
        <span className="eyebrow">
          Administration GOALX
        </span>

        <h1>
          CENTRE DE
          <br />
          <em>VERDICT.</em>
        </h1>

        <p>
          Connecté en tant que{" "}
          <strong>
            {profile.username}
          </strong>
          . Examine les preuves avant
          toute décision.
        </p>
      </header>

      <section className={styles.summary}>
        <ShieldCheck />

        <div>
          <span>
            Matchs à examiner
          </span>

          <strong>
            {preparedMatches.length}
          </strong>
        </div>
      </section>

      {preparedMatches.length === 0 ? (
        <section className={styles.empty}>
          <CheckCircle2 />

          <h2>
            AUCUN VERDICT EN ATTENTE
          </h2>

          <p>
            Les prochains matchs
            apparaîtront ici après
            l’envoi des captures.
          </p>
        </section>
      ) : (
        <div className={styles.list}>
          {preparedMatches.map(
            (match) => {
              const playerOne =
                getPlayer(
                  match.player_one
                );

              const playerTwo =
                getPlayer(
                  match.player_two
                );

              return (
                <article
                  className={styles.card}
                  key={match.id}
                >
                  <header
                    className={
                      styles.matchHeader
                    }
                  >
                    <span className="status status--active">
                      <Clock3 />

                      {match.status ===
                      "AI_REVIEW"
                        ? "Analyse"
                        : "Preuves reçues"}
                    </span>

                    <strong>
                      Mise :{" "}
                      {Number(
                        match.stake
                      ).toLocaleString(
                        "fr-FR"
                      )}{" "}
                      FCFA
                    </strong>
                  </header>

                  <div className={styles.players}>
                    <div>
                      <span>Joueur 1</span>

                      <h2>
                        {playerOne?.username}
                      </h2>

                      <p>
                        {
                          playerOne
                            ?.efootball_username
                        }{" "}
                        · {playerOne?.team}
                      </p>
                    </div>

                    <b>VS</b>

                    <div>
                      <span>Joueur 2</span>

                      <h2>
                        {playerTwo?.username}
                      </h2>

                      <p>
                        {
                          playerTwo
                            ?.efootball_username
                        }{" "}
                        · {playerTwo?.team}
                      </p>
                    </div>
                  </div>

                  <div
                    className={
                      styles.evidenceGrid
                    }
                  >
                    {[
                      match.player_one_id,
                      match.player_two_id
                    ].map(
                      (
                        playerId,
                        index
                      ) => {
                        const proof =
                          match.evidence.find(
                            (item) =>
                              item.user_id ===
                              playerId
                          );

                        return (
                          <div
                            className={
                              styles.proof
                            }
                            key={playerId}
                          >
                            <span>
                              Capture joueur{" "}
                              {index + 1}
                            </span>

                            {proof?.signedUrl ? (
                              <a
                                href={
                                  proof.signedUrl
                                }
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img
                                  src={
                                    proof.signedUrl
                                  }
                                  alt={`Preuve du joueur ${
                                    index + 1
                                  }`}
                                />
                              </a>
                            ) : (
                              <div
                                className={
                                  styles.noProof
                                }
                              >
                                Capture non reçue
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>

                  <form
                    action={
                      finalizeMatchByAdmin
                    }
                    className={styles.form}
                  >
                    <input
                      type="hidden"
                      name="match_id"
                      value={match.id}
                    />

                    <label>
                      Score constaté

                      <input
                        name="score"
                        placeholder="Exemple : 3 - 1"
                        maxLength={30}
                      />
                    </label>

                    <label>
                      Explication

                      <textarea
                        name="explanation"
                        required
                        minLength={5}
                        maxLength={1000}
                        placeholder="Explique brièvement pourquoi ce verdict est rendu."
                      />
                    </label>

                    <div
                      className={
                        styles.actions
                      }
                    >
                      <button
                        className={styles.win}
                        name="verdict"
                        value="PLAYER_ONE_WON"
                      >
                        <Trophy />

                        {playerOne?.username}
                        {" "}gagne
                      </button>

                      <button
                        className={styles.win}
                        name="verdict"
                        value="PLAYER_TWO_WON"
                      >
                        <Trophy />

                        {playerTwo?.username}
                        {" "}gagne
                      </button>

                      <button
                        className={
                          styles.unfinished
                        }
                        name="verdict"
                        value="UNFINISHED"
                      >
                        <Swords />
                        Match inachevé
                      </button>
                    </div>
                  </form>
                </article>
              );
            }
          )}
        </div>
      )}
    </main>
  );
                }
