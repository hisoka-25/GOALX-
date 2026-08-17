import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Connexion",
  description:
    "Connecte-toi à ton compte GOALX pour rejoindre la compétition."
};

type LoginPageProps = {
  searchParams: Promise<{
    redirect?: string | string[];
  }>;
};

function getSafeRedirectPath(
  redirectParameter: string | string[] | undefined
): string {
  const redirectPath = Array.isArray(redirectParameter)
    ? redirectParameter[0]
    : redirectParameter;

  if (
    redirectPath &&
    redirectPath.startsWith("/") &&
    !redirectPath.startsWith("//")
  ) {
    return redirectPath;
  }

  return "/dashboard";
}

export default async function LoginPage({
  searchParams
}: LoginPageProps) {
  const parameters = await searchParams;

  const redirectPath = getSafeRedirectPath(
    parameters.redirect
  );

  return (
    <AuthShell
      type="login"
      title="Bon retour dans l’arène"
      description="Connecte-toi pour retrouver ton profil, tes crédits et tes matchs."
    >
      <LoginForm redirectPath={redirectPath} />
    </AuthShell>
  );
}
