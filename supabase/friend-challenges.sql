-- =========================================================
-- GOALX — DÉFIS PAR LIEN PRIVÉ (friend challenges)
-- =========================================================
-- ⚠️ ARCHIVE PROD : fonction récupérée depuis la base de
-- production le 04/09/2026 (elle n'existait dans aucun
-- fichier du repo). Ne pas exécuter sur une base vierge :
-- dépend de la table public.friend_challenges (définition
-- à archiver également — demander create_friend_challenge
-- et cancel_friend_challenge pour compléter).
--
-- ANALYSE SÉCURITÉ (04/09/2026) — VÉRIDICT : SÛRE.
-- 1. SELECT ... FOR UPDATE sur la ligne du défi = VERROU :
--    deux clics simultanés sur le même lien sont SÉRIALISÉS.
--    Le 1ᵉʳ gagne, le 2ᵉ voit status <> 'PENDING' et reçoit
--    CHALLENGE_UNAVAILABLE (« déjà accepté ou expiré »).
-- 2. Verrouillage des DEUX portefeuilles avec ORDER BY
--    user_id = prévention d'interblocage (deadlock) correcte.
-- 3. Ordre des contrôles : auth → verrou défi → propriétaire
--    → statut/expiration → mode de jeu → match actif des deux
--    joueurs → verrous portefeuilles → soldes des DEUX joueurs
--    → création match + réservation mises + transactions.
-- 4. SECURITY DEFINER + search_path = '' + noms qualifiés :
--    posture de sécurité correcte.
-- Point de durcissement (non bloquant, future version) :
--    le contrôle « match actif » précède la prise des verrous
--    portefeuilles — une acceptation de défi et un matchmaking
--    parfaitement simultanés pourraient théoriquement créer
--    deux matchs pour le même joueur (fonds réservés deux
--    fois, pas de perte). Re-vérifier après verrous pour fermer
--    cette fenêtre de quelques millisecondes.
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
-- CANCEL_FRIEND_CHALLENGE — archives prod 04/09/2026
-- ANALYSE : SÛRE.
-- 1. Seul le CRÉATEUR peut annuler (creator_id = auth.uid()).
-- 2. Seul un défi encore PENDING peut être annulé (jamais un
--    défi accepté = pas de match cassé après coup).
-- 3. UPDATE ... WHERE status='PENDING' en une seule
--    instruction = atomique ; concurrent avec l'acceptation,
--    l'un des deux gagne proprement (verrou de ligne), jamais
--    les deux.
-- 4. Aucun fond impliqué (rien n'est réservé à la création).
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
    and creator_id = auth.uid()
    and status = 'PENDING';

  get diagnostics updated_count = row_count;
  return updated_count > 0;
end;
$function$;

revoke all on function public.cancel_friend_challenge(text) from public;
grant execute on function public.cancel_friend_challenge(text) to authenticated;

-- =========================================================
-- CREATE_FRIEND_CHALLENGE — archive prod 04/09/2026
-- ANALYSE : SÛRE.
-- 1. Mise validée : >= 500 FCFA et multiple de 500 (paliers).
-- 2. Solde vérifié dès la création (UX) — la vérification qui
--    compte vraiment est refaite SOUS VERROU à l'acceptation.
-- 3. Un seul défi PENDING par créateur à la fois (les anciens
--    sont expirés/supprimés avant).
-- 4. Code GX-XXXXXX aléatoire (6 hex ≈ 16,7 millions de
--    combinaisons), boucle d'unicité, expiration 15 minutes.
-- 5. Nettoyage : toute recherche matchmaking en cours est
--    annulée (impossible d'être en file ET en défi privé).
-- Durcissement possible (non urgent) : allonger le code à 8
-- caractères et limiter le rythme des tentatives d'acceptation.
-- =========================================================

create or replace function public.create_friend_challenge(
  requested_stake bigint
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
    creator_id, code, stake, game_mode, status, expires_at
  ) values (
    current_user_id,
    generated_code,
    requested_stake,
    current_profile.game_mode,
    'PENDING',
    generated_expiry
  );

  return query select generated_code, generated_expiry;
end;
$function$;

revoke all on function public.create_friend_challenge(bigint) from public;
grant execute on function public.create_friend_challenge(bigint) to authenticated;
