import type { Metadata } from "next";

import { redirect } from "next/navigation";

import {
  Bell,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Wallet
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Paramètres",
  description:
    "Consulte les paramètres de ton compte GOALX."
};

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: {
      user
    },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <div
      style={{
        width: "min(100%, 900px)",
        margin: "0 auto"
      }}
    >
      <header
        style={{
          marginBottom: "34px"
        }}
      >
        <span className="eyebrow">
          Mon compte
        </span>

        <h1
          style={{
            margin: "18px 0",
            fontFamily: "var(--font-display)",
            fontSize:
              "clamp(3.5rem, 7vw, 5.8rem)",
            fontWeight: 900,
            lineHeight: 0.84,
            letterSpacing: "-0.055em",
            textTransform: "uppercase"
          }}
        >
          TES
          <br />

          <em
            style={{
              color: "var(--primary)",
              fontStyle: "italic"
            }}
          >
            PARAMÈTRES.
          </em>
        </h1>

        <p
          style={{
            maxWidth: "580px",
            margin: 0,
            color: "var(--muted)",
            fontSize: "0.82rem",
            lineHeight: 1.7
          }}
        >
          Consulte les informations de sécurité
          et les fonctions prévues pour ton compte.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gap: "15px"
        }}
      >
        <SettingCard
          icon={<Mail />}
          title="Adresse e-mail"
          description={
            user.email ??
            "Adresse e-mail indisponible"
          }
          status="Compte Supabase"
        />

        <SettingCard
          icon={<LockKeyhole />}
          title="Mot de passe"
          description="La modification du mot de passe sera ajoutée prochainement."
          status="Bientôt disponible"
        />

        <SettingCard
          icon={<Bell />}
          title="Notifications"
          description="Les notifications de matchmaking et de résultat seront ajoutées prochainement."
          status="Bientôt disponible"
        />

        <SettingCard
          icon={<Wallet />}
          title="Dépôts et retraits"
          description="Aucun paiement réel n’est actif dans cette version de GOALX."
          status="Crédits fictifs"
        />
      </div>

      <aside
        style={{
          marginTop: "15px",
          borderLeft:
            "2px solid var(--primary)",
          padding: "16px 18px",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          background:
            "rgba(217, 255, 56, 0.04)"
        }}
      >
        <ShieldCheck
          style={{
            width: "22px",
            height: "22px",
            flex: "0 0 auto",
            color: "var(--primary)"
          }}
        />

        <p
          style={{
            margin: 0,
            color: "#788594",
            fontSize: "0.65rem",
            lineHeight: 1.65
          }}
        >
          <strong
            style={{
              marginBottom: "4px",
              display: "block",
              color: "#b7c0ca",
              fontFamily:
                "var(--font-display)",
              fontSize: "0.72rem",
              fontWeight: 900,
              textTransform: "uppercase"
            }}
          >
            Sécurité du compte
          </strong>

          Ne partage jamais ton mot de passe,
          les liens reçus par e-mail ou les
          informations privées de ton compte.
        </p>
      </aside>
    </div>
  );
}

function SettingCard({
  icon,
  title,
  description,
  status
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <article
      style={{
        minHeight: "105px",
        border: "1px solid var(--border)",
        padding: "20px",
        display: "grid",
        gridTemplateColumns:
          "48px minmax(0, 1fr)",
        alignItems: "center",
        gap: "15px",
        background:
          "linear-gradient(145deg, #0f1721, #0a1017)"
      }}
    >
      <span
        style={{
          width: "46px",
          height: "46px",
          border:
            "1px solid rgba(217, 255, 56, 0.25)",
          display: "grid",
          placeItems: "center",
          background:
            "rgba(217, 255, 56, 0.05)",
          color: "var(--primary)"
        }}
      >
        {icon}
      </span>

      <div
        style={{
          minWidth: 0
        }}
      >
        <span
          style={{
            color: "var(--primary)",
            fontFamily:
              "var(--font-display)",
            fontSize: "0.54rem",
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase"
          }}
        >
          {status}
        </span>

        <h2
          style={{
            margin: "5px 0",
            fontFamily:
              "var(--font-display)",
            fontSize: "1rem",
            fontWeight: 900,
            textTransform: "uppercase"
          }}
        >
          {title}
        </h2>

        <p
          style={{
            margin: 0,
            overflowWrap: "anywhere",
            color: "#74818f",
            fontSize: "0.66rem",
            lineHeight: 1.55
          }}
        >
          {description}
        </p>
      </div>
    </article>
  );
            }
