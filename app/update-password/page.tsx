"use client";

import {
  type FormEvent,
  useState
} from "react";

import {
  KeyRound,
  LoaderCircle,
  ShieldCheck
} from "lucide-react";

import {
  useRouter
} from "next/navigation";

import {
  AuthShell
} from "@/components/auth/AuthShell";

import {
  createClient
} from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router =
    useRouter();

  const [
    password,
    setPassword
  ] = useState("");

  const [
    confirmation,
    setConfirmation
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
    success,
    setSuccess
  ] = useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (password.length < 8) {
      setError(
        "Le mot de passe doit contenir au moins 8 caractères."
      );

      return;
    }

    if (
      password !== confirmation
    ) {
      setError(
        "Les deux mots de passe ne correspondent pas."
      );

      return;
    }

    setPending(true);

    const supabase =
      createClient();

    const {
      error: updateError
    } =
      await supabase.auth.updateUser({
        password
      });

    setPending(false);

    if (updateError) {
      setError(
        "Le lien a expiré ou la session est invalide. Demande un nouveau lien."
      );

      return;
    }

    setSuccess(true);

    window.setTimeout(
      () => {
        router.replace(
          "/dashboard"
        );
      },
      1200
    );
  }

  return (
    <AuthShell
      type="login"
      title="Nouveau mot de passe"
      description="Choisis un mot de passe sécurisé pour retrouver ton compte GOALX."
    >
      {success ? (
        <div
          className="form-message form-message--success"
          role="status"
        >
          <ShieldCheck />

          Mot de passe modifié.
          Redirection vers ton
          tableau de bord…
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
            <label htmlFor="new-password">
              Nouveau mot de passe
            </label>

            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(
                  event.target.value
                );
              }}
              placeholder="8 caractères minimum"
            />
          </div>

          <div className="field">
            <label htmlFor="confirm-new-password">
              Confirmer le mot de passe
            </label>

            <input
              id="confirm-new-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(
                  event.target.value
                );
              }}
              placeholder="Répète ton mot de passe"
            />
          </div>

          <button
            className="button button--full"
            disabled={pending}
          >
            {pending ? (
              <>
                <LoaderCircle className="spinner" />
                Enregistrement
              </>
            ) : (
              <>
                <KeyRound />
                Enregistrer le mot de passe
              </>
            )}
          </button>
        </form>
      )}
    </AuthShell>
  );
              }
