import type {
  Metadata
} from "next";

import {
  Gift,
  UserPlus
} from "lucide-react";

import {
  createChallengeAction
} from "./actions";

import styles from "./challenge.module.css";

export const metadata: Metadata = {
  title: "Défier un ami"
};

type ChallengePageProps = {
  searchParams: Promise<{
    error?: string;
    cancelled?: string;
  }>;
};

export default async function NewChallengePage({
  searchParams
}: ChallengePageProps) {
  const parameters =
    await searchParams;

  const stakes = [
    500,
    1000,
    2000,
    5000
  ];

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <span className="eyebrow">
          Match privé
        </span>

        <h1>
          DÉFIE
          <br />
          <em>UN AMI.</em>
        </h1>

        <p>
          Crée un lien privé, partage-le
          sur WhatsApp et joue directement
          avec la personne de ton choix.
        </p>
      </header>

      {parameters.error && (
        <div className="form-message form-message--error">
          {parameters.error}
        </div>
      )}

      {parameters.cancelled && (
        <div className="form-message form-message--success">
          Le défi a été annulé.
        </div>
      )}

      <form
        action={createChallengeAction}
        className={styles.createCard}
      >
        <div className={styles.cardTitle}>
          <UserPlus />

          <div>
            <span>
              Étape unique
            </span>

            <h2>
              CHOISIS LA MISE
            </h2>
          </div>
        </div>

        <div className={styles.stakes}>
          {stakes.map(
            (stake, index) => (
              <label key={stake}>
                <input
                  type="radio"
                  name="stake"
                  value={stake}
                  defaultChecked={
                    index === 0
                  }
                />

                <span>
                  <small>
                    Mise
                  </small>

                  <strong>
                    {stake.toLocaleString(
                      "fr-FR"
                    )}
                  </strong>

                  <b>FCFA</b>
                </span>
              </label>
            )
          )}
        </div>

        <div className={styles.info}>
          <Gift />

          <p>
            <strong>
              Le lien expire après
              15 minutes.
            </strong>

            Aucun crédit n’est réservé
            avant que ton ami accepte.
          </p>
        </div>

        <button
          className="button button--full"
          type="submit"
        >
          <UserPlus />
          Créer le lien privé
        </button>

      </form>
    </div>
  );
}
