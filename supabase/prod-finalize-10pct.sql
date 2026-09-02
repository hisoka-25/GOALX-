-- =========================================================
-- GOALX — Mise en configuration PRODUCTION.
-- Commission GOALX : 10 %
-- Dépôt minimum : 500 FCFA
-- Retrait minimum : 2 000 FCFA
-- =========================================================

-- 1. COMMISSION À 10 % ---------------------------------------
alter table public.matches
  alter column commission_rate set default 10;

create or replace function public.set_match_commission_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.commission_rate := 10;
  return new;
end;
$$;

drop trigger if exists matches_set_commission_trigger on public.matches;
create trigger matches_set_commission_trigger
before insert on public.matches
for each row
execute function public.set_match_commission_rate();

-- 2. DÉPÔT MINIMUM 500 ---------------------------------------
alter table public.deposits
  drop constraint if exists deposits_amount_check;
alter table public.deposits
  add constraint deposits_amount_check check (amount >= 500);

create or replace function public.initiate_deposit(
  requested_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_deposit_id uuid;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;
  if requested_amount is null
     or requested_amount < 500
     or requested_amount % 500 <> 0 then
    raise exception 'INVALID_DEPOSIT_AMOUNT';
  end if;
  insert into public.deposits (user_id, amount)
  values (current_user_id, requested_amount)
  returning id into new_deposit_id;
  return new_deposit_id;
end;
$$;

revoke all on function public.initiate_deposit(bigint) from public;
grant execute on function public.initiate_deposit(bigint) to authenticated;

-- 3. RETRAIT MINIMUM 2 000 -----------------------------------
alter table public.withdrawals
  drop constraint if exists withdrawals_amount_check;
alter table public.withdrawals
  add constraint withdrawals_amount_check check (amount >= 2000);

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
