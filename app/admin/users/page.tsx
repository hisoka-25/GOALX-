import type {
  Metadata
} from "next";

import Link from "next/link";

import {
  notFound,
  redirect
} from "next/navigation";

import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Search,
  ShieldCheck,
  UserCog,
  Users,
  Wallet
} from "lucide-react";

import {
  reactivateUserAction,
  suspendUserAction
} from "./actions";

import {
  createAdminClient
} from "@/lib/supabase/admin";

import {
  createClient
} from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Gestion des joueurs"
};

type AdminUsersPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

type WalletData = {
  available_balance: number;
  reserved_balance: number;
};

type ProfileData = {
  id: string;
  username: string;
  efootball_username: string;
  team: string;
  division: number;
  game_mode: string;
  role: string;
  account_status: string;
  created_at: string;

  wallets:
    | WalletData
    | WalletData[]
    | null;
};

type AuditProfile = {
  username: string;
};

type AuditData = {
  id: string;
  action: string;
  created_at: string;
  details: Record<
    string,
    unknown
  >;

  admin:
    | AuditProfile
    | AuditProfile[];

  target:
    | AuditProfile
    | AuditProfile[]
    | null;
};

function getWallet(
  value:
    | WalletData
    | WalletData[]
    | null
): WalletData | undefined {
  return Array.isArray(value)
    ? value[0]
    : value ?? undefined;
}

function getProfileName(
  value:
    | AuditProfile
    | AuditProfile[]
    | null
): string {
  if (!value) {
    return "Compte supprimé";
  }

  if (Array.isArray(value)) {
    return (
      value[0]?.username ??
      "Compte supprimé"
    );
  }

  return value.username;
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

export default async function AdminUsersPage({
  searchParams
}: AdminUsersPageProps) {
  const {
    q = ""
  } = await searchParams;

  const supabase =
    await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/login?redirect=/admin/users"
    );
  }

  const {
    data: currentProfile
  } = await supabase
    .from("profiles")
    .select(
      "role, account_status"
    )
    .eq("id", user.id)
    .single();

  if (
    currentProfile?.role !== "ADMIN" ||
    currentProfile.account_status !==
      "ACTIVE"
  ) {
    notFound();
  }

  const admin =
    createAdminClient();

  const [
    profilesResult,
    authResult,
    auditResult
  ] = await Promise.all([
    admin
      .from("profiles")
      .select(
        `
          id,
          username,
          efootball_username,
          team,
          division,
          game_mode,
          role,
          account_status,
          created_at,
          wallets (
            available_balance,
            reserved_balance
          )
        `
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(200),

    admin.auth.admin.listUsers({
      page: 1,
      perPage: 200
    }),

    admin
      .from("admin_audit_logs")
      .select(
        `
          id,
          action,
          created_at,
          details,
          admin:profiles!admin_audit_logs_admin_id_fkey (
            username
          ),
          target:profiles!admin_audit_logs_target_user_id_fkey (
            username
          )
        `
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(20)
  ]);

  if (profilesResult.error) {
    throw new Error(
      "Impossible de charger les joueurs."
    );
  }

  const emailById =
    new Map(
      authResult.data.users.map(
        (authUser) => [
          authUser.id,
          authUser.email ?? ""
        ]
      )
    );

  const searchTerm =
    q.trim().toLowerCase();

  const profiles =
    (
      profilesResult.data ??
      []
    ) as unknown as ProfileData[];

  const filteredProfiles =
    profiles.filter(
      (profile) => {
        if (!searchTerm) {
          return true;
        }

        const email =
          emailById.get(
            profile.id
          ) ?? "";

        return (
          profile.username
            .toLowerCase()
            .includes(searchTerm) ||
          profile.efootball_username
            .toLowerCase()
            .includes(searchTerm) ||
          email
            .toLowerCase()
            .includes(searchTerm)
        );
      }
    );

  const audits =
    (
      auditResult.data ??
      []
    ) as unknown as AuditData[];

  const suspendedCount =
    filteredProfiles.filter(
      (profile) =>
        profile.account_status ===
        "SUSPENDED"
    ).length;

  return (
    <main className={styles.page}>
      <Link
        className={styles.back}
        href="/admin"
      >
        <ArrowLeft />
        Centre de verdict
      </Link>

      <header className={styles.heading}>
        <span className="eyebrow">
          Administration GOALX
        </span>

        <h1>
          GESTION DES
          <br />
          <em>JOUEURS.</em>
        </h1>

        <p>
          Consulte les comptes et
          bloque uniquement les joueurs
          qui ne respectent pas les règles.
        </p>
      </header>

      <section className={styles.stats}>
        <div>
          <Users />

          <span>
            Comptes affichés
          </span>

          <strong>
            {filteredProfiles.length}
          </strong>
        </div>

        <div>
          <ShieldCheck />

          <span>
            Comptes suspendus
          </span>

          <strong>
            {suspendedCount}
          </strong>
        </div>
      </section>

      <form className={styles.search}>
        <Search />

        <input
          name="q"
          defaultValue={q}
          placeholder="Nom GOALX, nom eFootball ou e-mail"
        />

        <button className="button">
          Rechercher
        </button>
      </form>

      <section className={styles.list}>
        {filteredProfiles.map(
          (profile) => {
            const playerWallet =
              getWallet(
                profile.wallets
              );

            const isCurrentAdmin =
              profile.id === user.id;

            return (
              <article
                className={styles.userCard}
                key={profile.id}
              >
                <div className={styles.avatar}>
                  {profile.username
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <div className={styles.identity}>
                  <span>
                    {profile.role}
                  </span>

                  <h2>
                    {profile.username}
                  </h2>

                  <p>
                    {emailById.get(
                      profile.id
                    ) ||
                      "E-mail indisponible"}
                  </p>

                  <small>
                    {
                      profile.efootball_username
                    }
                    {" · "}
                    Division{" "}
                    {profile.division}
                    {" · "}
                    {formatGameMode(
                      profile.game_mode
                    )}
                  </small>
                </div>

                <div className={styles.money}>
                  <Wallet />

                  <span>
                    Disponible
                  </span>

                  <strong>
                    {Number(
                      playerWallet
                        ?.available_balance ??
                        0
                    ).toLocaleString(
                      "fr-FR"
                    )}{" "}
                    FCFA
                  </strong>

                  <small>
                    Réservé :{" "}
                    {Number(
                      playerWallet
                        ?.reserved_balance ??
                        0
                    ).toLocaleString(
                      "fr-FR"
                    )}{" "}
                    FCFA
                  </small>
                </div>

                <div className={styles.state}>
                  <span
                    className={
                      profile.account_status ===
                      "ACTIVE"
                        ? styles.active
                        : styles.suspended
                    }
                  >
                    {profile.account_status ===
                    "ACTIVE"
                      ? "Actif"
                      : "Suspendu"}
                  </span>

                  {!isCurrentAdmin &&
                    profile.role !==
                      "ADMIN" && (
                      profile.account_status ===
                      "ACTIVE" ? (
                        <form
                          action={
                            suspendUserAction
                          }
                        >
                          <input
                            type="hidden"
                            name="user_id"
                            value={profile.id}
                          />

                          <button
                            className={
                              styles.suspend
                            }
                          >
                            <Ban />
                            Suspendre
                          </button>
                        </form>
                      ) : (
                        <form
                          action={
                            reactivateUserAction
                          }
                        >
                          <input
                            type="hidden"
                            name="user_id"
                            value={profile.id}
                          />

                          <button
                            className={
                              styles.reactivate
                            }
                          >
                            <CheckCircle2 />
                            Réactiver
                          </button>
                        </form>
                      )
                    )}
                </div>
              </article>
            );
          }
        )}

        {filteredProfiles.length === 0 && (
          <div className={styles.empty}>
            Aucun joueur ne correspond
            à cette recherche.
          </div>
        )}
      </section>

      <section className={styles.audit}>
        <header>
          <UserCog />

          <div>
            <span>
              Journal sécurisé
            </span>

            <h2>
              DERNIÈRES ACTIONS
            </h2>
          </div>
        </header>

        {audits.length === 0 ? (
          <p>
            Aucune action administrative
            enregistrée.
          </p>
        ) : (
          audits.map(
            (audit) => (
              <div
                className={
                  styles.auditLine
                }
                key={audit.id}
              >
                <strong>
                  {audit.action ===
                  "USER_SUSPENDED"
                    ? "Suspension"
                    : "Réactivation"}
                </strong>

                <span>
                  {getProfileName(
                    audit.admin
                  )}
                  {" → "}
                  {getProfileName(
                    audit.target
                  )}
                </span>

                <small>
                  {new Intl.DateTimeFormat(
                    "fr-FR",
                    {
                      dateStyle:
                        "medium",
                      timeStyle:
                        "short"
                    }
                  ).format(
                    new Date(
                      audit.created_at
                    )
                  )}
                </small>
              </div>
            )
          )
        )}
      </section>
    </main>
  );
  }
