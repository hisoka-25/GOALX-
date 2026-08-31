"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import {
  CheckCircle2,
  LoaderCircle,
  Wallet,
  XCircle
} from "lucide-react";

import styles from "./DepositReturnClient.module.css";

type DepositStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

type DepositData = {
  id: string;
  amount: number;
  status: DepositStatus;
  payment_method?: string | null;
};

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 8; // ~24 secondes

function formatAmount(value: number): string {
  return new Intl.NumberFormat(
    "fr-FR"
  ).format(value);
}

export default function DepositReturnClient({
  depositId,
  initialStatus,
  amount
}: {
  depositId: string;
  initialStatus: DepositStatus;
  amount: number;
}) {
  const [status, setStatus] =
    useState<DepositStatus>(initialStatus);
  const [polls, setPolls] = useState(0);

  const sync = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/payments/deposit/${depositId}/sync`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        return;
      }

      const json: {
        success: boolean;
        deposit: DepositData;
      } = await response.json();

      if (json?.deposit?.status) {
        setStatus(json.deposit.status);
      }
    } catch {
      /* On réessaie au prochain intervalle. */
    }
  }, [depositId]);

  useEffect(() => {
    // Le webhook crédite généralement en quelques secondes.
    // On sonde la route de synchro tant que c'est en attente.
    if (
      status !== "PENDING" &&
      status !== "PROCESSING"
    ) {
      return;
    }

    if (polls >= MAX_POLLS) {
      return;
    }

    const timer = setTimeout(() => {
      void sync();
      setPolls((value) => value + 1);
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [status, polls, sync]);

  const isWaiting =
    status === "PENDING" ||
    status === "PROCESSING";

  const isSuccess = status === "COMPLETED";

  const isFailed =
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "EXPIRED";

  return (
    <div className={styles.container}>
      <div
        className={
          isSuccess
            ? `${styles.icon} ${styles.iconSuccess}`
            : isFailed
              ? `${styles.icon} ${styles.iconError}`
              : `${styles.icon} ${styles.iconWaiting}`
        }
      >
        {isSuccess ? (
          <CheckCircle2 />
        ) : isFailed ? (
          <XCircle />
        ) : (
          <LoaderCircle className={styles.spinner} />
        )}
      </div>

      <h1>
        {isSuccess
          ? "Recharge réussie !"
          : isFailed
            ? "Paiement non finalisé"
            : "Confirmation en cours…"}
      </h1>

      <p>
        {isSuccess
          ? `Tes ${formatAmount(amount)} FCFA ont été crédités sur ton portefeuille.`
          : isFailed
            ? "Le paiement n'a pas abouti. Aucun montant n'a été débité. Tu peux réessayer quand tu veux."
            : "Nous vérifions ton paiement auprès de Jèko. Cela ne prend que quelques secondes."}
      </p>

      <div className={styles.actions}>
        {isSuccess && (
          <Link
            href="/wallet"
            className="button"
          >
            <Wallet />
            Voir mon portefeuille
          </Link>
        )}

        {isFailed && (
          <Link
            href="/wallet/deposit"
            className="button"
          >
            Réessayer
          </Link>
        )}

        {isWaiting && (
          <span className={styles.waitingNote}>
            Ne ferme pas cette page…
          </span>
        )}

        <Link
          href="/wallet"
          className="button button--secondary"
        >
          Retour au portefeuille
        </Link>
      </div>
    </div>
  );
}
