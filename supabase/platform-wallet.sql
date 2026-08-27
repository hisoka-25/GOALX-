-- =========================================================
-- GOALX — Portefeuille de la plateforme (commission admin)
--
-- À la fin d'un match, la commission GOALX est créditée sur
-- un portefeuille interne "maison" (et non détruite). L'admin
-- voit ce solde dans son tableau de bord et peut le retirer
-- vers son propre Mobile Money via GeniusPay (payout).
--
-- Tables accessibles UNIQUEMENT par le serveur (service_role).
-- Migration additive et idempotente.
-- =========================================================

-- =========================================================
-- 1. PORTEFEUILLE PLATEFORME (un seul enregistrement)
-- =========================================================

create table if not exists public.platform_wallets (
  id uuid primary key default gen_random_uuid(),
  balance bigint not null default 0
    check (balance >= 0),
  updated_at timestamptz not null default now()
);

-- Création du portefeuille unique s'il n'existe pas.
insert into public.platform_wallets (balance)
select 0
where not exists (
  select 1 from public.platform_wallets
);

-- =========================================================
-- 2. HISTORIQUE DES MOUVEMENTS DE LA PLATEFORME
-- =========================================================

create table if not exists public.platform_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type text not null
    check (
      transaction_type in (
        'COMMISSION',           -- commission encaissée sur un match
        'PLATFORM_WITHDRAWAL', -- retrait admin émis
        'PLATFORM_WITHDRAWAL_REFUNDED' -- retrait admin échoué, remboursé
      )
    ),
  amount bigint not null,
  balance_after bigint not null,
  match_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists platform_transactions_date_index
  on public.platform_transactions(created_at desc);

-- =========================================================
-- 3. RETRAITS DE LA PLATEFORME (vers le Wave de l'admin)
-- =========================================================

create table if not exists public.platform_withdrawals (
  id uuid primary key default gen_random_uuid(),
  amount bigint not null check (amount >= 2000),
  currency text not null default 'XOF' check (currency = 'XOF'),
  provider text not null default 'wave',
  phone_number text not null,
  geniuspay_reference text unique,
  status text not null default 'PENDING'
    check (
      status in (
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'FAILED',
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

create index if not exists platform_withdrawals_date_index
  on public.platform_withdrawals(created_at desc);

drop trigger if exists platform_withdrawals_update_timestamp
  on public.platform_withdrawals;

create trigger platform_withdrawals_update_timestamp
before update on public.platform_withdrawals
for each row
execute function public.update_updated_at();

-- =========================================================
-- 4. SÉCURITÉ : aucune accès côté joueur
-- =========================================================

alter table public.platform_wallets enable row level security;
alter table public.platform_transactions enable row level security;
alter table public.platform_withdrawals enable row level security;

revoke all on public.platform_wallets from authenticated, anon;
revoke all on public.platform_transactions from authenticated, anon;
revoke all on public.platform_withdrawals from authenticated, anon;

-- =========================================================
-- 5. CRÉDIT AUTOMATIQUE DE LA COMMISSION À CHAQUE MATCH
-- =========================================================

create or replace function public.credit_commission_to_platform()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  commission bigint;
  new_balance bigint;
begin
  if
    new.status = 'COMPLETED'
    and new.winner_id is not null
    and old.status is distinct from 'COMPLETED'
  then
    commission :=
      (new.stake * 2 * new.commission_rate) / 100;

    update public.platform_wallets
    set balance = balance + commission,
        updated_at = now()
    where id = (
      select id from public.platform_wallets
      order by created_at
      limit 1
    )
    returning balance into new_balance;

    insert into public.platform_transactions (
      transaction_type,
      amount,
      balance_after,
      match_id,
      description
    )
    values (
      'COMMISSION',
      commission,
      new_balance,
      new.id,
      'Commission GOALX sur le match'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists matches_credit_platform on public.matches;

create trigger matches_credit_platform
after update on public.matches
for each row
execute function public.credit_commission_to_platform();

-- =========================================================
-- 6. DEMANDER UN RETRAIT PLATEFORME (service_role)
--    L'admin est vérifié côté application avant l'appel.
-- =========================================================

create or replace function public.request_platform_withdrawal(
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
  new_id uuid;
  new_balance bigint;
begin
  if requested_amount is null
     or requested_amount < 2000
     or requested_amount % 500 <> 0 then
    raise exception 'INVALID_PLATFORM_WITHDRAWAL_AMOUNT';
  end if;

  if requested_phone is null or length(trim(requested_phone)) < 8 then
    raise exception 'INVALID_PHONE';
  end if;

  update public.platform_wallets
  set balance = balance - requested_amount,
      updated_at = now()
  where id = (
    select id from public.platform_wallets
    order by created_at
    limit 1
  )
  and balance >= requested_amount
  returning balance into new_balance;

  if new_balance is null then
    raise exception 'INSUFFICIENT_PLATFORM_BALANCE';
  end if;

  insert into public.platform_withdrawals (
    amount, phone_number, provider
  )
  values (
    requested_amount,
    trim(requested_phone),
    coalesce(nullif(trim(requested_provider), ''), 'wave')
  )
  returning id into new_id;

  insert into public.platform_transactions (
    transaction_type, amount, balance_after, description
  )
  values (
    'PLATFORM_WITHDRAWAL',
    -requested_amount,
    new_balance,
    'Retrait des commissions GOALX'
  );

  return new_id;
end;
$$;

-- =========================================================
-- 7. ATTACHER LA RÉFÉRENCE GENIUSPAY (service_role)
-- =========================================================

create or replace function public.attach_platform_withdrawal_reference(
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

  update public.platform_withdrawals
  set geniuspay_reference = requested_reference
  where id = requested_withdrawal_id
    and geniuspay_reference is null
    and status = 'PENDING';

  if not found then
    raise exception 'PLATFORM_WITHDRAWAL_NOT_FOUND';
  end if;
end;
$$;

-- =========================================================
-- 8. CONFIRMER UN RETRAIT PLATEFORME (webhook, service_role)
-- =========================================================

create or replace function public.confirm_platform_withdrawal(
  requested_reference text,
  requested_provider_status text,
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
  current_w public.platform_withdrawals%rowtype;
  new_balance bigint;
  final_status text;
begin
  select *
  into current_w
  from public.platform_withdrawals
  where geniuspay_reference = requested_reference
  for update;

  if not found then
    raise exception 'PLATFORM_WITHDRAWAL_NOT_FOUND';
  end if;

  if current_w.status in ('COMPLETED', 'FAILED', 'CANCELLED') then
    return current_w.status;
  end if;

  if upper(requested_provider_status) in ('COMPLETED', 'APPROVED', 'SUCCESS') then
    final_status := 'COMPLETED';
  elsif upper(requested_provider_status) in ('FAILED', 'CANCELLED', 'REJECTED') then
    final_status := 'FAILED';
  else
    update public.platform_withdrawals
    set status = 'PROCESSING',
        provider_payload = coalesce(requested_provider_payload, provider_payload)
    where id = current_w.id;
    return 'PROCESSING';
  end if;

  if final_status = 'COMPLETED' then
    update public.platform_withdrawals
    set status = 'COMPLETED',
        fees = requested_fees,
        provider_payload = coalesce(requested_provider_payload, provider_payload),
        completed_at = now()
    where id = current_w.id;
    return 'COMPLETED';
  end if;

  -- Échec : remboursement du portefeuille plateforme.
  update public.platform_wallets
  set balance = balance + current_w.amount,
      updated_at = now()
  where id = (select id from public.platform_wallets order by created_at limit 1)
  returning balance into new_balance;

  insert into public.platform_transactions (
    transaction_type, amount, balance_after, description
  )
  values (
    'PLATFORM_WITHDRAWAL_REFUNDED',
    current_w.amount,
    new_balance,
    'Retrait admin échoué — commissions recréditées'
  );

  update public.platform_withdrawals
  set status = 'FAILED',
      fees = requested_fees,
      provider_payload = coalesce(requested_provider_payload, provider_payload),
      failure_reason = coalesce(
        requested_failure_reason,
        'Le retrait a échoué, les commissions ont été recréditées.'
      )
  where id = current_w.id;

  return 'FAILED';
end;
$$;

-- =========================================================
-- 9. ÉCHEC IMMÉDIAT (création payout impossible, service_role)
-- =========================================================

create or replace function public.fail_platform_withdrawal(
  requested_withdrawal_id uuid,
  requested_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_w public.platform_withdrawals%rowtype;
  new_balance bigint;
begin
  select * into current_w
  from public.platform_withdrawals
  where id = requested_withdrawal_id
  for update;

  if not found then
    raise exception 'PLATFORM_WITHDRAWAL_NOT_FOUND';
  end if;

  if current_w.status in ('COMPLETED', 'FAILED', 'CANCELLED') then
    return current_w.status;
  end if;

  update public.platform_wallets
  set balance = balance + current_w.amount,
      updated_at = now()
  where id = (select id from public.platform_wallets order by created_at limit 1)
  returning balance into new_balance;

  insert into public.platform_transactions (
    transaction_type, amount, balance_after, description
  )
  values (
    'PLATFORM_WITHDRAWAL_REFUNDED',
    current_w.amount,
    new_balance,
    'Retrait admin indisponible — commissions recréditées'
  );

  update public.platform_withdrawals
  set status = 'FAILED',
      failure_reason = coalesce(
        requested_reason,
        'Le service de retrait est momentanément indisponible.'
      )
  where id = current_w.id;

  return 'FAILED';
end;
$$;

-- =========================================================
-- 10. AUTORISATIONS (service_role uniquement)
-- =========================================================

revoke all on function public.request_platform_withdrawal(bigint, text, text) from public;
revoke all on function public.request_platform_withdrawal(bigint, text, text) from authenticated;
grant execute on function public.request_platform_withdrawal(bigint, text, text) to service_role;

revoke all on function public.attach_platform_withdrawal_reference(uuid, text) from public;
revoke all on function public.attach_platform_withdrawal_reference(uuid, text) from authenticated;
grant execute on function public.attach_platform_withdrawal_reference(uuid, text) to service_role;

revoke all on function public.confirm_platform_withdrawal(text, text, bigint, jsonb, text) from public;
revoke all on function public.confirm_platform_withdrawal(text, text, bigint, jsonb, text) from authenticated;
grant execute on function public.confirm_platform_withdrawal(text, text, bigint, jsonb, text) to service_role;

revoke all on function public.fail_platform_withdrawal(uuid, text) from public;
revoke all on function public.fail_platform_withdrawal(uuid, text) from authenticated;
grant execute on function public.fail_platform_withdrawal(uuid, text) to service_role;
