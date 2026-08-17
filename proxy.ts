import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Applique le proxy à toutes les pages, sauf :
     * - les fichiers internes de Next.js ;
     * - les images optimisées ;
     * - le favicon ;
     * - les fichiers statiques courants.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
