import { NextResponse } from "next/server";

// Endpoint de diagnostic (temporaire) : vérifie la présence et la
// validité des clés de lecture d'images (Gemini/OpenAI).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const geminiKey = process.env.GEMINI_API_KEY || "";
  const openaiKey = process.env.OPENAI_API_KEY || "";

  const result: {
    gemini: { configured: boolean; working: boolean; message: string };
    openai: { configured: boolean };
  } = {
    gemini: {
      configured: Boolean(geminiKey),
      working: false,
      message: ""
    },
    openai: {
      configured: Boolean(openaiKey)
    }
  };

  if (geminiKey) {
    try {
      const model =
        process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: "Réponds uniquement par OK" }]
            }
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 10 }
        })
      });

      const data = await resp.json();

      if (resp.ok && data?.candidates?.[0]) {
        result.gemini.working = true;
        result.gemini.message = "Gemini fonctionne correctement.";
      } else {
        result.gemini.message =
          `Gemini répond avec une erreur : ${data?.error?.status ?? resp.status} — ${(data?.error?.message ?? "").slice(0, 200)}`;
      }
    } catch (e) {
      result.gemini.message = `Erreur d'appel Gemini : ${(e as Error).message}`;
    }
  } else {
    result.gemini.message =
      "GEMINI_API_KEY absente de l'environnement (Vercel).";
  }

  return NextResponse.json(result);
}
