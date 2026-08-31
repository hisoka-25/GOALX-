import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  History,
  LockKeyhole,
  Minus,
  Plus,
  Trophy,
  Wallet
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Portefeuille",
  description:
    "Consulte ton solde et l’historique de tes opérations GOALX."
};

type WalletData = {
  id: string;
  available_balance: number;
  reserved_balance: number;
  created_at: string;
};

type TransactionData = {
  id: string;
  match_id: string | null;
  transaction_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
};

type TransactionPresentation = {
  label: string;
  description: string;
  className: string;
  icon: typeof Wallet;
};

function formatCredits(
  amount: number
): string {
  return new Intl.NumberFormat("fr-FR").format(
    amount
  );
}

function formatDate(
  date: string
): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}

function getTransactionPresentation(
  transaction: TransactionData
): TransactionPresentation {
  switch (transaction.transaction_type) {
    case "WELCOME_CREDIT":
      return {
        label: "Crédits de bienvenue",
        description:
          "Crédits offerts à l’inscription",
        className: styles.positive,
        icon: Wallet
      };

    case "DEPOSIT":
      return {
        label: "Recharge",
        description:
          "Crédits ajoutés via Jèko",
        className: styles.positive,
        icon: Plus
      };

    case "DEPOSIT_FAILED":
      return {
        label: "Recharge échouée",
        description:
          "Le paiement n'a pas abouti",
        className: styles.negative,
        icon: ArrowUpRight
      };

    case "WITHDRAWAL":
      return {
        label: "Retrait Mobile Money",
        description:
          "Envoi vers ton compte Wave",
        className: styles.negative,
        icon: Minus
      };

    case "WITHDRAWAL_REFUNDED":
      return {
        label: "Retrait recrédité",
        description:
          "Le retrait a échoué, montant rendu",
        className: styles.positive,
        icon: ArrowDownLeft
      };

    case "STAKE_RESERVED":
      return {
        label: "Mise engagée",
        description:
          "Crédits réservés pour un match",
        className: styles.reserved,
        icon: LockKeyhole
      };

    case "MATCH_WIN":
      return {
        label: "Match gagné",
        description:
          "Gain attribué après la commission",
        className: styles.positive,
        icon: Trophy
      };

    case "MATCH_LOSS":
      return {
        label: "Match perdu",
        description:
          "La mise engagée est définitivement perdue",
        className: styles.negative,
        icon: ArrowUpRight
      };

    case "STAKE_RETURNED":
      return {
        label: "Mise restituée",
        description:
          "Match déclaré inachevé",
        className: styles.returned,
        icon: ArrowDownLeft
      };

    default:
      return {
        label: "Opération GOALX",
        description:
          transaction.description ??
          "Mouvement de crédits",
        className: styles.neutral,
        icon: History
      };
  }
}

function getDisplayedAmount(
  transaction: TransactionData
): string {
  /*
   * MATCH_LOSS possède un montant nul, car la mise
   * a déjà été retirée lors de sa réservation.
   */
  if (
    transaction.transaction_type ===
      "MATCH_LOSS" &&
    transaction.amount === 0
  ) {
    return "Mise perdue";
  }

  if (transaction.amount > 0) {
    return `+${formatCredits(
      transaction.amount
    )} FCFA`;
  }

  if (transaction.amount < 0) {
    return `${formatCredits(
      transaction.amount
    )} FCFA`;
  }

  return "0 FCFA";
}

export default async function WalletPage() {
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

  const {
    data: walletResult,
    error: walletError
  } = await supabase
    .from("wallets")
    .select(
      `
        id,
        available_balance,
        reserved_balance,
        created_at
      `
    )
    .eq("user_id", user.id)
    .single();

  if (
    walletError ||
    !walletResult
  ) {
    return (
      <div className={styles.page}>
        <div className="form-message form-message--error">
          Ton portefeuille est momentanément
          indisponible.
        </div>
      </div>
    );
  }

  const wallet =
    walletResult as WalletData;

  const {
    data: transactionResult,
    error: transactionError
  } = await supabase
    .from("wallet_transactions")
    .select(
      `
        id,
        match_id,
        transaction_type,
        amount,
        balance_after,
        description,
        created_at
      `
    )
    .eq("wallet_id", wallet.id)
    .order("created_at", {
      ascending: false
    })
    .limit(100);

  const transactions =
    transactionError
      ? []
      : (
          transactionResult ?? []
        ) as TransactionData[];

  const availableBalance = Number(
    wallet.available_balance
  );

  const reservedBalance = Number(
    wallet.reserved_balance
  );

  const totalBalance =
    availableBalance +
    reservedBalance;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="eyebrow">
          Portefeuille
        </span>

        <h1>
          TES
          <br />
          <em>CRÉDITS.</em>
        </h1>

        <p>
          Consulte ton solde et les opérations
          liées à tes matchs GOALX.
        </p>
      </header>

      <section className={styles.walletCard}>
        <div className={styles.walletHeader}>
          <div>
            <span>Solde disponible</span>

            <strong>
              {formatCredits(
                availableBalance
              )}
              <small> FCFA</small>
            </strong>

          </div>

          <Wallet />
        </div>

        <div className={styles.balanceDetails}>
          <div>
            <span>Crédits réservés</span>

            <strong>
              {formatCredits(
                reservedBalance
              )}{" "}
              FCFA
            </strong>

            <small>
              Engagés dans des matchs actifs
            </small>
          </div>

          <div>
            <span>Total du portefeuille</span>

            <strong>
              {formatCredits(
                totalBalance
              )}{" "}
              FCFA
            </strong>

            <small>
              Disponible et réservé
            </small>
          </div>
        </div>

        <div className={styles.walletActions}>
          <Link
            href="/wallet/deposit"
            className="button"
          >
            <Plus />
            Recharger
          </Link>

          <Link
            href="/wallet/withdraw"
            className="button button--secondary"
          >
            <Minus />
            Retirer
          </Link>
        </div>
      </section>


      <section className={styles.history}>
        <header className={styles.historyHeader}>
          <div>
            <span>Historique</span>

            <h2>
              DERNIÈRES OPÉRATIONS
            </h2>
          </div>

          <History />
        </header>

        {transactions.length === 0 ? (
          <div className={styles.emptyState}>
            <Clock3 />

            <strong>
              Aucune opération
            </strong>

            <p>
              Les mouvements de tes crédits
              apparaîtront ici.
            </p>
          </div>
        ) : (
          <div className={styles.transactionList}>
            {transactions.map(
              (transaction) => {
                const presentation =
                  getTransactionPresentation(
                    transaction
                  );

                const Icon =
                  presentation.icon;

                return (
                  <article
                    className={
                      styles.transaction
                    }
                    key={transaction.id}
                  >
                    <div
                      className={`${styles.transactionIcon} ${presentation.className}`}
                    >
                      <Icon />
                    </div>

                    <div
                      className={
                        styles.transactionIdentity
                      }
                    >
                      <strong>
                        {presentation.label}
                      </strong>

                      <span>
                        {transaction.description ??
                          presentation.description}
                      </span>

                      <small>
                        {formatDate(
                          transaction.created_at
                        )}
                      </small>
                    </div>

                    <div
                      className={
                        styles.transactionAmount
                      }
                    >
                      <strong
                        className={
                          presentation.className
                        }
                      >
                        {getDisplayedAmount(
                          transaction
                        )}
                      </strong>

                      <span>
                        Solde :{" "}
                        {formatCredits(
                          Number(
                            transaction.balance_after
                          )
                        )}{" "}
                        FCFA
                      </span>
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}
      </section>
    </div>
  );
          }
