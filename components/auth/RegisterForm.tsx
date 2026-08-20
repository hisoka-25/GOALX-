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
        <Field
          id="username"
          label="Nom d’utilisateur GOALX"
          placeholder="Exemple : Kader_X"
          error={
            state.errors?.username
          }
          minLength={3}
          maxLength={24}
          autoComplete="username"
        />

        <Field
          id="efootball_username"
          label="Nom d’utilisateur eFootball"
          placeholder="Ton nom affiché dans le jeu"
          error={
            state.errors
              ?.efootball_username
          }
          minLength={2}
          maxLength={40}
        />
      </div>

      <div className="form-grid">
        <Field
          id="team"
          label="Équipe utilisée"
          placeholder="Exemple : FC Barcelone"
          error={state.errors?.team}
          minLength={2}
          maxLength={60}
        />

        <div className="field">
          <label htmlFor="division">
            Division eFootball
          </label>

          <select
            id="division"
            name="division"
            required
            defaultValue="4"
          >
            {Array.from(
              {
                length: 10
              },
              (_, index) =>
                index + 1
            ).map(
              (division) => (
                <option
                  key={division}
                  value={division}
                >
                  Division{" "}
                  {division}
                </option>
              )
            )}
          </select>

          <ErrorText
            message={
              state.errors?.division
            }
          />
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

        <ErrorText
          message={
            state.errors
              ?.country_code
          }
        />
      </div>

      <fieldset className="game-mode-fieldset">
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
              const selected =
                selectedGameMode ===
                mode.value;

              return (
                <button
                  key={mode.value}
                  type="button"
                  className={
                    selected
                      ? "game-mode-option game-mode-option--selected"
                      : "game-mode-option"
                  }
                  onClick={() => {
                    setSelectedGameMode(
                      mode.value
                    );
                  }}
                  aria-pressed={
                    selected
                  }
                >
                  <Gamepad2 />

                  <span>
                    {mode.label}
                  </span>

                  {selected && (
                    <Check className="game-mode-check" />
                  )}
                </button>
              );
            }
          )}
        </div>

        <ErrorText
          message={
            state.errors?.game_mode
          }
        />
      </fieldset>

      <Field
        id="email"
        label="Adresse e-mail"
        type="email"
        placeholder="joueur@email.com"
        error={state.errors?.email}
        autoComplete="email"
      />

      <div className="form-grid">
        <Field
          id="password"
          label="Mot de passe"
          type="password"
          placeholder="8 caractères minimum"
          error={
            state.errors?.password
          }
          minLength={8}
          autoComplete="new-password"
        />

        <Field
          id="confirm_password"
          label="Confirmer le mot de passe"
          type="password"
          placeholder="Répète ton mot de passe"
          error={
            state.errors
              ?.confirm_password
          }
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <label className="terms-checkbox">
        <input
          type="checkbox"
          name="accepted_terms"
          required
        />

        <span>
          Je comprends que les
          crédits GOALX sont fictifs
          et n’ont aucune valeur
          monétaire dans cette
          version.
        </span>
      </label>

      <ErrorText
        message={
          state.errors
            ?.accepted_terms
        }
      />

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

type FieldProps = {
  id: string;
  label: string;

  type?:
    | "text"
    | "email"
    | "password";

  placeholder: string;
  error?: string;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
};

function Field({
  id,
  label,
  type = "text",
  placeholder,
  error,
  minLength,
  maxLength,
  autoComplete
}: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        name={id}
        type={type}
        required
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={
          autoComplete
        }
        placeholder={
          placeholder
        }
        aria-invalid={
          Boolean(error)
        }
      />

      <ErrorText
        message={error}
      />
    </div>
  );
}

function ErrorText({
  message
}: {
  message?: string;
}) {
  return message ? (
    <span className="field-error">
      {message}
    </span>
  ) : null;
        }
