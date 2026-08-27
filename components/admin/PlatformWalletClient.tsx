"use client";

import { useActionState } from "react";

import {
  Banknote,
  CheckCircle2,
  LoaderCircle,
  Smartphone
} from "lucide-react";

import {
  requestPlatformWithdrawalAction,
  type PlatformWithdrawState
} from "@/app/admin/platform/actions";

import styles from "./PlatformWalletClient.module.css";

const INITIAL_STATE: PlatformWithdrawState = {
  success: false,
  message: ""
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export default function PlatformWalletClient({
  balance
}: {
  balance: number;
}) {
  const [state, formAction, isPending] =
    useActionState(
      requestPlatformWithdrawalAction,
      INITIAL_STATE
    );

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <Banknote />
        <div>
          <span>Portefeuille GOALX (commissions)</span>
          <strong>
            {formatAmount(balance)} <small>FCFA</small>
          </strong>
        </div>
      </header>

      <form action={formAction} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="platform-amount">
            Montant à retirer
          </label>
          <input
            id="platform-amount"
            name="amount"
            type="number"
            min={2000}
            step={500}
            inputMode="numeric"
            placeholder="Ex : 5 000"
            disabled={isPending}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="platform-phone">
            Numéro Mobile Money (Wave)
          </label>
          <div className={styles.phoneWrap}>
            <Smartphone className={styles.icon} />
            <input
              id="platform-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder="07 00 00 00 00"
              disabled={isPending}
            />
          </div>
        </div>

        {state.message && (
          <div
            className={
              state.success
                ? "form-message form-message--success"
                : "form-message form-message--error"
            }
            role="alert"
          >
            {state.success && <CheckCircle2 />}
            {state.message}
          </div>
        )}

        <button
          type="submit"
          className="button"
          disabled={isPending || balance < 2000}
        >
          {isPending ? (
            <>
              <LoaderCircle className={styles.spinner} />
              Traitement…
            </>
          ) : (
            "Retirer les commissions"
          )}
        </button>

        <small className={styles.hint}>
          Minimum 2 000 FCFA. L'argent part vers ton
          compte Wave. En cas d'échec, le montant est
          recrédité automatiquement.
        </small>
      </form>
    </section>
  );
}
