"use client";

import { useActionState } from "react";

import {
  LoaderCircle,
  LogIn
} from "lucide-react";

import {
  initialState,
  loginAction
} from "@/app/auth/actions";

type LoginFormProps = {
  redirectPath?: string;
};

export function LoginForm({
  redirectPath = "/dashboard"
}: LoginFormProps) {
  const [
    state,
    formAction,
    isPending
  ] = useActionState(
    loginAction,
    initialState
  );

  return (
    <form
      action={formAction}
      className="form"
    >
      <input
        type="hidden"
        name="redirect"
        value={redirectPath}
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
              ? "login-email-error"
              : undefined
          }
        />

        {state.errors?.email && (
          <span
            id="login-email-error"
            className="field-error"
          >
            {state.errors.email}
          </span>
        )}
      </div>

      <div className="field">
        <div className="field-heading">
          <label htmlFor="password">
            Mot de passe
          </label>

          <a href="mailto:support@goalx.app">
            Mot de passe oublié ?
          </a>
        </div>

        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Entre ton mot de passe"
          aria-describedby={
            state.errors?.password
              ? "login-password-error"
              : undefined
          }
        />

        {state.errors?.password && (
          <span
            id="login-password-error"
            className="field-error"
          >
            {state.errors.password}
          </span>
        )}
      </div>

      <button
        type="submit"
        className="button button--full"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <LoaderCircle className="spinner" />
            Connexion en cours
          </>
        ) : (
          <>
            <LogIn />
            Se connecter
          </>
        )}
      </button>
    </form>
  );
      }
