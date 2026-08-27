import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowLeft } from "lucide-react";

import WithdrawClient from "@/components/payments/WithdrawClient";

import { createClient } from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Retirer mes gains",
  description:
    "Retire tes crédits GOALX vers ton compte Mobile Money Wave en toute sécurité via GeniusPay."
};

export default async function WithdrawPage() {
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("available_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  const availableBalance = wallet
    ? Number(wallet.available_balance)
    : 0;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="eyebrow">
          Portefeuille
        </span>

        <h1>
          RETIRER
          <br />
          <em>MES GAINS.</em>
        </h1>

        <p>
          Reçois tes crédits directement sur ton
          compte Mobile Money. Le montant est
          transféré en quelques instants.
        </p>
      </header>

      <section className={styles.card}>
        <WithdrawClient
          availableBalance={availableBalance}
        />
      </section>

      <Link
        href="/wallet"
        className={styles.backLink}
      >
        <ArrowLeft />
        Retour au portefeuille
      </Link>
    </div>
  );
}
