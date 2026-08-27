-- =========================================================
-- GOALX — Matchmaking par MISE uniquement (plus de division)
--
-- La recherche d'adversaire se fait désormais sur :
--   - même mode de jeu
--   - même mise (stake)
-- La division n'est plus un critère de matching : un joueur
-- qui mise gros est supposé assumer son niveau. La division
-- reste enregistrée et affichée à titre informatif.
--
-- Cette fonction remplace join_matchmaking. Signature étendue
-- avec international_expansion (accepté par le client) pour
-- éviter toute erreur d'appel. Migration idempotente.
-- =========================================================

create or replace function public.join_matchmaking(
  requested_stake bigint,
  international_expansion boolean default false
)
returns table (
  queue_id uuid,
  queue_status text,
  found_match_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  current_profile public.profiles%rowtype;
  current_wallet public.wallets%rowtype;
  opponent_entry public.matchmaking_queue%rowtype;
  opponent_wallet public.wallets%rowtype;
  new_match_id uuid;
  current_queue_id uuid;
  existing_match_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if requested_stake is null or requested_stake < 500 then
    raise exception 'INVALID_STAKE';
  end if;

  if mod(requested_stake, 500) <> 0 then
    raise exception 'INVALID_STAKE_INCREMENT';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = current_user_id;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  -- Un joueur ne peut pas chercher un autre match s'il a
  -- déjà un match actif.
  select id
  into existing_match_id
  from public.matches
  where (
    player_one_id = current_user_id
    or player_two_id = current_user_id
  )
  and status in (
    'MATCHED',
    'ACCEPTED',
    'IN_PROGRESS',
    'WAITING_FOR_EVIDENCE',
    'AI_REVIEW'
  )
  order by created_at desc
  limit 1;

  if existing_match_id is not null then
    return query
    select
      null::uuid,
      'MATCHED'::text,
      existing_match_id;

    return;
  end if;

  select *
  into current_wallet
  from public.wallets
  where user_id = current_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  if current_wallet.available_balance < requested_stake then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- Recherche déjà active avec les mêmes paramètres.
  select id, match_id
  into current_queue_id, existing_match_id
  from public.matchmaking_queue
  where user_id = current_user_id
    and status = 'SEARCHING'
    and stake = requested_stake
    and game_mode = current_profile.game_mode
    and expires_at > now()
  limit 1;

  if current_queue_id is not null then
    return query
    select
      current_queue_id,
      'SEARCHING'::text,
      existing_match_id;

    return;
  end if;

  -- Annulation des anciennes recherches de ce joueur.
  update public.matchmaking_queue
  set
    status = 'CANCELLED',
    match_id = null
  where user_id = current_user_id
    and status = 'SEARCHING';

  -- Recherche atomique d'un adversaire :
  -- même mode de jeu + même mise, SANS contrainte de division.
  select matchmaking_entry.*
  into opponent_entry
  from public.matchmaking_queue as matchmaking_entry
  where matchmaking_entry.status = 'SEARCHING'
    and matchmaking_entry.user_id <> current_user_id
    and matchmaking_entry.stake = requested_stake
    and matchmaking_entry.game_mode = current_profile.game_mode
    and matchmaking_entry.expires_at > now()
  order by matchmaking_entry.created_at asc
  for update skip locked
  limit 1;

  -- Aucun adversaire : le joueur est placé dans la file.
  if opponent_entry.id is null then
    insert into public.matchmaking_queue (
      user_id,
      stake,
      division,
      game_mode,
      status,
      match_id,
      created_at,
      expires_at
    )
    values (
      current_user_id,
      requested_stake,
      current_profile.division,
      current_profile.game_mode,
      'SEARCHING',
      null,
      now(),
      now() + interval '10 minutes'
    )
    on conflict (user_id)
    do update set
      stake = excluded.stake,
      division = excluded.division,
      game_mode = excluded.game_mode,
      status = 'SEARCHING',
      match_id = null,
      created_at = now(),
      expires_at = now() + interval '10 minutes'
    returning id into current_queue_id;

    return query
    select
      current_queue_id,
      'SEARCHING'::text,
      null::uuid;

    return;
  end if;

  -- Verrouillage du portefeuille de l'adversaire.
  select *
  into opponent_wallet
  from public.wallets
  where user_id = opponent_entry.user_id
  for update;

  -- Si l'adversaire n'a plus assez de crédits, sa recherche
  -- est annulée et le joueur actuel est placé dans la file.
  if
    opponent_wallet.id is null
    or opponent_wallet.available_balance < requested_stake
  then
    update public.matchmaking_queue
    set
      status = 'CANCELLED',
      match_id = null
    where id = opponent_entry.id;

    insert into public.matchmaking_queue (
      user_id,
      stake,
      division,
      game_mode,
      status,
      match_id,
      created_at,
      expires_at
    )
    values (
      current_user_id,
      requested_stake,
      current_profile.division,
      current_profile.game_mode,
      'SEARCHING',
      null,
      now(),
      now() + interval '10 minutes'
    )
    on conflict (user_id)
    do update set
      stake = excluded.stake,
      division = excluded.division,
      game_mode = excluded.game_mode,
      status = 'SEARCHING',
      match_id = null,
      created_at = now(),
      expires_at = now() + interval '10 minutes'
    returning id into current_queue_id;

    return query
    select
      current_queue_id,
      'SEARCHING'::text,
      null::uuid;

    return;
  end if;

  -- Réservation des crédits des deux joueurs.
  update public.wallets
  set
    available_balance = available_balance - requested_stake,
    reserved_balance = reserved_balance + requested_stake
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
    'STAKE_RESERVED',
    -requested_stake,
    current_wallet.available_balance - requested_stake,
    'Mise réservée pour un match GOALX'
  );

  update public.wallets
  set
    available_balance = available_balance - requested_stake,
    reserved_balance = reserved_balance + requested_stake
  where id = opponent_wallet.id;

  insert into public.wallet_transactions (
    wallet_id,
    transaction_type,
    amount,
    balance_after,
    description
  )
  values (
    opponent_wallet.id,
    'STAKE_RESERVED',
    -requested_stake,
    opponent_wallet.available_balance - requested_stake,
    'Mise réservée pour un match GOALX'
  );

  -- Création du match (taux de commission 7 %).
  insert into public.matches (
    player_one_id,
    player_two_id,
    game_mode,
    division,
    stake,
    commission_rate,
    status
  )
  values (
    opponent_entry.user_id,
    current_user_id,
    current_profile.game_mode,
    current_profile.division,
    requested_stake,
    7,
    'MATCHED'
  )
  returning id into new_match_id;

  update public.wallet_transactions
  set match_id = new_match_id
  where id = (
    select id
    from public.wallet_transactions
    where wallet_id = current_wallet.id
      and match_id is null
      and transaction_type = 'STAKE_RESERVED'
    order by created_at desc
    limit 1
  );

  update public.wallet_transactions
  set match_id = new_match_id
  where id = (
    select id
    from public.wallet_transactions
    where wallet_id = opponent_wallet.id
      and match_id is null
      and transaction_type = 'STAKE_RESERVED'
    order by created_at desc
    limit 1
  );

  update public.matchmaking_queue
  set
    status = 'MATCHED',
    match_id = new_match_id
  where id = opponent_entry.id;

  insert into public.matchmaking_queue (
    user_id,
    stake,
    division,
    game_mode,
    status,
    match_id,
    created_at,
    expires_at
  )
  values (
    current_user_id,
    requested_stake,
    current_profile.division,
    current_profile.game_mode,
    'MATCHED',
    new_match_id,
    now(),
    now() + interval '10 minutes'
  )
  on conflict (user_id)
  do update set
    stake = excluded.stake,
    division = excluded.division,
    game_mode = excluded.game_mode,
    status = 'MATCHED',
    match_id = new_match_id,
    created_at = now(),
    expires_at = now() + interval '10 minutes'
  returning id into current_queue_id;

  return query
  select
    current_queue_id,
    'MATCHED'::text,
    new_match_id;
end;
$$;

-- Autorisations
revoke all on function public.join_matchmaking(bigint, boolean) from public;
grant execute on function public.join_matchmaking(bigint, boolean) to authenticated;

-- On conserve aussi l appelable avec un seul argument.
revoke all on function public.join_matchmaking(bigint) from public;
grant execute on function public.join_matchmaking(bigint) to authenticated;
