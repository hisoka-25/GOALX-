import type { Metadata } from "next";

import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import DepositClient from "@/components/payments/DepositClient";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Recharger mon portefeuille",
  description:
    "Recharge tes crédits GOALX en toute sécurité via GeniusPay : Wave, Orange Money, MTN MoMo, Moov Money ou carte bancaire."
};

export default function DepositPage() {
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="eyebrow">
          Portefeuille
        </span>

        <h1>
          RECHARGER
          <br />
          <em>MES CRÉDITS.</em>
        </h1>

        <p>
          Choisis un montant, paie avec ton moyen
          préféré et reçois tes crédits
          instantanément. 1 FCFA = 1 crédit.
        </p>
      </header>

      <section className={styles.card}>
        <DepositClient />
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
