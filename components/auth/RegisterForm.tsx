"use client";

import {
  useActionState,
  useState
} from "react";

import {
  Check,
  Gamepad2,
  LoaderCircle,
  UserPlus
} from "lucide-react";

import {
  registerAction
} from "@/app/auth/actions";

import {
  countries
} from "@/lib/countries";

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

const initialState: {
  success: boolean;
  message: string;
  errors?: Record<
    string,
    string
  >;
} = {
  success: false,
  message: ""
};

export function RegisterForm() {
  const [
    state,
    formAction,
    isPending
  ] = useActionState(
    registerAction,
    initialState
  );

  const [
    selectedGameMode,
    setSelectedGameMode
  ] = useState("MOBILE");

  return (
    <form
      action={formAction}
      className="form"
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

      <div className="form-grid">
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
            autoComplete="username"
            placeholder="Exemple : Kader_X"
            aria-describedby={
              state.errors?.username
                ? "username-error"
                : undefined
            }
          />

          {state.errors?.username && (
            <span
              id="username-error"
              className="field-error"
            >
              {state.errors.username}
            </span>
          )}
        </div>

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
            placeholder="Ton nom affiché dans le jeu"
            aria-describedby={
              state.errors
                ?.efootball_username
                ? "efootball-error"
                : undefined
            }
          />

          {state.errors
            ?.efootball_username && (
            <span
              id="efootball-error"
              className="field-error"
            >
              {
                state.errors
                  .efootball_username
              }
            </span>
          )}
        </div>
      </div>

      <div className="form-grid">
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
            placeholder="Exemple : FC Barcelone"
            aria-describedby={
              state.errors?.team
                ? "team-error"
                : undefined
            }
          />

          {state.errors?.team && (
            <span
              id="team-error"
              className="field-error"
            >
              {state.errors.team}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="division">
            Division eFootball
          </label>

          <select
            id="division"
            name="division"
            required
            defaultValue="4"
            aria-describedby={
              state.errors?.division
                ? "division-error"
                : undefined
            }
          >
            {Array.from(
              {
                length: 10
              },
              (
                _value,
                index
              ) => index + 1
            ).map(
              (division) => (
                <option
                  key={division}
                  value={division}
                >
                  Division {division}
                </option>
              )
            )}
          </select>

          {state.errors?.division && (
            <span
              id="division-error"
              className="field-error"
            >
              {state.errors.division}
            </span>
          )}
        </div>
      </div>

      <div className="field">
        <label htmlFor="country_code">
          Pays de jeu
        </label>

        <select
          id="country_code"
          name="country_code"
          required
          defaultValue="CI"
          aria-describedby={
            state.errors?.country_code
              ? "country-error"
              : undefined
          }
        >
          {countries.map(
            (country) => (
              <option
                key={country.code}
                value={country.code}
              >
                {country.name}
              </option>
            )
          )}
        </select>

        {state.errors?.country_code && (
          <span
            id="country-error"
            className="field-error"
          >
            {
              state.errors
                .country_code
            }
          </span>
        )}
      </div>

      <fieldset
        className="game-mode-fieldset"
        aria-describedby={
          state.errors?.game_mode
            ? "game-mode-error"
            : undefined
        }
      >
        <legend className="field-label">
          Mode de jeu
        </legend>

        <input
          type="hidden"
          name="game_mode"
          value={selectedGameMode}
        />

        <div className="game-mode-options">
          {gameModes.map(
            (mode) => {
              const isSelected =
                selectedGameMode ===
                mode.value;

              return (
                <button
                  key={mode.value}
                  type="button"
                  className={
                    isSelected
                      ? "game-mode-option game-mode-option--selected"
                      : "game-mode-option"
                  }
                  onClick={() => {
                    setSelectedGameMode(
                      mode.value
                    );
                  }}
                  aria-pressed={
                    isSelected
                  }
                >
                  <Gamepad2 />

                  <span>
                    {mode.label}
                  </span>

                  {isSelected && (
                    <Check
                      className="game-mode-check"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            }
          )}
        </div>

        {state.errors?.game_mode && (
          <span
            id="game-mode-error"
            className="field-error"
          >
            {
              state.errors
                .game_mode
            }
          </span>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="email">
          Adresse e-mail
        </label>

        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="joueur@email.com"
          aria-describedby={
            state.errors?.email
              ? "email-error"
              : undefined
          }
        />

        {state.errors?.email && (
          <span
            id="email-error"
            className="field-error"
          >
            {state.errors.email}
          </span>
        )}
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="password">
            Mot de passe
          </label>

          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="8 caractères minimum"
            aria-describedby={
              state.errors?.password
                ? "password-error"
                : undefined
            }
          />

          {state.errors?.password && (
            <span
              id="password-error"
              className="field-error"
            >
              {state.errors.password}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="confirm_password">
            Confirmer le mot de passe
          </label>

          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Répète ton mot de passe"
            aria-describedby={
              state.errors
                ?.confirm_password
                ? "confirm-password-error"
                : undefined
            }
          />

          {state.errors
            ?.confirm_password && (
            <span
              id="confirm-password-error"
              className="field-error"
            >
              {
                state.errors
                  .confirm_password
              }
            </span>
          )}
        </div>
      </div>

      <label className="terms-checkbox">
        <input
          type="checkbox"
          name="accepted_terms"
          required
        />

        <span>
          Je comprends que les crédits
          GOALX sont fictifs et n’ont
          aucune valeur monétaire dans
          cette version.
        </span>
      </label>

      {state.errors
        ?.accepted_terms && (
        <span className="field-error">
          {
            state.errors
              .accepted_terms
          }
        </span>
      )}

      <button
        type="submit"
        className="button button--full"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <LoaderCircle className="spinner" />
            Création du compte
          </>
        ) : (
          <>
            <UserPlus />
            Créer mon compte
          </>
        )}
      </button>
    </form>
  );
            }
