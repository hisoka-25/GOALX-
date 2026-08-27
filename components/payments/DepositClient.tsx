"use client";

import {
  useActionState,
  useEffect,
  useState
} from "react";

import {
  LoaderCircle,
  ShieldCheck,
  Smartphone,
  CreditCard
} from "lucide-react";

import {
  initiateDepositAction,
  type DepositState
} from "@/app/(player)/wallet/deposit/actions";

import styles from "./DepositClient.module.css";

const QUICK_AMOUNTS = [
  1_000,
  2_000,
  5_000,
  10_000
];

const INITIAL_STATE: DepositState = {
  success: false,
  message: "",
  checkoutUrl: null
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat(
    "fr-FR"
  ).format(value);
}

export default function DepositClient() {
  const [selectedAmount, setSelectedAmount] =
    useState<number>(QUICK_AMOUNTS[0]);
  const [customAmount, setCustomAmount] =
    useState<string>("");

  const [state, formAction, isPending] =
    useActionState(
      initiateDepositAction,
      INITIAL_STATE
    );

  // Redirection vers la page de paiement GeniusPay.
  useEffect(() => {
    if (state.success && state.checkoutUrl) {
      window.location.href =
        state.checkoutUrl;
    }
  }, [state.success, state.checkoutUrl]);

  const effectiveAmount =
    customAmount.trim() !== ""
      ? Number(customAmount)
      : selectedAmount;

  function handleQuickAmount(
    amount: number
  ) {
    setSelectedAmount(amount);
    setCustomAmount("");
  }

  return (
    <form
      action={formAction}
      className={styles.form}
    >
      <fieldset className={styles.amounts}>
        <legend>
          Choisis un montant rapide
        </legend>

        <div className={styles.quickGrid}>
          {QUICK_AMOUNTS.map((amount) => {
            const isActive =
              customAmount.trim() === "" &&
              selectedAmount === amount;

            return (
              <button
                key={amount}
                type="button"
                className={
                  isActive
                    ? `${styles.quickButton} ${styles.quickButtonActive}`
                    : styles.quickButton
                }
                onClick={() =>
                  handleQuickAmount(amount)
                }
                disabled={isPending}
              >
                <strong>
                  {formatAmount(amount)}
                </strong>
                <span>FCFA</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className={styles.customField}>
        <label htmlFor="custom-amount">
          Ou montant personnalisé
        </label>

        <div className={styles.customInputWrap}>
          <input
            id="custom-amount"
            type="number"
            min={500}
            max={500_000}
            step={500}
            inputMode="numeric"
            placeholder="Ex : 3 000"
            value={customAmount}
            onChange={(event) =>
              setCustomAmount(event.target.value)
            }
            disabled={isPending}
          />
          <span>FCFA</span>
        </div>

        <small>
          Montant multiple de 500 FCFA (minimum 500).
        </small>
      </div>

      {/* Montant réellement envoyé au serveur. */}
      <input
        type="hidden"
        name="amount"
        value={
          Number.isFinite(effectiveAmount)
            ? effectiveAmount
            : ""
        }
      />

      {state.message && (
        <div
          className={
            state.success
              ? "form-message form-message--success"
              : "form-message form-message--error"
          }
          role="alert"
        >
          {state.message}
        </div>
      )}

      <button
        type="submit"
        className="button"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <LoaderCircle
              className={styles.spinner}
            />
            Redirection…
          </>
        ) : (
          <>
            Recharger
            {Number.isFinite(effectiveAmount) &&
            effectiveAmount > 0
              ? ` ${formatAmount(effectiveAmount)} FCFA`
              : ""}
          </>
        )}
      </button>

      <div className={styles.paymentInfo}>
        <ShieldCheck />
        <p>
          Paiement sécurisé via{" "}
          <strong>GeniusPay</strong>. Tu seras
          redirigé vers une page de paiement pour
          choisir ton moyen de paiement.
        </p>
      </div>

      <div className={styles.methods}>
        <span>
          <Smartphone /> Wave
        </span>
        <span>Orange Money</span>
        <span>MTN MoMo</span>
        <span>Moov Money</span>
        <span>
          <CreditCard /> Carte
        </span>
      </div>
    </form>
  );
}
