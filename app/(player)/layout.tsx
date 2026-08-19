import type {
  ReactNode
} from "react";

import {
  redirect
} from "next/navigation";

import {
  DashboardShell
} from "@/components/dashboard/DashboardShell";

import {
  createClient
} from "@/lib/supabase/server";

type PlayerLayoutProps = {
  children: ReactNode;
};

type WalletData = {
  available_balance: number;
};

type ProfileData = {
  username: string;
  division: number;
  game_mode: string;
  role: string;
  account_status: string;

  wallets:
    | WalletData
    | WalletData[]
    | null;
};

function getAvailableBalance(
  wallets:
    | WalletData
    | WalletData[]
    | null
): number {
  if (!wallets) {
    return 0;
  }

  if (Array.isArray(wallets)) {
    return Number(
      wallets[0]
        ?.available_balance ?? 0
    );
  }

  return Number(
    wallets.available_balance ?? 0
  );
}

export default async function PlayerLayout({
  children
}: PlayerLayoutProps) {
  const supabase =
    await createClient();

  const {
    data: {
      user
    },
    error: userError
  } = await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    redirect("/login");
  }

  const {
    data,
    error: profileError
  } = await supabase
    .from("profiles")
    .select(
      `
        username,
        division,
        game_mode,
        role,
        account_status,
        wallets (
          available_balance
        )
      `
    )
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !data
  ) {
    redirect(
      "/login?error=profile_not_found"
    );
  }

  const profile =
    data as unknown as ProfileData;

  if (
    profile.account_status ===
    "SUSPENDED"
  ) {
    await supabase.auth.signOut();

    redirect(
      "/login?error=account_suspended"
    );
  }

  const balance =
    getAvailableBalance(
      profile.wallets
    );

  return (
    <DashboardShell
      username={profile.username}
      division={profile.division}
      gameMode={profile.game_mode}
      balance={balance}
      isAdmin={
        profile.role === "ADMIN"
      }
    >
      {children}
    </DashboardShell>
  );
}
