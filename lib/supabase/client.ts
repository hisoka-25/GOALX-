import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Les variables NEXT_PUBLIC_SUPABASE_URL et " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sont manquantes."
    );
  }

  return createBrowserClient(
    supabaseUrl,
    supabasePublishableKey
  );
}
