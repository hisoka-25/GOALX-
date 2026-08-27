import type {
  Metadata
} from "next";

import Link from "next/link";

import {
  notFound,
  redirect
} from "next/navigation";

import {
  Clock3,
  Copy,
  Gamepad2,
  Share2,
  Swords,
  Wallet
} from "lucide-react";

import {
  acceptChallengeAction,
  cancelChallengeAction
} from "../actions";

import {
  createAdminClient
} from "@/lib/supabase/admin";

import {
  createClient
} from "@/lib/supabase/server";

import styles from "../challenge.module.css";

export const metadata: Metadata = {
  title: "Défi privé"
};

type ChallengePageProps = {
  params: Promise<{
    code: string;
  }>;

  searchParams: Promise<{
    error?: string;
  }>;
};

type CreatorData = {
  username: string;
  division: number;
  game_mode: string;
};

type ChallengeData = {
  code: string;
  creator_id: string;
  stake: number;
  game_mode: string;
  status: string;
  match_id: string | null;
  expires_at: string;

  creator:
    | CreatorData
    | CreatorData[];
};

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

  return labels[gameMode] ?? gameMode;
}

function getCreator(
  creator:
    | CreatorData
    | CreatorData[]
): CreatorData | undefined {
  return Array.isArray(creator)
    ? creator[0]
    : creator;
}

export default async function ChallengePage({
  params,
  searchParams
}: ChallengePageProps) {
  const {
    code: requestedCode
  } = await params;

  const query =
    await searchParams;

  const code =
    requestedCode.toUpperCase();

  if (
    !/^GX-[A-F0-9]{6}$/.test(code)
  ) {
    notFound();
  }

  const supabase =
    await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?redirect=/challenge/${code}`
    );
  }

  const admin =
    createAdminClient();

  const {
    data
  } = await admin
    .from("friend_challenges")
    .select(
      `
        code,
        creator_id,
        stake,
        game_mode,
        status,
        match_id,
        expires_at,
        creator:profiles!friend_challenges_creator_id_fkey (
          username,
          division,
          game_mode
        )
      `
    )
    .eq("code", code)
    .maybeSingle();

  if (!data) {
    notFound();
  }

  const challenge =
    data as unknown as ChallengeData;

  if (
    challenge.status === "ACCEPTED" &&
    challenge.match_id
  ) {
    redirect(
      `/matches/${challenge.match_id}`
    );
  }

  const {
    data: currentProfile
  } = await supabase
    .from("profiles")
    .select(
      `
        username,
        division,
        game_mode
      `
    )
    .eq("id", user.id)
    .single();

  const {
    data: currentWallet
  } = await supabase
    .from("wallets")
    .select("available_balance")
    .eq("user_id", user.id)
    .single();

  const creator =
    getCreator(
      challenge.creator
    );

  const isCreator =
    challenge.creator_id ===
    user.id;

  const expired =
    new Date(
      challenge.expires_at
    ).getTime() <= Date.now();

  const available =
    challenge.status === "PENDING" &&
    !expired;

  const sameMode =
    currentProfile?.game_mode ===
    challenge.game_mode;

  const enoughBalance =
    Number(
      currentWallet?.available_balance ??
      0
    ) >= Number(challenge.stake);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://goalx-murex.vercel.app";

  const inviteUrl =
    `${appUrl}/challenge/${challenge.code}`;

  const whatsappMessage =
    `Je te défie sur GOALX ! ` +
    `Mise : ${Number(
      challenge.stake
    ).toLocaleString("fr-FR")} FCFA. ` +
    `Accepte le défi ici : ${inviteUrl}`;

  const whatsappUrl =
    `https://wa.me/?text=${encodeURIComponent(
      whatsappMessage
    )}`;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="eyebrow">
          Défi privé
        </span>

        <h1>
          {isCreator ? (
            <>
              LIEN
              <br />
              <em>CRÉÉ.</em>
            </>
          ) : (
            <>
              TU ES
              <br />
              <em>DÉFIÉ.</em>
            </>
          )}
        </h1>

        <p>
          {isCreator
            ? "Partage ce lien à ton ami. Le premier joueur compatible qui l’accepte rejoint ton match."
            : `${creator?.username ?? "Un joueur"} t’invite à un match privé GOALX.`}
        </p>
      </header>

      {query.error && (
        <div className="form-message form-message--error">
          {query.error}
        </div>
      )}

      <section className={styles.inviteCard}>
        <div className={styles.duel}>
          <div>
            <span>Créateur</span>

            <strong>
              {creator?.username}
            </strong>

            <small>
              Division{" "}
              {creator?.division}
            </small>
          </div>

          <b>VS</b>

          <div>
            <span>Invité</span>

            <strong>
              {isCreator
                ? "Ton ami"
                : currentProfile?.username}
            </strong>

            <small>
              {isCreator
                ? "En attente"
                : `Division ${currentProfile?.division}`}
            </small>
          </div>
        </div>

        <div className={styles.parameters}>
          <div>
            <Gamepad2 />

            <span>Mode</span>

            <strong>
              {getModeLabel(
                challenge.game_mode
              )}
            </strong>
          </div>

          <div>
            <Wallet />

            <span>Mise</span>

            <strong>
              {Number(
                challenge.stake
              ).toLocaleString(
                "fr-FR"
              )}{" "}
              FCFA
            </strong>
          </div>

          <div>
            <Clock3 />

            <span>Expiration</span>

            <strong>
              15 minutes
            </strong>
          </div>
        </div>

        {isCreator ? (
          <div className={styles.shareArea}>
            <label>
              Code privé

              <div>
                <input
                  readOnly
                  value={
                    challenge.code
                  }
                />

                <Copy />
              </div>
            </label>

            <label>
              Lien d’invitation

              <div>
                <input
                  readOnly
                  value={inviteUrl}
                />

                <Share2 />
              </div>
            </label>

            <a
              className="button button--full"
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Share2 />
              Partager sur WhatsApp
            </a>

            <form
              action={
                cancelChallengeAction
              }
            >
              <input
                type="hidden"
                name="code"
                value={challenge.code}
              />

              <button
                className="button button--secondary button--full"
                disabled={!available}
              >
                Annuler le défi
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.acceptArea}>
            {!available && (
              <div className="form-message form-message--error">
                Ce défi a expiré ou
                n’est plus disponible.
              </div>
            )}

            {!sameMode && (
              <div className="form-message form-message--error">
                Mode incompatible :
                ton profil doit être en{" "}
                {getModeLabel(
                  challenge.game_mode
                )}.
              </div>
            )}

            {!enoughBalance && (
              <div className="form-message form-message--error">
                Ton solde est insuffisant.
              </div>
            )}

            <form
              action={
                acceptChallengeAction
              }
            >
              <input
                type="hidden"
                name="code"
                value={challenge.code}
              />

              <button
                className="button button--full"
                disabled={
                  !available ||
                  !sameMode ||
                  !enoughBalance
                }
              >
                <Swords />
                Accepter le défi
              </button>
            </form>

            <Link
              className="button button--secondary button--full"
              href="/dashboard"
            >
              Refuser et revenir
            </Link>
          </div>
        )}
      </section>

    </div>
  );
}
