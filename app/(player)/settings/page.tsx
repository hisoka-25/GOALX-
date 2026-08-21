import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowRight,
  LockKeyhole,
  Mail
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Paramètres",
  description:
    "Consulte les paramètres de ton compte GOALX."
};

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: {
      user
    },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="eyebrow">
          Mon compte
        </span>

        <h1>
          TES
          <br />
          <em>PARAMÈTRES.</em>
        </h1>

        <p>
          Consulte les informations essentielles
          et sécurise l’accès à ton compte GOALX.
        </p>
      </header>

      <div className={styles.settings}>
        <article className={styles.card}>
          <span className={styles.icon}>
            <Mail />
          </span>

          <div className={styles.cardContent}>
            <span>Identité du compte</span>
            <h2>Adresse e-mail</h2>
            <p>
              {user.email ??
                "Adresse e-mail indisponible"}
            </p>
          </div>
        </article>

        <article className={styles.card}>
          <span className={styles.icon}>
            <LockKeyhole />
          </span>

          <div className={styles.cardContent}>
            <span>Sécurité</span>
            <h2>Mot de passe</h2>
            <p>
              Reçois un lien sécurisé par e-mail
              pour définir un nouveau mot de passe.
            </p>
          </div>

          <Link
            href="/forgot-password"
            className={styles.action}
          >
            Modifier
            <ArrowRight />
          </Link>
        </article>
      </div>
    </div>
  );
}
