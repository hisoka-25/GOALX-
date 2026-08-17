import type { ReactNode } from "react";

import Link from "next/link";

import {
  ArrowLeft,
  Bot,
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
};

export function AuthShell({
  type,
  title,
  description,
  children
}: AuthShellProps) {
  const isLogin = type === "login";

  return (
    <main className={styles.page}>
      <aside className={styles.presentation}>
        <div
          className={styles.stadiumLight}
          aria-hidden="true"
        />

        <div
          className={styles.pitch}
          aria-hidden="true"
        >
          <span />
          <span />
          <span />
        </div>

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
            L’arène compétitive eFootball
          </p>

          <h1>
            TON PROCHAIN
            <br />
            <em>ADVERSAIRE</em>
            <br />
            T’ATTEND.
          </h1>

          <p className={styles.presentationText}>
            Crée ton profil, trouve un joueur
            de ta division et impose ton jeu.
          </p>

          <div className={styles.features}>
            <span>
              <Swords />
              Matchmaking réel
            </span>

            <span>
              <Bot />
              Analyse intelligente
            </span>

            <span>
              <ShieldCheck />
              Crédits fictifs protégés
            </span>
          </div>
        </div>

        <p className={styles.disclaimer}>
          Les crédits de cette version sont fictifs
          et n’ont aucune valeur monétaire.
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
              href="/login"
              className={
                isLogin
                  ? styles.activeTab
                  : undefined
              }
            >
              Connexion
            </Link>

            <Link
              href="/register"
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
                ? "Retour dans l’arène"
                : "Nouveau compétiteur"}
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
              href={
                isLogin
                  ? "/register"
                  : "/login"
              }
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
