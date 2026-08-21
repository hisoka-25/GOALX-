"use client";

import {
  useActionState,
  useState
} from "react";

import {
  Check,
  Gamepad2,
  LoaderCircle,
  Save
} from "lucide-react";

import {
  updateProfileAction,
  type ProfileActionState
} from "@/app/(player)/profile/actions";

import {
  countries
} from "@/lib/countries";

import styles from "./ProfileForm.module.css";

type ProfileFormProps = {
  username: string;
  efootballUsername: string;
  team: string;
  division: number;
  gameMode: string;
  countryCode: string;
};

const gameModes = [
  {
    value: "MOBILE",
    label: "Mobile"
  },
  {
    value: "PLAYSTATION",
    label: "PlayStation"
  },
  {
    value: "XBOX",
    label: "Xbox"
  },
  {
    value: "PC",
    label: "PC"
  }
];
const initialProfileActionState: ProfileActionState = {
  success: false,
  message: ""
};
export function ProfileForm({
  username,
  efootballUsername,
  team,
  division,
  gameMode,
  countryCode
}: ProfileFormProps) {
  const [
    state,
    formAction,
    isPending
  ] = useActionState(
    updateProfileAction,
    initialProfileActionState
  );

  const [
    selectedGameMode,
    setSelectedGameMode
  ] = useState(gameMode);

  return (
    <form
      action={formAction}
      className={styles.form}
    >
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

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <span>Identité GOALX</span>

          <h2>
            INFORMATIONS DU COMPTE
          </h2>

          <p>
            Ton nom GOALX est visible par les
            autres joueurs dans l’application.
          </p>
        </header>

        <div className={styles.fields}>
          <div className="field">
            <label htmlFor="username">
              Nom d’utilisateur GOALX
            </label>

            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              maxLength={24}
              defaultValue={username}
              autoComplete="username"
              aria-describedby={
                state.errors?.username
                  ? "profile-username-error"
                  : undefined
              }
            />

            {state.errors?.username && (
              <span
                id="profile-username-error"
                className="field-error"
              >
                {state.errors.username}
              </span>
            )}

            <small className={styles.help}>
              Lettres, chiffres et underscores
              uniquement.
            </small>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <span>Profil eFootball</span>

          <h2>
            INFORMATIONS DE JEU
          </h2>

          <p>
            Ces informations servent à identifier
            ton compte et à trouver un adversaire
            compatible.
          </p>
        </header>

        <div className={styles.fields}>
          <div className={styles.fieldGrid}>
            <div className="field">
              <label htmlFor="efootball_username">
                Nom d’utilisateur eFootball
              </label>

              <input
                id="efootball_username"
                name="efootball_username"
                type="text"
                required
                minLength={2}
                maxLength={40}
                defaultValue={
                  efootballUsername
                }
                aria-describedby={
                  state.errors
                    ?.efootball_username
                    ? "profile-efootball-error"
                    : undefined
                }
              />

              {state.errors
                ?.efootball_username && (
                <span
                  id="profile-efootball-error"
                  className="field-error"
                >
                  {
                    state.errors
                      .efootball_username
                  }
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="team">
                Équipe utilisée
              </label>

              <input
                id="team"
                name="team"
                type="text"
                required
                minLength={2}
                maxLength={60}
                defaultValue={team}
                aria-describedby={
                  state.errors?.team
                    ? "profile-team-error"
                    : undefined
                }
              />

              {state.errors?.team && (
                <span
                  id="profile-team-error"
                  className="field-error"
                >
                  {state.errors.team}
                </span>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="division">
              Division eFootball
            </label>

            <select
              id="division"
              name="division"
              required
              defaultValue={String(
                division
              )}
              aria-describedby={
                state.errors?.division
                  ? "profile-division-error"
                  : undefined
              }
            >
              {Array.from(
                {
                  length: 10
                },
                (_, index) => index + 1
              ).map((divisionOption) => (
                <option
                  key={divisionOption}
                  value={divisionOption}
                >
                  Division {divisionOption}
                </option>
              ))}
            </select>

            {state.errors?.division && (
              <span
                id="profile-division-error"
                className="field-error"
              >
                {state.errors.division}
              </span>
            )}

            <small className={styles.help}>
              La division ne peut pas être
              modifiée pendant un match actif.
            </small>
          </div>

          <div className="field">
            <label htmlFor="country_code">
              Pays de jeu
            </label>

            <select
              id="country_code"
              name="country_code"
              required
              defaultValue={countryCode}
              aria-describedby={
                state.errors?.country_code
                  ? "profile-country-error"
                  : undefined
              }
            >
              {countries.map((country) => (
                <option
                  key={country.code}
                  value={country.code}
                >
                  {country.name}
                </option>
              ))}
            </select>

            {state.errors?.country_code && (
              <span
                id="profile-country-error"
                className="field-error"
              >
                {state.errors.country_code}
              </span>
            )}

            <small className={styles.help}>
              Le pays détermine les adversaires proches proposés par GOALX.
            </small>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <span>Appareil utilisé</span>

          <h2>
            MODE DE JEU
          </h2>

          <p>
            Tu rencontreras uniquement des joueurs
            utilisant le même mode de jeu.
          </p>
        </header>

        <fieldset
          className={styles.gameModeFieldset}
          aria-describedby={
            state.errors?.game_mode
              ? "profile-game-mode-error"
              : undefined
          }
        >
          <legend className="sr-only">
            Sélectionne ton mode de jeu
          </legend>

          <input
            type="hidden"
            name="game_mode"
            value={selectedGameMode}
          />

          <div className={styles.gameModes}>
            {gameModes.map((mode) => {
              const selected =
                selectedGameMode ===
                mode.value;

              return (
                <button
                  key={mode.value}
                  type="button"
                  className={
                    selected
                      ? `${styles.gameMode} ${styles.gameModeSelected}`
                      : styles.gameMode
                  }
                  onClick={() => {
                    setSelectedGameMode(
                      mode.value
                    );
                  }}
                  aria-pressed={selected}
                >
                  <Gamepad2 />

                  <span>{mode.label}</span>

                  {selected && (
                    <Check
                      className={
                        styles.check
                      }
                    />
                  )}
                </button>
              );
            })}
          </div>

          {state.errors?.game_mode && (
            <span
              id="profile-game-mode-error"
              className="field-error"
            >
              {state.errors.game_mode}
            </span>
          )}
        </fieldset>
      </section>

      <footer className={styles.footer}>
        <button
          type="submit"
          className="button"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <LoaderCircle
                className="spinner"
              />
              Enregistrement
            </>
          ) : (
            <>
              <Save />
              Enregistrer les modifications
            </>
          )}
        </button>
      </footer>
    </form>
  );
              }
