import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Créer un compte",
  description:
    "Crée ton profil GOALX et rejoins l’arène compétitive eFootball."
};

export default function RegisterPage() {
  return (
    <AuthShell
      type="register"
      title="Crée ton profil"
      description="Inscris tes informations de joueur et reçois 10 000 FCFA de crédits fictifs."
    >
      <RegisterForm />
    </AuthShell>
  );
}
