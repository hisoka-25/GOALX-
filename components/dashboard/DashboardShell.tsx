"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  Bell,
  Gamepad2,
  History,
  Home,
  LogOut,
  Menu,
  Settings,
  Swords,
  User,
  UserPlus,
  Wallet,
  X
} from "lucide-react";

import { logoutAction } from "@/app/auth/actions";
import { Logo } from "@/components/Logo";

import styles from "./DashboardShell.module.css";

type DashboardShellProps = {
  children: ReactNode;
  username: string;
  division: number;
  gameMode: string;
  balance: number;
};

const navigation = [
  {
    href: "/dashboard",
    label: "Accueil",
    icon: Home
  },
    {
    href: "/matchmaking",
    label: "Trouver un match",
    icon: Swords
  },
  {
    href: "/challenge",
    label: "Défier un ami",
    icon: UserPlus
  },
  {
    href: "/matches",
    label: "Mes matchs",
    icon: History
  },
  {
    href: "/wallet",
    label: "Portefeuille",
    icon: Wallet
  },
  {
    href: "/profile",
    label: "Mon profil",
    icon: User
  }
];

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

function formatBalance(
  balance: number
): string {
  return new Intl.NumberFormat("fr-FR").format(
    balance
  );
}

export function DashboardShell({
  children,
  username,
  division,
  gameMode,
  balance
}: DashboardShellProps) {
  const pathname = usePathname();

  const [
    mobileMenuOpen,
    setMobileMenuOpen
  ] = useState(false);

  const initial =
    username.trim().charAt(0).toUpperCase() || "G";

  function isActive(
    href: string
  ): boolean {
    if (href === "/dashboard") {
      return pathname === href;
    }

    return pathname.startsWith(href);
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }

  return (
    <div className={styles.shell}>
      {mobileMenuOpen && (
        <button
          type="button"
          className={styles.overlay}
          onClick={closeMobileMenu}
          aria-label="Fermer le menu"
        />
      )}

      <aside
        className={
          mobileMenuOpen
            ? `${styles.sidebar} ${styles.sidebarOpen}`
            : styles.sidebar
        }
      >
        <div className={styles.sidebarHeader}>
          <Logo href="/dashboard" />

          <button
            type="button"
            className={styles.closeButton}
            onClick={closeMobileMenu}
            aria-label="Fermer le menu"
          >
            <X />
          </button>
        </div>

        <nav
          className={styles.navigation}
          aria-label="Navigation du joueur"
        >
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileMenu}
                className={
                  active
                    ? `${styles.navigationLink} ${styles.navigationLinkActive}`
                    : styles.navigationLink
                }
              >
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.balanceCard}>
            <span>Crédits disponibles</span>

            <strong>
              {formatBalance(balance)}
              <small> FCFA</small>
            </strong>

            <p>Crédits fictifs</p>
          </div>

          <Link
            href="/settings"
            className={styles.secondaryLink}
            onClick={closeMobileMenu}
          >
            <Settings />
            Paramètres
          </Link>

          <form action={logoutAction}>
            <button
              type="submit"
              className={styles.logoutButton}
            >
              <LogOut />
              Déconnexion
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.mainArea}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => {
              setMobileMenuOpen(true);
            }}
            aria-label="Ouvrir le menu"
          >
            <Menu />
          </button>

          <div className={styles.gameMode}>
            <span>Mode de jeu</span>

            <strong>
              <Gamepad2 />
              {formatGameMode(gameMode)}
            </strong>
          </div>

          <div className={styles.accountArea}>
            <button
              type="button"
              className={styles.notificationButton}
              aria-label="Notifications"
            >
              <Bell />
              <i />
            </button>

            <span className={styles.avatar}>
              {initial}
            </span>

            <div className={styles.identity}>
              <strong>{username}</strong>
              <span>Division {division}</span>
            </div>
          </div>
        </header>

        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
    }
