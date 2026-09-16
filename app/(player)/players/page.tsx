import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  MessageCircle,
  Swords,
  UserPlus,
  Users
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Joueurs",
  description:
    "Vois qui est en ligne sur GOALX et lance un défi."
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const WHATSAPP_MESSAGE =
  "Salut ! On fait un match GOALX ? ⚔️ goalxs.com";

type PlayerData = {
  id: string;
  username: string;
  efootball_username: string;
  team: string | null;
  division: number;
  game_mode: string;
  last_seen_at: string | null;
  whatsapp_number: string | null;
};

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

function isOnline(
  lastSeenAt: string | null
): boolean {
  if (!lastSeenAt) return false;

  return (
    Date.now() - new Date(lastSeenAt).getTime()
    < ONLINE_WINDOW_MS
  );
}

function formatLastSeen(
  lastSeenAt: string | null
): string {
  if (!lastSeenAt) {
    return "Jamais vu";
  }

  const diffMs =
    Date.now() - new Date(lastSeenAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "À l’instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `Il y a ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Il y a ${diffDays} j`;
}

function normalizeWhatsApp(
  number: string | null
): string | null {
  if (!number) return null;

  const digits = number.replace(
    /[^0-9]/g,
    ""
  );

  return digits.length >= 8
    ? digits
    : null;
}

export default async function PlayersPage() {
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
    data
  } = await supabase
    .from("profiles")
    .select(
      `
        id,
        username,
        efootball_username,
        team,
        division,
        game_mode,
        last_seen_at,
        whatsapp_number
      `
    )
    .neq("id", user.id)
    .order("last_seen_at", {
      ascending: false,
      nullsFirst: false
    })
    .order("username", {
      ascending: true
    })
    .limit(200);

  const players: PlayerData[] = data ?? [];

  const onlineCount = players.filter(
    (player) => isOnline(player.last_seen_at)
  ).length;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>
          <Users />
          {onlineCount > 0
            ? `${onlineCount} joueur${onlineCount > 1 ? "s" : ""} en ligne`
            : "Communauté GOALX"}
        </p>

        <h1>
          JOUEURS
        </h1>

        <p>
          Les joueurs connectés apparaissent en
          premier. Défie-les sur GOALX ou
          contacte-les sur WhatsApp pour organiser
          votre match.
        </p>
      </header>

      {players.length === 0 ? (
        <div className={styles.emptyState}>
          <Users />

          <h2>
            AUCUN JOUEUR POUR LE MOMENT
          </h2>

          <p>
            Tu es l’un des premiers sur GOALX.
            Invite tes rivaux avec un lien de défi
            et retrouve-les ici dès qu’ils créent
            leur profil.
          </p>

          <Link
            href="/challenge"
            className={`button ${styles.emptyAction}`}
          >
            <UserPlus />
            Défier un ami
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {players.map((player) => {
            const online = isOnline(
              player.last_seen_at
            );

            const whatsapp =
              normalizeWhatsApp(
                player.whatsapp_number
              );

            return (
              <li
                key={player.id}
                className={
                  online
                    ? `${styles.card} ${styles.cardOnline}`
                    : styles.card
                }
              >
                <div className={styles.identity}>
                  <span
                    className={
                      online
                        ? `${styles.dot} ${styles.dotOnline}`
                        : styles.dot
                    }
                    title={
                      online
                        ? "En ligne"
                        : "Hors ligne"
                    }
                  />

                  <div>
                    <strong
                      className={styles.username}
                    >
                      {player.username}
                    </strong>

                    <span
                      className={styles.efootball}
                    >
                      eFootball : {player.efootball_username}
                    </span>
                  </div>
                </div>

                <div className={styles.details}>
                  <span className={styles.tag}>
                    Division {player.division}
                  </span>

                  <span className={styles.tag}>
                    {formatGameMode(
                      player.game_mode
                    )}
                  </span>

                  <span
                    className={styles.lastSeen}
                  >
                    {formatLastSeen(
                      player.last_seen_at
                    )}
                  </span>
                </div>

                <div className={styles.actions}>
                  <Link
                    href="/challenge"
                    className={`button ${styles.challengeButton}`}
                  >
                    <Swords />
                    Défier
                  </Link>

                  {whatsapp && (
                    <a
                      href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                        WHATSAPP_MESSAGE
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.whatsappButton}
                    >
                      <MessageCircle />
                      WhatsApp
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
