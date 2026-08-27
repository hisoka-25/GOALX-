import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  /*
   * Cette instruction renouvelle la session si nécessaire.
   * Ne place pas de code entre createServerClient et getUser.
   */
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  /* =========================================================
   * MODE MAINTENANCE
   * ---------------------------------------------------------
   * 1. Priorité : variable d'environnement Vercel
   *    MAINTENANCE_MODE=true  (fonctionne même si Supabase
   *    est temporairement indisponible)
   * 2. Sinon : table public.app_settings
   *    (activation instantanée via le SQL Editor)
   * ========================================================= */
  let maintenanceOn =
    process.env.MAINTENANCE_MODE === "true" ||
    process.env.MAINTENANCE_MODE === "1";

  if (!maintenanceOn) {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("maintenance_mode")
        .eq("id", true)
        .maybeSingle();

      if (!error && data?.maintenance_mode === true) {
        maintenanceOn = true;
      }
    } catch {
      /*
       * Si la table n'existe pas encore ou si la base
       * est indisponible, on ne bloque pas le site.
       */
      maintenanceOn = false;
    }
  }

  // Les routes API gèrent leur propre authentification
  // (webhooks GeniusPay, tâches planifiées) : elles ne
  // doivent pas être redirigées en mode maintenance, sinon
  // les notifications de paiement seraient perdues.
  const isApiRoute =
    pathname.startsWith("/api/");

  if (
    maintenanceOn &&
    pathname !== "/maintenance" &&
    !isApiRoute
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";

    return NextResponse.redirect(url);
  }

  const isPrivatePage =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/challenge") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/matchmaking") ||
    pathname.startsWith("/matches") ||
    pathname.startsWith("/wallet") ||
    pathname.startsWith("/profile");

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register");

  if (!user && isPrivatePage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);

    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";

    return NextResponse.redirect(url);
  }

  return response;
        }
