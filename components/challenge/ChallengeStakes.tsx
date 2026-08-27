"use client";

import { useState } from "react";

import styles from "./ChallengeStakes.module.css";

const stakeOptions = [500, 1000, 1500];

const MIN_STAKE = 500;
const STAKE_STEP = 500;

function formatCredits(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export default function ChallengeStakes() {
  const [selectedStake, setSelectedStake] =
    useState<number>(stakeOptions[0]);
  const [customStake, setCustomStake] =
    useState<string>("");

  const customValue =
    customStake.trim() !== ""
      ? Number(customStake)
      : Number.NaN;

  const customValid =
    Number.isSafeInteger(customValue) &&
    customValue >= MIN_STAKE &&
    customValue % STAKE_STEP === 0;

  const effectiveStake = customValid
    ? customValue
    : selectedStake;

  return (
    <>
      <input
        type="hidden"
        name="stake"
        value={effectiveStake}
      />

      <div className={styles.stakes}>
        {stakeOptions.map((stake) => {
          const selected =
            customStake.trim() === "" &&
            selectedStake === stake;

          return (
            <button
              type="button"
              key={stake}
              className={
                selected
                  ? `${styles.stake} ${styles.stakeSelected}`
                  : styles.stake
              }
              onClick={() => {
                setSelectedStake(stake);
                setCustomStake("");
              }}
              aria-pressed={selected}
            >
              <strong>{formatCredits(stake)}</strong>
              <small>FCFA</small>
              {selected && <i>Choisie</i>}
            </button>
          );
        })}
      </div>

      <div className={styles.customStake}>
        <label htmlFor="challenge-custom-stake">
          Ou personnalise ta mise
        </label>

        <div className={styles.customStakeField}>
          <input
            id="challenge-custom-stake"
            type="number"
            min={MIN_STAKE}
            step={STAKE_STEP}
            inputMode="numeric"
            placeholder="Ex : 2 000"
            value={customStake}
            onChange={(event) =>
              setCustomStake(event.target.value)
            }
          />
          <span>FCFA</span>
        </div>

        <small>
          Mise minimum 500 FCFA, par palier de 500.
        </small>

        {customStake.trim() !== "" && !customValid && (
          <p className={styles.error} role="alert">
            Saisis une mise valide (500 minimum, multiple
            de 500).
          </p>
        )}
      </div>
    </>
  );
}
