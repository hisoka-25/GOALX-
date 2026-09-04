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
