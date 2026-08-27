-- =========================================================
-- GOALX — Intégration GeniusPay (recharge du portefeuille)
-- Migration additive et idempotente :
--   - ne modifie AUCUNE donnée existante ;
--   - peut être ré-exécutée plusieurs fois sans erreur.
--
-- Principe :
--   1. Le joueur initie une recharge (table deposits, PENDING).
--   2. Il paie sur la page checkout hébergée de GeniusPay.
--   3. GeniusPay notifie le webhook Goalx.
--   4. La fonction confirm_deposit (service_role uniquement)
--      vérifie le paiement, crédite le portefeuille et écrit
--      l'historique, de façon idempotente (un seul crédit).
-- =========================================================

-- =========================================================
-- 1. NOUVEAUX TYPES DE TRANSACTIONS PORTEFEUILLE
--    On supprime l'ancienne contrainte CHECK en la cherchant
--    dynamiquement (son nom peut varier), puis on la recrée.
-- =========================================================

do $$
declare
  constraint_name record;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel
      on rel.oid = con.conrelid
    join pg_namespace nsp
      on nsp.oid = connamespace
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
      'DEPOSIT',        -- recharge réussie via GeniusPay
      'DEPOSIT_FAILED'  -- échec de recharge (traçabilité)
    )
  );

-- =========================================================
-- 2. TABLE DES RECHARGES GENIUSPAY
-- =========================================================

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references public.profiles(id) on delete cascade,

  amount bigint not null
    check (amount >= 500),

  currency text not null default 'XOF'
    check (currency = 'XOF'),

  -- Référence GeniusPay (format MTX-XXXXXXXXXX), renseignée
  -- dès que la transaction est créée chez GeniusPay.
  geniuspay_reference text unique,

  status text not null default 'PENDING'
    check (
      status in (
        'PENDING',     -- créée, en attente de paiement
        'PROCESSING',  -- paiement en cours chez l'opérateur
        'COMPLETED',   -- payée et portefeuille crédité
        'FAILED',      -- échec du paiement
        'CANCELLED',   -- annulée par le joueur
        'EXPIRED'      -- lien de paiement expiré
      )
    ),

  payment_method text,
  fees bigint,
  failure_reason text,

  -- Réponse complète GeniusPay (debug / preuve), non exposée au client.
  provider_payload jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists deposits_user_date_index
  on public.deposits(user_id, created_at desc);

create index if not exists deposits_status_index
  on public.deposits(status);

-- Trigger de mise à jour de updated_at.
drop trigger if exists deposits_update_timestamp
  on public.deposits;

create trigger deposits_update_timestamp
before update on public.deposits
for each row
execute function public.update_updated_at();

-- =========================================================
-- 3. ROW LEVEL SECURITY
-- =========================================================

alter table public.deposits enable row level security;

drop policy if exists "Users can view their own deposits"
  on public.deposits;

-- Chaque joueur voit uniquement ses propres recharges.
create policy "Users can view their own deposits"
on public.deposits
for select
to authenticated
using ((select auth.uid()) = user_id);

-- Les écritures passent UNIQUEMENT par les fonctions SECURITY
-- DEFINER ci-dessous (service_role). Aucune insertion/mise à
-- jour directe n'est autorisée depuis le client.
revoke insert, update, delete on public.deposits from authenticated;
revoke insert, update, delete on public.deposits from anon;

-- =========================================================
-- 4. INITIER UNE RECHARGE
--    Appelée par le serveur Goalx avec la clé publique de
--    l'utilisateur (auth.uid() fait foi).
-- =========================================================

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

  if not exists (
    select 1 from public.profiles where id = current_user_id
  ) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.wallets where user_id = current_user_id
  ) then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  -- Montants alignés sur les règles de mises Goalx :
  -- minimum 500 FCFA, par palier de 500.
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

-- =========================================================
-- 5. ATTACHER LA RÉFÉRENCE GENIUSPAY
--    Appelée par le serveur (service_role) juste après la
--    création de la transaction chez GeniusPay.
-- =========================================================

create or replace function public.attach_deposit_reference(
  requested_deposit_id uuid,
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

  update public.deposits
  set geniuspay_reference = requested_reference
  where id = requested_deposit_id
    and geniuspay_reference is null
    and status = 'PENDING';

  if not found then
    raise exception 'DEPOSIT_NOT_FOUND';
  end if;
end;
$$;

-- =========================================================
-- 6. CONFIRMER UNE RECHARGE (webhook GeniusPay)
--    APPELÉE UNIQUEMENT PAR LE SERVICE SERVEUR (service_role).
--    Idempotente : si la recharge est déjà COMPLETED, la
--    fonction ne crédite pas une seconde fois.
-- =========================================================

create or replace function public.confirm_deposit(
  requested_reference text,
  requested_provider_status text,  -- completed | failed | cancelled | expired
  requested_payment_method text default null,
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
  current_deposit public.deposits%rowtype;
  current_wallet public.wallets%rowtype;
  new_balance bigint;
  final_status text;
begin
  select *
  into current_deposit
  from public.deposits
  where geniuspay_reference = requested_reference
  for update;

  if not found then
    raise exception 'DEPOSIT_NOT_FOUND';
  end if;

  -- Déjà traitée : ne rien faire (protection double webhook).
  if current_deposit.status = 'COMPLETED' then
    return 'COMPLETED';
  end if;

  if upper(requested_provider_status) = 'COMPLETED' then
    final_status := 'COMPLETED';
  elsif upper(requested_provider_status) = 'FAILED' then
    final_status := 'FAILED';
  elsif upper(requested_provider_status) = 'CANCELLED' then
    final_status := 'CANCELLED';
  elsif upper(requested_provider_status) = 'EXPIRED' then
    final_status := 'EXPIRED';
  else
    -- pending / processing : on bascule en PROCESSING sans créditer.
    update public.deposits
    set
      status = 'PROCESSING',
      payment_method = coalesce(requested_payment_method, payment_method),
      provider_payload = coalesce(requested_provider_payload, provider_payload)
    where id = current_deposit.id;

    return 'PROCESSING';
  end if;

  -- =====================================================
  -- CRÉDIT DU PORTEFEUILLE (1 FCFA = 1 crédit)
  -- =====================================================
  if final_status = 'COMPLETED' then
    select *
    into current_wallet
    from public.wallets
    where user_id = current_deposit.user_id
    for update;

    if current_wallet.id is null then
      raise exception 'WALLET_NOT_FOUND';
    end if;

    update public.wallets
    set available_balance = available_balance + current_deposit.amount
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
      'DEPOSIT',
      current_deposit.amount,
      new_balance,
      'Recharge via ' ||
        coalesce(nullif(requested_payment_method, ''), 'GeniusPay') ||
        ' — réf. ' || current_deposit.geniuspay_reference
    );
  end if;

  update public.deposits
  set
    status = final_status,
    payment_method = coalesce(requested_payment_method, payment_method),
    fees = requested_fees,
    provider_payload = coalesce(requested_provider_payload, provider_payload),
    failure_reason = case
      when final_status = 'FAILED'
        then coalesce(requested_failure_reason, 'Paiement échoué')
      else failure_reason
    end,
    completed_at = case
      when final_status = 'COMPLETED' then now()
      else completed_at
    end
  where id = current_deposit.id;

  return final_status;
end;
$$;

-- =========================================================
-- 7. AUTORISATIONS
-- =========================================================

revoke all on function public.initiate_deposit(bigint) from public;
grant execute on function public.initiate_deposit(bigint) to authenticated;

revoke all on function public.attach_deposit_reference(uuid, text) from public;
revoke all on function public.attach_deposit_reference(uuid, text) from authenticated;
grant execute on function public.attach_deposit_reference(uuid, text) to service_role;

revoke all on function public.confirm_deposit(text, text, text, bigint, jsonb, text) from public;
revoke all on function public.confirm_deposit(text, text, text, bigint, jsonb, text) from authenticated;
grant execute on function public.confirm_deposit(text, text, text, bigint, jsonb, text) to service_role;
