-- =========================================================
-- GOALX — Retraits (cashout GeniusPay / payouts)
-- Migration additive et idempotente, sans effet sur les
-- tables existantes hors contraintes de type ajoutées.
--
-- Principe :
--   1. Le joueur demande un retrait (table withdrawals).
--   2. Le serveur débite immédiatement le portefeuille
--      (available_balance) et crée le payout GeniusPay.
--   3. GeniusPay notifie via webhook (cashout.*).
--   4. completed  => marqué PAYE.
--      failed     => le portefeuille est recrédité (remboursement).
-- =========================================================

-- =========================================================
-- 1. NOUVEAUX TYPES DE TRANSACTIONS PORTEFEUILLE
--    (on conserve la contrainte existante et on l'étend)
-- =========================================================

do $$
declare
  constraint_name record;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = connamespace
    where nsp.nspname = 'public'
      and rel.relname = 'wallet_transactions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%transaction_type%'
  loop
    execute format(
      'alter table public.wallet_transactions drop constraint if exists %I',
      constraint_name.conname
    );
  end loop;
end $$;

alter table public.wallet_transactions
  add constraint wallet_transactions_transaction_type_check
  check (
    transaction_type in (
      'WELCOME_CREDIT',
      'STAKE_RESERVED',
      'MATCH_LOSS',
      'MATCH_WIN',
      'STAKE_RETURNED',
      'DEPOSIT',
      'DEPOSIT_FAILED',
      'WITHDRAWAL',          -- retrait émis
      'WITHDRAWAL_REFUNDED'  -- retrait échoué, remboursé
    )
  );

-- =========================================================
-- 2. TABLE DES RETRAITES
-- =========================================================

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id) on delete cascade,

  -- Montant demandé par le joueur (ce qui doit arriver sur
  -- son compte Mobile Money), en FCFA.
  amount bigint not null
    check (amount >= 2000),

  currency text not null default 'XOF'
    check (currency = 'XOF'),

  provider text not null default 'wave',
  phone_number text not null,

  -- Référence payout GeniusPay, renseignée à la création.
  geniuspay_reference text unique,

  status text not null default 'PENDING'
    check (
      status in (
        'PENDING',     -- créée, en cours d'envoi
        'PROCESSING',  -- traitée par l'opérateur
        'COMPLETED',   -- argent envoyé
        'FAILED',      -- échec (portefeuille remboursé)
        'CANCELLED'
      )
    ),

  fees bigint,
  failure_reason text,
  provider_payload jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists withdrawals_user_date_index
  on public.withdrawals(user_id, created_at desc);

create index if not exists withdrawals_status_index
  on public.withdrawals(status);

drop trigger if exists withdrawals_update_timestamp
  on public.withdrawals;

create trigger withdrawals_update_timestamp
before update on public.withdrawals
for each row
execute function public.update_updated_at();

-- =========================================================
-- 3. ROW LEVEL SECURITY
-- =========================================================

alter table public.withdrawals enable row level security;

drop policy if exists "Users can view their own withdrawals"
  on public.withdrawals;

create policy "Users can view their own withdrawals"
on public.withdrawals
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Les écritures passent uniquement par les fonctions SECURITY
-- DEFINER (service_role / RPC authentifiée).
revoke insert, update, delete on public.withdrawals from authenticated;
revoke insert, update, delete on public.withdrawals from anon;

-- =========================================================
-- 4. DEMANDER UN RETRAIT
--    Débite le portefeuille et crée la demande.
--    Appelée avec la clé publique de l'utilisateur.
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
  current_user_id uuid := auth.uid();
  current_wallet public.wallets%rowtype;
  new_withdrawal_id uuid;
  new_balance bigint;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if requested_amount is null
     or requested_amount < 2000
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

  -- Le joueur doit disposer du montant (hors fonds réservés
  -- à des matchs en cours).
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

  -- Débit immédiat du solde disponible.
  update public.wallets
  set available_balance = available_balance - requested_amount
  where id = current_wallet.id
  returning available_balance into new_balance;

  insert into public.wallet_transactions (
    wallet_id,
    transaction_type,
    amount,
    balance_after,
    description
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

-- =========================================================
-- 5. ATTACHER LA RÉFÉRENCE GENIUSPAY
-- =========================================================

create or replace function public.attach_withdrawal_reference(
  requested_withdrawal_id uuid,
  requested_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_reference is null or length(trim(requested_reference)) = 0 then
    raise exception 'INVALID_REFERENCE';
  end if;

  update public.withdrawals
  set geniuspay_reference = requested_reference
  where id = requested_withdrawal_id
    and geniuspay_reference is null
    and status = 'PENDING';

  if not found then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;
end;
$$;

-- =========================================================
-- 6. CONFIRMER UN RETRAIT (webhook cashout.*)
--    service_role UNIQUEMENT. Idempotente.
--    completed  => COMPLETED
--    failed/cancelled => recrédit du portefeuille.
-- =========================================================

create or replace function public.confirm_withdrawal(
  requested_reference text,
  requested_provider_status text,  -- completed | failed | cancelled
  requested_fees bigint default null,
  requested_provider_payload jsonb default null,
  requested_failure_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_withdrawal public.withdrawals%rowtype;
  current_wallet public.wallets%rowtype;
  new_balance bigint;
  final_status text;
begin
  select *
  into current_withdrawal
  from public.withdrawals
  where geniuspay_reference = requested_reference
  for update;

  if not found then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;

  -- Déjà traitée : ne rien refaire (idempotence webhook).
  if current_withdrawal.status in ('COMPLETED', 'FAILED', 'CANCELLED') then
    return current_withdrawal.status;
  end if;

  if upper(requested_provider_status) in ('COMPLETED', 'APPROVED', 'SUCCESS') then
    final_status := 'COMPLETED';
  elsif upper(requested_provider_status) in ('FAILED', 'CANCELLED', 'REJECTED') then
    final_status := 'FAILED';
  else
    -- requested / processing : on passe en PROCESSING.
    update public.withdrawals
    set
      status = 'PROCESSING',
      provider_payload = coalesce(requested_provider_payload, provider_payload)
    where id = current_withdrawal.id;

    return 'PROCESSING';
  end if;

  if final_status = 'COMPLETED' then
    update public.withdrawals
    set
      status = 'COMPLETED',
      fees = requested_fees,
      provider_payload = coalesce(requested_provider_payload, provider_payload),
      completed_at = now()
    where id = current_withdrawal.id;

    return 'COMPLETED';
  end if;

  -- =====================================================
  -- ÉCHEC : REMBOURSEMENT INTÉGRAL DU PORTEFEUILLE
  -- =====================================================
  if final_status = 'FAILED' then
    select *
    into current_wallet
    from public.wallets
    where user_id = current_withdrawal.user_id
    for update;

    if current_wallet.id is not null then
      update public.wallets
      set available_balance = available_balance + current_withdrawal.amount
      where id = current_wallet.id
      returning available_balance into new_balance;

      insert into public.wallet_transactions (
        wallet_id,
        transaction_type,
        amount,
        balance_after,
        description
      )
      values (
        current_wallet.id,
        'WITHDRAWAL_REFUNDED',
        current_withdrawal.amount,
        new_balance,
        'Retrait échoué — montant recrédité'
      );
    end if;

    update public.withdrawals
    set
      status = 'FAILED',
      fees = requested_fees,
      provider_payload = coalesce(requested_provider_payload, provider_payload),
      failure_reason = coalesce(
        requested_failure_reason,
        'Le retrait a échoué, le montant a été recrédité.'
      )
    where id = current_withdrawal.id;

    return 'FAILED';
  end if;

  return final_status;
end;
$$;

-- =========================================================
-- 7. ÉCHEC IMMÉDIAT (création du payout impossible)
--    Appelée par le serveur si GeniusPay refuse la création
--    (ex: solde marchand insuffisant). Le portefeuille est
--    recrédité. service_role UNIQUEMENT.
-- =========================================================

create or replace function public.fail_withdrawal(
  requested_withdrawal_id uuid,
  requested_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_withdrawal public.withdrawals%rowtype;
  current_wallet public.wallets%rowtype;
  new_balance bigint;
begin
  select *
  into current_withdrawal
  from public.withdrawals
  where id = requested_withdrawal_id
  for update;

  if not found then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;

  -- Déjà terminée : ne rien refaire.
  if current_withdrawal.status in ('COMPLETED', 'FAILED', 'CANCELLED') then
    return current_withdrawal.status;
  end if;

  select *
  into current_wallet
  from public.wallets
  where user_id = current_withdrawal.user_id
  for update;

  if current_wallet.id is not null then
    update public.wallets
    set available_balance = available_balance + current_withdrawal.amount
    where id = current_wallet.id
    returning available_balance into new_balance;

    insert into public.wallet_transactions (
      wallet_id,
      transaction_type,
      amount,
      balance_after,
      description
    )
    values (
      current_wallet.id,
      'WITHDRAWAL_REFUNDED',
      current_withdrawal.amount,
      new_balance,
      'Retrait indisponible — montant recrédité'
    );
  end if;

  update public.withdrawals
  set
    status = 'FAILED',
    failure_reason = coalesce(
      requested_reason,
      'Le service de retrait est momentanément indisponible.'
    )
  where id = current_withdrawal.id;

  return 'FAILED';
end;
$$;

-- =========================================================
-- 8. AUTORISATIONS
-- =========================================================

revoke all on function public.request_withdrawal(bigint, text, text) from public;
grant execute on function public.request_withdrawal(bigint, text, text) to authenticated;

revoke all on function public.attach_withdrawal_reference(uuid, text) from public;
revoke all on function public.attach_withdrawal_reference(uuid, text) from authenticated;
grant execute on function public.attach_withdrawal_reference(uuid, text) to service_role;

revoke all on function public.confirm_withdrawal(text, text, bigint, jsonb, text) from public;
revoke all on function public.confirm_withdrawal(text, text, bigint, jsonb, text) from authenticated;
grant execute on function public.confirm_withdrawal(text, text, bigint, jsonb, text) to service_role;

revoke all on function public.fail_withdrawal(uuid, text) from public;
revoke all on function public.fail_withdrawal(uuid, text) from authenticated;
grant execute on function public.fail_withdrawal(uuid, text) to service_role;
