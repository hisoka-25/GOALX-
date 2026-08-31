-- =========================================================
-- GOALX — Confirmation d'un dépôt par son ID interne.
-- Utilisée par la route de synchro au retour du joueur (filet
-- de sécurité quand le webhook ne transmet pas notre référence).
-- Idempotente : si déjà COMPLETED, ne crédite pas deux fois.
-- =========================================================

create or replace function public.confirm_deposit_by_id(
  requested_deposit_id uuid
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
begin
  select *
  into current_deposit
  from public.deposits
  where id = requested_deposit_id
  for update;

  if not found then
    raise exception 'DEPOSIT_NOT_FOUND';
  end if;

  -- Déjà traitée : ne rien faire.
  if current_deposit.status = 'COMPLETED' then
    return 'COMPLETED';
  end if;

  -- On ne crédite qu'un dépôt encore en attente/en cours.
  if current_deposit.status not in ('PENDING', 'PROCESSING') then
    return current_deposit.status;
  end if;

  -- Crédit du portefeuille (1 FCFA = 1 crédit).
  select *
  into current_wallet
  from public.wallets
  where user_id = current_deposit.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  new_balance :=
    current_wallet.available_balance +
    current_deposit.amount;

  update public.wallets
  set
    available_balance = new_balance,
    updated_at = now()
  where id = current_wallet.id;

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
    'Recharge via Jèko'
  );

  update public.deposits
  set
    status = 'COMPLETED',
    completed_at = now(),
    updated_at = now()
  where id = current_deposit.id;

  return 'COMPLETED';
end;
$$;

revoke all on function public.confirm_deposit_by_id(uuid) from public;
grant execute on function public.confirm_deposit_by_id(uuid) to service_role;
