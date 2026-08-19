"use client";

import {
  type FormEvent,
  useState
} from "react";

import {
  KeyRound,
  LoaderCircle,
  Mail
} from "lucide-react";

import {
  AuthShell
} from "@/components/auth/AuthShell";

import {
  createClient
} from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [
    email,
    setEmail
  ] = useState("");

  const [
    pending,
    setPending
  ] = useState(false);

  const [
    error,
    setError
  ] = useState("");

  const [
    sent,
    setSent
  ] = useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setPending(true);
    setError("");

    const supabase =
      createClient();

    const redirectTo =
      `${window.location.origin}` +
      `/auth/confirm?next=/update-password`;

    const {
      error: resetError
    } =
      await supabase.auth
        .resetPasswordForEmail(
          email
            .trim()
            .toLowerCase(),
          {
            redirectTo
          }
        );

    setPending(false);

    if (resetError) {
      setError(
        resetError.message
          .toLowerCase()
          .includes("rate")
          ? "Trop de demandes. Attends quelques minutes avant de réessayer."
          : "Impossible d’envoyer l’e-mail pour le moment."
      );

      return;
    }

    setSent(true);
  }

  return (
    <AuthShell
      type="login"
      title="Mot de passe oublié"
      description="Reçois un lien sécurisé pour choisir un nouveau mot de passe."
    >
      {sent ? (
        <div
          className="form-message form-message--success"
          role="status"
        >
          <Mail />

          Si cette adresse correspond
          à un compte GOALX, un e-mail
          de réinitialisation vient
          d’être envoyé. Vérifie aussi
          le dossier spam.
        </div>
      ) : (
        <form
          className="form"
          onSubmit={submit}
        >
          {error && (
            <div
              className="form-message form-message--error"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="reset-email">
              Adresse e-mail
            </label>

            <input
              id="reset-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(
                  event.target.value
                );
              }}
              placeholder="joueur@email.com"
            />
          </div>

          <button
            className="button button--full"
            disabled={pending}
          >
            {pending ? (
              <>
                <LoaderCircle className="spinner" />
                Envoi en cours
              </>
            ) : (
              <>
                <KeyRound />
                Envoyer le lien sécurisé
              </>
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
                  }
