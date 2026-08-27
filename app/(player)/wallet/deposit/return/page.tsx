import type { Metadata } from "next";

import { redirect } from "next/navigation";

import DepositReturnClient from "@/components/payments/DepositReturnClient";

import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Retour de paiement",
  description: "Confirmation de ta recharge GOALX."
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SearchParams = Promise<{
  deposit?: string;
  result?: string;
}>;

export default async function DepositReturnPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const { deposit: depositId } =
    await searchParams;

  if (!depositId || !UUID_REGEX.test(depositId)) {
    redirect("/wallet");
  }

  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // RLS : l'utilisateur ne peut lire que ses propres recharges.
  const { data: deposit } = await supabase
    .from("deposits")
    .select("id, amount, status")
    .eq("id", depositId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!deposit) {
    redirect("/wallet");
  }

  return (
    <DepositReturnClient
      depositId={deposit.id}
      initialStatus={
        deposit.status as
          | "PENDING"
          | "PROCESSING"
          | "COMPLETED"
          | "FAILED"
          | "CANCELLED"
          | "EXPIRED"
      }
      amount={Number(deposit.amount)}
    />
  );
}
