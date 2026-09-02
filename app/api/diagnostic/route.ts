import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// =========================================================
// GOALX — Diagnostic IA (réservé à l'administrateur).
// Vérifie la présence et la validité de la clé Anthropic
// (Claude), moteur unique de lecture des captures.
// =========================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Chaque appel consomme des tokens Claude (payants) :
  // l'endpoint n'est accessible qu'à un administrateur connecté.
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Accès administrateur requis." },
      { status: 401 }
    );
  }

  const {
    data: profile
  } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "ADMIN") {
    return NextResponse.json(
      { success: false, message: "Accès administrateur requis." },
      { status: 401 }
    );
  }

  const claudeKey = process.env.ANTHROPIC_API_KEY || "";
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

  const result: {
    engine: string;
    model: string;
    claude: {
      configured: boolean;
      working: boolean;
      message: string;
    };
  } = {
    engine: "CLAUDE_ONLY",
    model,
    claude: {
      configured: Boolean(claudeKey),
      working: false,
      message: ""
    }
  };

  if (!claudeKey) {
    result.claude.message =
      "ANTHROPIC_API_KEY absente de l'environnement (Vercel).";
    return NextResponse.json(result);
  }

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 10,
        messages: [
          { role: "user", content: "Réponds uniquement par OK" }
        ]
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      const text =
        (data?.content ?? [])
          .map((b: { text?: string }) => b.text ?? "")
          .join("")
          .slice(0, 20) || "OK";

      result.claude.working = true;
      result.claude.message = `Claude répond correctement (${text}).`;
    } else {
      const errTxt = await resp.text();
      result.claude.message =
        `Claude répond avec une erreur : ${resp.status} — ${errTxt.slice(0, 200)}`;
    }
  } catch (e) {
    result.claude.message =
      `Erreur d'appel Claude : ${(e as Error).message}`;
  }

  return NextResponse.json(result);
}
