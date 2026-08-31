"use client";

import {
  useActionState,
  useState
} from "react";

import {
  Banknote,
  CheckCircle2,
  LoaderCircle,
  Smartphone
} from "lucide-react";

import {
  requestWithdrawalAction,
  type WithdrawState
} from "@/app/(player)/wallet/withdraw/actions";

import styles from "./WithdrawClient.module.css";

const QUICK_AMOUNTS = [
  2_000,
  5_000,
  10_000,
  20_000
];

const INITIAL_STATE: WithdrawState = {
  success: false,
  message: ""
};

function formatAmount(value: number): string {
  return new Intl.NumberFormat(
    "fr-FR"
  ).format(value);
}

export default function WithdrawClient({
  availableBalance
}: {
  availableBalance: number;
}) {
  const [selectedAmount, setSelectedAmount] =
    useState<number>(QUICK_AMOUNTS[0]);
  const [customAmount, setCustomAmount] =
    useState<string>("");
  const [phone, setPhone] = useState<string>("");

  const [state, formAction, isPending] =
    useActionState(
      requestWithdrawalAction,
      INITIAL_STATE
    );

  const effectiveAmount =
    customAmount.trim() !== ""
      ? Number(customAmount)
      : selectedAmount;

  const amountValid =
    Number.isFinite(effectiveAmount) &&
    effectiveAmount >= 2000 &&
    effectiveAmount % 500 === 0 &&
    effectiveAmount <= availableBalance;

  return (
    <form
      action={formAction}
      className={styles.form}
    >
      <div className={styles.balanceNote}>
        <Banknote />
        <span>
          Solde disponible :{" "}
          <strong>
            {formatAmount(availableBalance)} FCFA
          </strong>
        </span>
      </div>

      <fieldset className={styles.amounts}>
        <legend>Montant du retrait</legend>

        <div className={styles.quickGrid}>
          {QUICK_AMOUNTS.map((amount) => {
            const isActive =
              customAmount.trim() === "" &&
              selectedAmount === amount;
            const tooHigh =
              amount > availableBalance;

            return (
              <button
                key={amount}
                type="button"
                className={
                  isActive
                    ? `${styles.quickButton} ${styles.quickButtonActive}`
                    : styles.quickButton
                }
                onClick={() => {
                  setSelectedAmount(amount);
                  setCustomAmount("");
                }}
                disabled={isPending || tooHigh}
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

      <div className={styles.field}>
        <label htmlFor="custom-amount">
          Ou montant personnalisé
        </label>
        <div className={styles.inputWrap}>
          <input
            id="custom-amount"
            type="number"
            min={2000}
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
      </div>

      <div className={styles.field}>
        <label htmlFor="phone">
          Numéro Mobile Money (Wave)
        </label>
        <div className={styles.inputWrap}>
          <Smartphone className={styles.inputIcon} />
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="07 00 00 00 00"
            value={phone}
            onChange={(event) =>
              setPhone(event.target.value)
            }
            disabled={isPending}
          />
        </div>
        <small>
          L'argent sera envoyé sur ce numéro. Vérifie-le
          bien.
        </small>
      </div>

      <input type="hidden" name="provider" value="wave" />
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
          {state.success && <CheckCircle2 />}
          {state.message}
        </div>
      )}

      <button
        type="submit"
        className="button"
        disabled={isPending || !amountValid}
      >
        {isPending ? (
          <>
            <LoaderCircle
              className={styles.spinner}
            />
            Traitement…
          </>
        ) : (
          <>Retirer{amountValid ? ` ${formatAmount(effectiveAmount)} FCFA` : ""}</>
        )}
      </button>

      <p className={styles.disclaimer}>
        Retrait minimum 2 000 FCFA. Les frais de
        l'opérateur peuvent s'appliquer sur le montant
        reçu. En cas d'échec, ton montant est
        automatiquement recrédité.
      </p>
    </form>
  );
}
