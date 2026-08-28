import type { Metadata } from "next";

import { Wrench } from "lucide-react";

import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Maintenance",
  description:
    "GOALX est en cours de maintenance. On revient très vite.",
  robots: {
    index: false,
    follow: false
  }
};

const DEFAULT_MESSAGE =
  "Nous améliorons la plateforme pour une meilleure expérience. On revient très vite.";

export default async function MaintenancePage() {
  /*
   * On lit le message personnalisé de la table app_settings.
   * Si la base est momentanément indisponible, on affiche
   * un message de repli : la page doit TOUJOURS s'afficher.
   */
  let message = DEFAULT_MESSAGE;

  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from("app_settings")
      .select("maintenance_message")
      .eq("id", true)
      .maybeSingle();

    if (data?.maintenance_message) {
      message = data.maintenance_message;
    }
  } catch {
    message = DEFAULT_MESSAGE;
  }

  return (
    <main
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        padding: "40px 20px",
        background: "transparent",
        fontFamily: "var(--font-body)"
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: "560px",
          height: "560px",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(52, 216, 255, 0.12), transparent 65%)",
          pointerEvents: "none"
        }}
      />

      <div
        style={{
          position: "relative",
          width: "min(100%, 620px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center"
        }}
      >
        <Logo />

        <div
          style={{
            marginTop: "44px",
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            padding: "9px 18px",
            border: "1px solid rgba(52, 216, 255, 0.45)",
            borderRadius: "999px",
            background: "rgba(52, 216, 255, 0.09)",
            color: "#34d8ff",
            fontSize: "0.6rem",
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase"
          }}
        >
          <Wrench size={15} strokeWidth={2.4} />
          Maintenance en cours
        </div>

        <h1
          style={{
            margin: "22px 0 0",
            fontFamily: "var(--font-display)",
            fontSize: "clamp(3.4rem, 11vw, 6.4rem)",
            fontStyle: "italic",
            fontWeight: 950,
            lineHeight: 0.85,
            letterSpacing: "-0.05em",
            textTransform: "uppercase",
            color: "#ffffff"
          }}
        >
          ON REPEINT
          <br />
          <span style={{ color: "#34d8ff" }}>L&rsquo;ARÈNE.</span>
        </h1>

        <p
          style={{
            maxWidth: "430px",
            margin: "26px 0 0",
            color: "#9aa3ae",
            fontSize: "0.88rem",
            lineHeight: 1.65
          }}
        >
          {message}
        </p>

        <div
          style={{
            width: "min(100%, 460px)",
            marginTop: "30px",
            border: "1px solid #29292c",
            borderRadius: "8px",
            padding: "18px 20px",
            display: "grid",
            gap: "10px",
            background: "rgba(14,21,48,0.7)",
            textAlign: "left"
          }}
        >
          <Reassurance text="Tes crédits et ton solde sont en sécurité." />
          <Reassurance text="Aucun match en cours n'est perdu." />
          <Reassurance text="La maintenance est courte et contrôlée." />
        </div>

        <p
          style={{
            marginTop: "28px",
            color: "#5f6b78",
            fontSize: "0.62rem",
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase"
          }}
        >
          GOALX — Défie. Joue. Domine.
        </p>
      </div>
    </main>
  );
}

function Reassurance({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        color: "#c7ccd2",
        fontSize: "0.72rem",
        lineHeight: 1.5
      }}
    >
      <span
        style={{
          width: "7px",
          height: "7px",
          flex: "0 0 auto",
          borderRadius: "50%",
          background: "#69d38b"
        }}
      />
      {text}
    </div>
  );
}
