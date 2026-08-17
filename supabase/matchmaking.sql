-- =========================================================
-- GOALX — Fonctions sécurisées de matchmaking
-- À exécuter après supabase/schema.sql
-- =========================================================

-- Le match associé est conservé dans la file d’attente.
alter table public.matchmaking_queue
add column if not exists match_id uuid
references public.matches(id)
on delete set null;

create index if not exists matchmaking_user_status_index
on public.matchmaking_queue(user_id, status);

-- =========================================================
-- REJOINDRE LA FILE D’ATTENTE
-- =========================================================

create or replace function public.join_matchmaking(
  requested_stake bigint
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

  -- Les mises doivent être des multiples de 500 FCFA.
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

  -- Un joueur ne peut pas chercher un autre match
  -- s’il possède déjà un match actif.
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

  -- Si l’utilisateur est déjà en recherche avec les mêmes
  -- paramètres, on renvoie simplement sa recherche.
  select id, match_id
  into current_queue_id, existing_match_id
  from public.matchmaking_queue
  where user_id = current_user_id
    and status = 'SEARCHING'
    and stake = requested_stake
    and game_mode = current_profile.game_mode
    and division = current_profile.division
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

  -- Recherche atomique d’un adversaire.
  -- SKIP LOCKED empêche deux joueurs de sélectionner
  -- simultanément le même adversaire.
  select matchmaking_entry.*
  into opponent_entry
  from public.matchmaking_queue as matchmaking_entry
  where matchmaking_entry.status = 'SEARCHING'
    and matchmaking_entry.user_id <> current_user_id
    and matchmaking_entry.stake = requested_stake
    and matchmaking_entry.game_mode = current_profile.game_mode
    and matchmaking_entry.division = current_profile.division
    and matchmaking_entry.expires_at > now()
  order by matchmaking_entry.created_at asc
  for update skip locked
  limit 1;

  -- Aucun adversaire disponible : création ou remplacement
  -- de l’entrée du joueur dans la file d’attente.
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

  -- Verrouillage du portefeuille de l’adversaire.
  select *
  into opponent_wallet
  from public.wallets
  where user_id = opponent_entry.user_id
  for update;

  -- Si l’adversaire n’a plus assez de crédits,
  -- sa recherche est annulée et le joueur actuel
  -- est placé dans la file.
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

  -- Réservation des crédits du joueur actuel.
  update public.wallets
  set
    available_balance =
      available_balance - requested_stake,
    reserved_balance =
      reserved_balance + requested_stake
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

  -- Réservation des crédits de l’adversaire.
  update public.wallets
  set
    available_balance =
      available_balance - requested_stake,
    reserved_balance =
      reserved_balance + requested_stake
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

  -- Création du match.
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
    10,
    'MATCHED'
  )
  returning id into new_match_id;

  -- Association de la transaction du premier joueur.
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

  -- Association de la transaction de l’adversaire.
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

  -- Mise à jour de l’entrée de l’adversaire.
  update public.matchmaking_queue
  set
    status = 'MATCHED',
    match_id = new_match_id
  where id = opponent_entry.id;

  -- Création ou mise à jour de l’entrée du joueur actuel.
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

-- =========================================================
-- ANNULER UNE RECHERCHE
-- =========================================================

create or replace function public.cancel_matchmaking()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  updated_count integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  update public.matchmaking_queue
  set
    status = 'CANCELLED',
    match_id = null
  where user_id = current_user_id
    and status = 'SEARCHING';

  get diagnostics updated_count = row_count;

  return updated_count > 0;
end;
$$;

-- =========================================================
-- ACCEPTER UN MATCH TROUVÉ
-- =========================================================

create or replace function public.accept_match(
  requested_match_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  current_match public.matches%rowtype;
  new_status text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  select *
  into current_match
  from public.matches
  where id = requested_match_id
  for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if
    current_match.player_one_id <> current_user_id
    and current_match.player_two_id <> current_user_id
  then
    raise exception 'ACCESS_DENIED';
  end if;

  if current_match.status not in (
    'MATCHED',
    'ACCEPTED'
  ) then
    return current_match.status;
  end if;

  if current_match.player_one_id = current_user_id then
    update public.matches
    set player_one_accepted = true
    where id = requested_match_id;
  else
    update public.matches
    set player_two_accepted = true
    where id = requested_match_id;
  end if;

  update public.matches
  set status = case
    when
      player_one_accepted = true
      and player_two_accepted = true
    then 'IN_PROGRESS'
    else 'ACCEPTED'
  end
  where id = requested_match_id
  returning status into new_status;

  return new_status;
end;
$$;

-- =========================================================
-- AUTORISATIONS
-- =========================================================

revoke all
on function public.join_matchmaking(bigint)
from public;

revoke all
on function public.cancel_matchmaking()
from public;

revoke all
on function public.accept_match(uuid)
from public;

grant execute
on function public.join_matchmaking(bigint)
to authenticated;

grant execute
on function public.cancel_matchmaking()
to authenticated;

grant execute
on function public.accept_match(uuid)
to authenticated;
