import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Créer un compte",
  description:
    "Crée ton profil GOALX et rejoins l’arène compétitive eFootball."
};

type RegisterPageProps = {
  searchParams: Promise<{
    redirect?: string | string[];
  }>;
};

function getSafeRedirectPath(
  redirectParameter:
    | string
    | string[]
    | undefined
): string {
  const redirectPath = Array.isArray(
    redirectParameter
  )
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

export default async function RegisterPage({
  searchParams
}: RegisterPageProps) {
  const parameters = await searchParams;

  const redirectPath =
    getSafeRedirectPath(parameters.redirect);

  return (
    <AuthShell
      type="register"
      title="Crée ton profil"
      description="Inscris tes informations de joueur pour rejoindre GOALX."
      redirectPath={redirectPath}
    >
      <RegisterForm redirectPath={redirectPath} />
    </AuthShell>
  );
}
