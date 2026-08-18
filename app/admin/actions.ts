"use server";

import { revalidatePath } from "next/cache";

import {
  createAdminClient
} from "@/lib/supabase/admin";

import {
  createClient
} from "@/lib/supabase/server";

const allowedVerdicts = [
  "PLAYER_ONE_WON",
  "PLAYER_TWO_WON",
  "UNFINISHED"
];

function getText(
  formData: FormData,
  name: string
): string {
  const value = formData.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

export async function finalizeMatchByAdmin(
  formData: FormData
): Promise<void> {
  const matchId = getText(
    formData,
    "match_id"
  );

  const verdict = getText(
    formData,
    "verdict"
  );

  const score = getText(
    formData,
    "score"
  );

  const explanation = getText(
    formData,
    "explanation"
  );

  if (
    !/^[0-9a-f-]{36}$/i.test(matchId)
  ) {
    throw new Error(
      "Identifiant du match invalide."
    );
  }

  if (
    !allowedVerdicts.includes(verdict)
  ) {
    throw new Error(
      "Verdict invalide."
    );
  }

  if (
    explanation.length < 5 ||
    explanation.length > 1000
  ) {
    throw new Error(
      "L’explication doit contenir entre 5 et 1000 caractères."
    );
  }

  const supabase = await createClient();

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "Session expirée."
    );
  }

  const {
    data: profile
  } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "ADMIN") {
    throw new Error(
      "Accès administrateur refusé."
    );
  }

  const admin = createAdminClient();

  const {
    data: match
  } = await admin
    .from("matches")
    .select("id, status")
    .eq("id", matchId)
    .single();

  if (
    !match ||
    ![
      "WAITING_FOR_EVIDENCE",
      "AI_REVIEW"
    ].includes(match.status)
  ) {
    throw new Error(
      "Ce match ne peut pas recevoir de verdict."
    );
  }

  const {
    count
  } = await admin
    .from("match_evidence")
    .select(
      "id",
      {
        count: "exact",
        head: true
      }
    )
    .eq("match_id", matchId);

  if (
  verdict !== "UNFINISHED" &&
  Number(count ?? 0) < 1
) {
  throw new Error(
    "Au moins une capture claire est requise pour déclarer un gagnant."
  );
    }

  const {
    error
  } = await admin.rpc(
    "finalize_match",
    {
      requested_match_id: matchId,
      requested_verdict: verdict,
      requested_confidence: 1,
      requested_score: score,
      requested_explanation:
        explanation,
      requested_extracted_data: {
        method:
          "MANUAL_ADMIN_REVIEW",
        reviewed_by: user.id,
        evidence_count:
          Number(count ?? 0)
      },
      requested_model_name:
        "GOALX_ADMIN"
    }
  );

  if (error) {
    throw new Error(
      `Le verdict n’a pas pu être enregistré : ${error.message}`
    );
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/matches");
  revalidatePath(
    `/matches/${matchId}`
  );
      }
