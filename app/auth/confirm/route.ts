import {
  NextResponse,
  type NextRequest
} from "next/server";

import { createClient } from "@/lib/supabase/server";

function getSafeNextPath(
  requestedPath: string | null
): string {
  if (
    requestedPath &&
    requestedPath.startsWith("/") &&
    !requestedPath.startsWith("//")
  ) {
    return requestedPath;
  }

  return "/dashboard";
}

export async function GET(
  request: NextRequest
) {
  const requestUrl = new URL(request.url);

  const code =
    requestUrl.searchParams.get("code");

  const nextPath = getSafeNextPath(
    requestUrl.searchParams.get("next")
  );

  if (!code) {
    const errorUrl = new URL(
      "/login",
      requestUrl.origin
    );

    errorUrl.searchParams.set(
      "error",
      "Lien de confirmation invalide."
    );

    return NextResponse.redirect(errorUrl);
  }

  const supabase = await createClient();

  const {
    error
  } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (error) {
    const errorUrl = new URL(
      "/login",
      requestUrl.origin
    );

    errorUrl.searchParams.set(
      "error",
      "Le lien de confirmation a expiré ou a déjà été utilisé."
    );

    return NextResponse.redirect(errorUrl);
  }

  const destinationUrl = new URL(
    nextPath,
    requestUrl.origin
  );

  destinationUrl.searchParams.set(
    "confirmed",
    "true"
  );

  return NextResponse.redirect(
    destinationUrl
  );
    }
