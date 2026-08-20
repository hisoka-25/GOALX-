import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { MatchmakingClient } from "@/components/matchmaking/MatchmakingClient";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Trouver un match",
  description:
    "Trouve un adversaire eFootball compatible avec ta division, ton mode de jeu et ta mise."
};

type ProfileData = {
  username: string;
  division: number;
  game_mode: string;
};

type WalletData = {
  available_balance: number;
};

type QueueData = {
  id: string;
  status: string;
  match_id: string | null;
  stake: number;
  allow_international: boolean;
};

export default async function MatchmakingPage() {
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

  const [
    profileResult,
    walletResult,
    queueResult
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        `
          username,
          division,
          game_mode
        `
      )
      .eq("id", user.id)
      .single(),

    supabase
      .from("wallets")
      .select("available_balance")
      .eq("user_id", user.id)
      .single(),

    supabase
      .from("matchmaking_queue")
      .select(
        `
          id,
          status,
          match_id,
          stake
        `
      )
      .eq("user_id", user.id)
      .in("status", [
        "SEARCHING",
        "MATCHED"
      ])
      .gt(
        "expires_at",
        new Date().toISOString()
      )
      .maybeSingle()
  ]);

  if (
    profileResult.error ||
    !profileResult.data
  ) {
    redirect(
      "/login?error=profile_not_found"
    );
  }

  if (
    walletResult.error ||
    !walletResult.data
  ) {
    redirect(
      "/dashboard?error=wallet_not_found"
    );
  }

  /*
   * L’absence de recherche est normale.
   * Une erreur autre que « aucune ligne »
   * provoque un retour vers le tableau de bord.
   */
  if (queueResult.error) {
    redirect(
      "/dashboard?error=matchmaking_unavailable"
    );
  }

  const profile =
    profileResult.data as ProfileData;

  const wallet =
    walletResult.data as WalletData;

  const queue =
    queueResult.data as QueueData | null;

  /*
   * Si un match a déjà été trouvé, le joueur
   * est directement envoyé dans sa salle.
   */
  if (
    queue?.status === "MATCHED" &&
    queue.match_id
  ) {
    redirect(
      `/matches/${queue.match_id}`
    );
  }

  return (
    <MatchmakingClient
      userId={user.id}
      username={profile.username}
      division={profile.division}
      gameMode={profile.game_mode}
      availableBalance={Number(
        wallet.available_balance
      )}
      initialQueueId={
        queue?.id ?? null
      }
      initialStatus={
        queue?.status ?? null
      }
      initialMatchId={
        queue?.match_id ?? null
      }
      initialStake={
        queue
          ? Number(queue.stake)
          : null
      }
      initialInternationalExpansion={
        queue?.allow_international ?? false
      }
    />
  );
        }
