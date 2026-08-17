import {
  NextResponse,
  type NextRequest
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorizedResponse() {
  return NextResponse.json(
    {
      success: false,
      message: "Accès non autorisé."
    },
    {
      status: 401
    }
  );
}

export async function GET(
  request: NextRequest
) {
  const cronSecret =
    process.env.CRON_SECRET;

  /*
   * La route refuse de fonctionner si le secret
   * n’est pas configuré. Cela évite qu’une personne
   * extérieure déclenche le traitement.
   */
  if (!cronSecret) {
    return NextResponse.json(
      {
        success: false,
        message:
          "La variable CRON_SECRET est absente."
      },
      {
        status: 500
      }
    );
  }

  const authorizationHeader =
    request.headers.get("authorization");

  if (
    authorizationHeader !==
    `Bearer ${cronSecret}`
  ) {
    return unauthorizedResponse();
  }

  try {
    const admin =
      createAdminClient();

    /*
     * La fonction PostgreSQL recherche tous les
     * matchs dont le délai est expiré, restitue
     * les mises et les déclare inachevés.
     */
    const {
      data,
      error
    } = await admin.rpc(
      "expire_evidence_deadlines"
    );

    if (error) {
      console.error(
        "GOALX_MATCH_EXPIRATION_ERROR",
        {
          message: error.message,
          code: error.code
        }
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Le traitement des matchs expirés a échoué."
        },
        {
          status: 500
        }
      );
    }

    const expiredMatches =
      typeof data === "number"
        ? data
        : Number(data ?? 0);

    return NextResponse.json({
      success: true,
      expiredMatches,
      message:
        expiredMatches === 0
          ? "Aucun match expiré."
          : `${expiredMatches} match(s) déclaré(s) inachevé(s).`,
      executedAt:
        new Date().toISOString()
    });
  } catch (error) {
    console.error(
      "GOALX_CRON_UNEXPECTED_ERROR",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Une erreur inattendue est survenue."
      },
      {
        status: 500
      }
    );
  }
}
