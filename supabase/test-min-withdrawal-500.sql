-- =========================================================
-- TEST LIVE : minimum de retrait joueur temporairement à 500
-- ⚠️ Après validation du test, relancer pour remonter à 2000
--    (voir le commentaire en fin de fichier).
-- =========================================================

-- 1. Contrainte de la table.
alter table public.withdrawals
  drop constraint if exists withdrawals_amount_check;

alter table public.withdrawals
  add constraint withdrawals_amount_check
  check (amount >= 500);

-- 2. Fonction de demande de retrait (seuil à 500).
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

  if requested_amount is null
     or requested_amount < 500
     or requested_amount % 500 <> 0 then
    raise exception 'INVALID_WITHDRAWAL_AMOUNT';
  end if;

  if requested_phone is null or length(trim(requested_phone)) < 8 then
    raise exception 'INVALID_PHONE';
  end if;

  select *
  into current_wallet
  from public.wallets
  where user_id = current_user_id
  for update;

  if current_wallet.id is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  if current_wallet.available_balance < requested_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.withdrawals (
    user_id, amount, phone_number, provider
  )
  values (
    current_user_id,
    requested_amount,
    trim(requested_phone),
    coalesce(nullif(trim(requested_provider), ''), 'wave')
  )
  returning id into new_withdrawal_id;

  update public.wallets
  set available_balance = available_balance - requested_amount
  where id = current_wallet.id
  returning available_balance into new_balance;

  insert into public.wallet_transactions (
    wallet_id, transaction_type, amount, balance_after, description
  )
  values (
    current_wallet.id,
    'WITHDRAWAL',
    -requested_amount,
    new_balance,
    'Demande de retrait Mobile Money'
  );

  return new_withdrawal_id;
end;
$$;

revoke all on function public.request_withdrawal(bigint, text, text) from public;
grant execute on function public.request_withdrawal(bigint, text, text) to authenticated;

-- =========================================================
-- APRÈS LE TEST, pour remettre le minimum à 2000, exécute :
--
-- alter table public.withdrawals drop constraint if exists withdrawals_amount_check;
-- alter table public.withdrawals add constraint withdrawals_amount_check check (amount >= 2000);
-- (et remettre la fonction request_withdrawal avec le seuil 2000,
--  ou redéployer supabase/withdrawals.sql)
-- =========================================================
