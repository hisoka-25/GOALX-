-- =========================================================
-- GOALX — DÉFI DIRECT (ciblage d'un joueur précis)
-- À exécuter dans Supabase (SQL Editor). Ré-exécutable.
--
-- PRINCIPE : un défi peut maintenant être CIBLÉ sur un
-- joueur précis (bouton DÉFIER de la page Joueurs).
--   - challenged_profile_id = null  → lien ouvert (comportement
--     inchangé : quiconque a le code peut accepter).
--   - challenged_profile_id = X    → SEUL X peut accepter.
--     X peut aussi REFUSER (= annulation côté cible).
-- Expiration : 15 minutes, identique aux liens ouverts.
--
-- SÉCURITÉ : les 3 fonctions sont les copies exactes des
-- versions en prod (archives supabase/friend-challenges.sql)
-- avec SEULEMENT les ajouts marqués « DÉFI DIRECT ».
-- =========================================================

-- 1) Colonne ciblée + index de recherche des défis reçus
alter table public.friend_challenges
  add column if not exists challenged_profile_id uuid
  references public.profiles(id);

create index if not exists friend_challenges_challenged_idx
  on public.friend_challenges (challenged_profile_id, status);

-- =========================================================
-- 2) CREATE — nouvelle signature : cible facultative.
-- Le paramètre a une valeur par défaut : les appels existants
-- (requested_stake seul) continuent de fonctionner.
-- ⚠️ drop d'abord l'ancienne fonction (sinon surcharge).
-- =========================================================

drop function if exists public.create_friend_challenge(bigint);

create or replace function public.create_friend_challenge(
  requested_stake bigint,
  target_profile_id uuid default null
)
returns table(challenge_code text, challenge_expires_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions'
as $function$
declare
  current_user_id uuid;
  current_profile public.profiles%rowtype;
  current_wallet public.wallets%rowtype;
  target_profile public.profiles%rowtype;  -- DÉFI DIRECT
  generated_code text;
  generated_expiry timestamptz;
  active_match_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if requested_stake is null or requested_stake < 500 or mod(requested_stake, 500) <> 0 then
    raise exception 'INVALID_STAKE';
  end if;

  select * into current_profile
  from public.profiles
  where id = current_user_id;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  -- DÉFI DIRECT : validation de la cible éventuelle.
  if target_profile_id is not null then
    if target_profile_id = current_user_id then
      raise exception 'CANNOT_CHALLENGE_SELF';
    end if;

    select * into target_profile
    from public.profiles
    where id = target_profile_id;

    if not found then
      raise exception 'TARGET_NOT_FOUND';
    end if;

    if target_profile.game_mode <> current_profile.game_mode then
      raise exception 'GAME_MODE_MISMATCH';
    end if;
  end if;

  select * into current_wallet
  from public.wallets
  where user_id = current_user_id;

  if not found or current_wallet.available_balance < requested_stake then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  select id into active_match_id
  from public.matches
  where (player_one_id = current_user_id or player_two_id = current_user_id)
    and status in ('MATCHED', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_EVIDENCE', 'AI_REVIEW')
  limit 1;

  if active_match_id is not null then
    raise exception 'ACTIVE_MATCH_EXISTS';
  end if;

  update public.matchmaking_queue
  set status = 'CANCELLED', match_id = null
  where user_id = current_user_id and status = 'SEARCHING';

  update public.friend_challenges
  set status = 'EXPIRED'
  where creator_id = current_user_id
    and status = 'PENDING'
    and expires_at <= now();

  delete from public.friend_challenges
  where creator_id = current_user_id and status = 'PENDING';

  loop
    generated_code := 'GX-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (
      select 1 from public.friend_challenges where code = generated_code
    );
  end loop;

  generated_expiry := now() + interval '15 minutes';

  insert into public.friend_challenges (
    creator_id, code, stake, game_mode, status, expires_at,
    challenged_profile_id  -- DÉFI DIRECT
  ) values (
    current_user_id,
    generated_code,
    requested_stake,
    current_profile.game_mode,
    'PENDING',
    generated_expiry,
    target_profile_id      -- DÉFI DIRECT (null = lien ouvert)
  );

  return query select generated_code, generated_expiry;
end;
$function$;

revoke all on function public.create_friend_challenge(bigint, uuid) from public;
grant execute on function public.create_friend_challenge(bigint, uuid) to authenticated;

-- =========================================================
-- 3) ACCEPT — copie exacte de la prod + UN SEUL ajout :
-- un défi ciblé ne peut être accepté que par sa cible.
-- =========================================================

create or replace function public.accept_friend_challenge(
  requested_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid;
  challenge public.friend_challenges%rowtype;
  creator_profile public.profiles%rowtype;
  guest_profile public.profiles%rowtype;
  creator_wallet public.wallets%rowtype;
  guest_wallet public.wallets%rowtype;
  new_match_id uuid;
  active_match_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  -- VERROU sur la ligne du défi : sérialise les acceptations
  -- concurrentes du même lien (anti double-clic).
  select * into challenge
  from public.friend_challenges
  where code = upper(trim(requested_code))
  for update;

  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if challenge.creator_id = current_user_id then
    raise exception 'CANNOT_ACCEPT_OWN_CHALLENGE';
  end if;

  -- DÉFI DIRECT : seul le joueur ciblé peut accepter.
  if challenge.challenged_profile_id is not null
     and challenge.challenged_profile_id <> current_user_id then
    raise exception 'NOT_CHALLENGED_PLAYER';
  end if;

  if challenge.status <> 'PENDING' or challenge.expires_at <= now() then
    raise exception 'CHALLENGE_UNAVAILABLE';
  end if;

  select * into creator_profile from public.profiles where id = challenge.creator_id;
  select * into guest_profile from public.profiles where id = current_user_id;

  if guest_profile.game_mode <> challenge.game_mode then
    raise exception 'GAME_MODE_MISMATCH';
  end if;

  select id into active_match_id
  from public.matches
  where (player_one_id in (challenge.creator_id, current_user_id)
      or player_two_id in (challenge.creator_id, current_user_id))
    and status in ('MATCHED', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_EVIDENCE', 'AI_REVIEW')
  limit 1;

  if active_match_id is not null then
    raise exception 'ACTIVE_MATCH_EXISTS';
  end if;

  -- Verrous sur les DEUX portefeuilles, ordre déterministe
  -- (order by) pour éviter tout interblocage.
  perform 1
  from public.wallets
  where user_id in (challenge.creator_id, current_user_id)
  order by user_id
  for update;

  select * into creator_wallet from public.wallets where user_id = challenge.creator_id;
  select * into guest_wallet from public.wallets where user_id = current_user_id;

  if creator_wallet.available_balance < challenge.stake
     or guest_wallet.available_balance < challenge.stake then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.matches (
    player_one_id,
    player_two_id,
    game_mode,
    division,
    stake,
    commission_rate,
    status
  ) values (
    challenge.creator_id,
    current_user_id,
    challenge.game_mode,
    creator_profile.division,
    challenge.stake,
    10,
    'MATCHED'
  ) returning id into new_match_id;

  update public.wallets
  set available_balance = available_balance - challenge.stake,
      reserved_balance = reserved_balance + challenge.stake
  where id in (creator_wallet.id, guest_wallet.id);

  insert into public.wallet_transactions (
    wallet_id, match_id, transaction_type, amount, balance_after, description
  ) values
  (
    creator_wallet.id,
    new_match_id,
    'STAKE_RESERVED',
    -challenge.stake,
    creator_wallet.available_balance - challenge.stake,
    'Mise réservée pour un défi privé GOALX'
  ),
  (
    guest_wallet.id,
    new_match_id,
    'STAKE_RESERVED',
    -challenge.stake,
    guest_wallet.available_balance - challenge.stake,
    'Mise réservée pour un défi privé GOALX'
  );

  update public.friend_challenges
  set status = 'ACCEPTED', match_id = new_match_id
  where id = challenge.id;

  return new_match_id;
end;
$function$;

revoke all on function public.accept_friend_challenge(text) from public;
grant execute on function public.accept_friend_challenge(text) to authenticated;

-- =========================================================
-- 4) CANCEL — copie exacte de la prod + UN SEUL ajout :
-- le joueur CIBLÉ peut aussi annuler (= REFUSER le défi
-- reçu). Toujours PENDING uniquement, aucune somme touchée.
-- =========================================================

create or replace function public.cancel_friend_challenge(
  requested_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  update public.friend_challenges
  set status = 'CANCELLED'
  where code = upper(trim(requested_code))
    and status = 'PENDING'
    and (
      creator_id = auth.uid()
      or challenged_profile_id = auth.uid()  -- DÉFI DIRECT : refus de la cible
    );

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$function$;

revoke all on function public.cancel_friend_challenge(text) from public;
grant execute on function public.cancel_friend_challenge(text) to authenticated;
