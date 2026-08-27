import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowLeft,
  BadgeCheck,
  MapPin,
  ShieldCheck,
  Swords
} from "lucide-react";

import { Logo } from "@/components/Logo";

import styles from "./AuthShell.module.css";

type AuthShellProps = {
  type: "login" | "register";
  title: string;
  description: string;
  children: ReactNode;
  redirectPath?: string;
};

export function AuthShell({
  type,
  title,
  description,
  children,
  redirectPath
}: AuthShellProps) {
  const isLogin = type === "login";

  const withRedirect = (path: string): string => {
    if (
      redirectPath &&
      redirectPath.startsWith("/") &&
      !redirectPath.startsWith("//")
    ) {
      return `${path}?redirect=${encodeURIComponent(
        redirectPath
      )}`;
    }

    return path;
  };

  return (
    <main className={styles.page}>
      <aside className={styles.presentation}>
        <div
          className={styles.stadiumLight}
          aria-hidden="true"
        />

        <Link
          href="/"
          className={styles.backLink}
        >
          <ArrowLeft />
          Retour à l’accueil
        </Link>

        <div className={styles.presentationContent}>
          <Logo />

          <p className={styles.kicker}>
            Compétition eFootball
          </p>

          <h1>
            TON PROCHAIN
            <br />
            <em>ADVERSAIRE</em>
            <br />
            T’ATTEND.
          </h1>

          <p className={styles.presentationText}>
            Crée ton profil, affronte des joueurs
            proches de ton niveau et fais parler ton jeu.
          </p>

          <div className={styles.features}>
            <span>
              <Swords />
              Matchmaking compétitif
            </span>

            <span>
              <MapPin />
              Proximité géographique prioritaire
            </span>

            <span>
              <BadgeCheck />
              Résultats contrôlés
            </span>

            <span>
              <ShieldCheck />
              Crédits de compétition protégés
            </span>
          </div>
        </div>

        <p className={styles.disclaimer}>
          Les crédits actuels sont fictifs et sans
          valeur monétaire.
        </p>
      </aside>

      <section className={styles.formSection}>
        <div className={styles.mobileHeader}>
          <Logo />

          <Link href="/">
            <ArrowLeft />
            Retour
          </Link>
        </div>

        <div className={styles.formContainer}>
          <nav
            className={styles.tabs}
            aria-label="Authentification"
          >
            <Link
              href={withRedirect("/login")}
              className={
                isLogin
                  ? styles.activeTab
                  : undefined
              }
            >
              Connexion
            </Link>

            <Link
              href={withRedirect("/register")}
              className={
                !isLogin
                  ? styles.activeTab
                  : undefined
              }
            >
              Inscription
            </Link>
          </nav>

          <header className={styles.formHeader}>
            <span>
              {isLogin
                ? "Heureux de te revoir"
                : "Rejoins la compétition"}
            </span>

            <h2>{title}</h2>
            <p>{description}</p>
          </header>

          {children}

          <p className={styles.switchText}>
            {isLogin
              ? "Tu n’as pas encore de compte ?"
              : "Tu possèdes déjà un compte ?"}

            <Link
              href={withRedirect(
                isLogin ? "/register" : "/login"
              )}
            >
              {isLogin
                ? "Créer un compte"
                : "Se connecter"}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
          }
