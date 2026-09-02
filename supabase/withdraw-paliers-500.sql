-- =========================================================
-- GOALX — RETRAITS PAR PALIERS DE 500 (règle métier)
-- À exécuter dans Supabase (SQL Editor) pour rétablir les
-- paliers de 500 FCFA annulés par le précédent script.
--
-- POURQUOI : les gains (900, 1800, 2700…) ne sont jamais des
-- multiples de 500 → chaque joueur conserve un reliquat de
-- 100 à 400 FCFA non retirable qui reste à la plateforme
-- (mécanisme de « casse ») et compense les frais Mobile Money.
-- Décision assumée du porteur du projet.
--
-- Ré-exécutable sans risque.
-- =========================================================

create or replace function public.request_withdrawal(
  requested_amount bigint,
  requested_phone text,
  requested_provider text default 'wave'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  current_wallet public.wallets%rowtype;
  new_withdrawal_id uuid;
  new_balance bigint;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  -- ⚠️ RÈGLE MÉTIER VOLONTAIRE — ne pas « corriger » :
  -- retraits par paliers de 500 FCFA (min 2 000, max 500 000).
  -- Les gains (900, 1800, 2700…) n'étant jamais des multiples
  -- de 500, chaque joueur conserve un reliquat non retirable
  -- (« casse ») qui reste à la plateforme et compense les frais
  -- Mobile Money. Décision du porteur du projet.
  if requested_amount is null
     or requested_amount < 2000
     or requested_amount > 500000
     or requested_amount % 500 <> 0 then
    raise exception 'INVALID_WITHDRAWAL_AMOUNT';
  end if;

  if requested_phone is null or length(trim(requested_phone)) < 8 then
    raise exception 'INVALID_PHONE';
  end if;

  select * into current_wallet
  from public.wallets
  where user_id = current_user_id
  for update;

  if current_wallet.id is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  if current_wallet.available_balance < requested_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.withdrawals
    (user_id, amount, phone_number, provider)
  values
    (current_user_id,
     requested_amount,
     trim(requested_phone),
     coalesce(nullif(trim(requested_provider), ''), 'wave'))
  returning id into new_withdrawal_id;

  update public.wallets
  set available_balance = available_balance - requested_amount
  where id = current_wallet.id
  returning available_balance into new_balance;

  insert into public.wallet_transactions
    (wallet_id, transaction_type, amount, balance_after, description)
  values
    (current_wallet.id,
     'WITHDRAWAL',
     -requested_amount,
     new_balance,
     'Demande de retrait Mobile Money');

  return new_withdrawal_id;
end;
$$;

revoke all on function public.request_withdrawal(bigint, text, text) from public;
grant execute on function public.request_withdrawal(bigint, text, text) to authenticated;
