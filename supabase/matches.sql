-- =========================================================
-- GOALX — Cycle de vie et règlement des matchs
-- À exécuter après :
-- 1. supabase/schema.sql
-- 2. supabase/matchmaking.sql
-- =========================================================

-- =========================================================
-- COMMENCER L’ENVOI DES CAPTURES
-- =========================================================

create or replace function public.start_evidence_submission(
  requested_match_id uuid
)
returns table (
  match_status text,
  evidence_deadline timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  current_match public.matches%rowtype;
  deadline timestamptz;
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

  if current_match.status = 'WAITING_FOR_EVIDENCE' then
    return query
    select
      current_match.status,
      current_match.evidence_deadline;

    return;
  end if;

  if current_match.status <> 'IN_PROGRESS' then
    raise exception 'MATCH_NOT_IN_PROGRESS';
  end if;

  deadline := now() + interval '5 minutes';

  update public.matches
  set
    status = 'WAITING_FOR_EVIDENCE',
    evidence_deadline = deadline
  where id = requested_match_id;

  return query
  select
    'WAITING_FOR_EVIDENCE'::text,
    deadline;
end;
$$;

-- =========================================================
-- RÈGLEMENT SÉCURISÉ D’UN MATCH
-- Cette fonction sera appelée uniquement par le serveur IA.
-- =========================================================

create or replace function public.finalize_match(
  requested_match_id uuid,
  requested_verdict text,
  requested_confidence numeric,
  requested_score text,
  requested_explanation text,
  requested_extracted_data jsonb,
  requested_model_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_match public.matches%rowtype;

  player_one_wallet public.wallets%rowtype;
  player_two_wallet public.wallets%rowtype;

  winner_wallet_id uuid;
  loser_wallet_id uuid;

  winning_player_id uuid;
  losing_player_id uuid;

  winner_balance bigint;
  loser_balance bigint;
  player_one_balance bigint;
  player_two_balance bigint;

  payout bigint;
begin
  if requested_verdict not in (
    'PLAYER_ONE_WON',
    'PLAYER_TWO_WON',
    'UNFINISHED'
  ) then
    raise exception 'INVALID_VERDICT';
  end if;

  if
    requested_confidence is null
    or requested_confidence < 0
    or requested_confidence > 1
  then
    raise exception 'INVALID_CONFIDENCE';
  end if;

  select *
  into current_match
  from public.matches
  where id = requested_match_id
  for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  /*
   * Protection contre le double paiement.
   * Si le match est déjà terminé, aucun portefeuille
   * n’est modifié une seconde fois.
   */
  if current_match.status in (
    'COMPLETED',
    'UNFINISHED'
  ) then
    return current_match.status;
  end if;

  if current_match.status not in (
    'WAITING_FOR_EVIDENCE',
    'AI_REVIEW'
  ) then
    raise exception 'MATCH_NOT_READY_FOR_REVIEW';
  end if;

  select *
  into player_one_wallet
  from public.wallets
  where user_id = current_match.player_one_id
  for update;

  select *
  into player_two_wallet
  from public.wallets
  where user_id = current_match.player_two_id
  for update;

  if
    player_one_wallet.id is null
    or player_two_wallet.id is null
  then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  if
    player_one_wallet.reserved_balance <
      current_match.stake
    or player_two_wallet.reserved_balance <
      current_match.stake
  then
    raise exception 'RESERVED_BALANCE_INVALID';
  end if;

  update public.matches
  set status = 'AI_REVIEW'
  where id = requested_match_id;

  insert into public.ai_reviews (
    match_id,
    verdict,
    confidence,
    detected_score,
    explanation,
    extracted_data,
    model_name
  )
  values (
    requested_match_id,
    requested_verdict,
    requested_confidence,
    nullif(requested_score, ''),
    requested_explanation,
    coalesce(
      requested_extracted_data,
      '{}'::jsonb
    ),
    requested_model_name
  )
  on conflict (match_id)
  do update set
    verdict = excluded.verdict,
    confidence = excluded.confidence,
    detected_score = excluded.detected_score,
    explanation = excluded.explanation,
    extracted_data = excluded.extracted_data,
    model_name = excluded.model_name,
    created_at = now();

  -- =======================================================
  -- MATCH INACHEVÉ : RESTITUTION DES DEUX MISES
  -- =======================================================

  if requested_verdict = 'UNFINISHED' then
    update public.wallets
    set
      available_balance =
        available_balance + current_match.stake,
      reserved_balance =
        reserved_balance - current_match.stake
    where id = player_one_wallet.id
    returning available_balance
    into player_one_balance;

    update public.wallets
    set
      available_balance =
        available_balance + current_match.stake,
      reserved_balance =
        reserved_balance - current_match.stake
    where id = player_two_wallet.id
    returning available_balance
    into player_two_balance;

    insert into public.wallet_transactions (
      wallet_id,
      match_id,
      transaction_type,
      amount,
      balance_after,
      description
    )
    values
    (
      player_one_wallet.id,
      requested_match_id,
      'STAKE_RETURNED',
      current_match.stake,
      player_one_balance,
      'Mise restituée : match inachevé'
    ),
    (
      player_two_wallet.id,
      requested_match_id,
      'STAKE_RETURNED',
      current_match.stake,
      player_two_balance,
      'Mise restituée : match inachevé'
    );

    update public.matches
    set
      status = 'UNFINISHED',
      winner_id = null,
      completed_at = now()
    where id = requested_match_id;

    delete from public.matchmaking_queue
    where match_id = requested_match_id;

    return 'UNFINISHED';
  end if;

  -- =======================================================
  -- MATCH AVEC GAGNANT ET PERDANT
  -- =======================================================

  if requested_verdict = 'PLAYER_ONE_WON' then
    winning_player_id :=
      current_match.player_one_id;

    losing_player_id :=
      current_match.player_two_id;

    winner_wallet_id :=
      player_one_wallet.id;

    loser_wallet_id :=
      player_two_wallet.id;
  else
    winning_player_id :=
      current_match.player_two_id;

    losing_player_id :=
      current_match.player_one_id;

    winner_wallet_id :=
      player_two_wallet.id;

    loser_wallet_id :=
      player_one_wallet.id;
  end if;

  /*
   * Exemple :
   * deux mises de 500 = 1 000 FCFA
   * commission de 10 % = 100 FCFA
   * versement au gagnant = 900 FCFA
   */
  payout := (
    current_match.stake
    * 2
    * (
      100 - current_match.commission_rate
    )
  ) / 100;

  update public.wallets
  set
    available_balance =
      available_balance + payout,
    reserved_balance =
      reserved_balance - current_match.stake
  where id = winner_wallet_id
  returning available_balance
  into winner_balance;

  update public.wallets
  set
    reserved_balance =
      reserved_balance - current_match.stake
  where id = loser_wallet_id
  returning available_balance
  into loser_balance;

  insert into public.wallet_transactions (
    wallet_id,
    match_id,
    transaction_type,
    amount,
    balance_after,
    description
  )
  values (
    winner_wallet_id,
    requested_match_id,
    'MATCH_WIN',
    payout,
    winner_balance,
    'Gain du match après commission GOALX'
  );

  /*
   * La mise du perdant a déjà été retirée du solde
   * disponible lors de sa réservation. Le montant est
   * donc égal à zéro ici pour éviter un double débit.
   */
  insert into public.wallet_transactions (
    wallet_id,
    match_id,
    transaction_type,
    amount,
    balance_after,
    description
  )
  values (
    loser_wallet_id,
    requested_match_id,
    'MATCH_LOSS',
    0,
    loser_balance,
    'Mise définitivement perdue'
  );

  update public.matches
  set
    status = 'COMPLETED',
    winner_id = winning_player_id,
    completed_at = now()
  where id = requested_match_id;

  update public.match_evidence
  set status = 'ACCEPTED'
  where match_id = requested_match_id;

  delete from public.matchmaking_queue
  where match_id = requested_match_id;

  return 'COMPLETED';
end;
$$;

-- =========================================================
-- EXPIRATION D’UN MATCH SANS PREUVES SUFFISANTES
-- Cette fonction pourra être appelée par une tâche planifiée.
-- =========================================================

create or replace function public.expire_evidence_deadlines()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_match record;
  expired_count integer := 0;
begin
  for expired_match in
    select id
    from public.matches
    where status = 'WAITING_FOR_EVIDENCE'
      and evidence_deadline <= now()
    order by evidence_deadline asc
    for update skip locked
  loop
    perform public.finalize_match(
      expired_match.id,
      'UNFINISHED',
      1,
      '',
      'Le délai de cinq minutes est expiré sans preuves suffisantes.',
      jsonb_build_object(
        'reason',
        'EVIDENCE_DEADLINE_EXPIRED'
      ),
      'GOALX_TIMEOUT'
    );

    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;

-- =========================================================
-- AUTORISATIONS
-- =========================================================

revoke all
on function public.start_evidence_submission(uuid)
from public;

grant execute
on function public.start_evidence_submission(uuid)
to authenticated;

revoke all
on function public.finalize_match(
  uuid,
  text,
  numeric,
  text,
  text,
  jsonb,
  text
)
from public;

revoke all
on function public.finalize_match(
  uuid,
  text,
  numeric,
  text,
  text,
  jsonb,
  text
)
from authenticated;

grant execute
on function public.finalize_match(
  uuid,
  text,
  numeric,
  text,
  text,
  jsonb,
  text
)
to service_role;

revoke all
on function public.expire_evidence_deadlines()
from public;

revoke all
on function public.expire_evidence_deadlines()
from authenticated;

grant execute
on function public.expire_evidence_deadlines()
to service_role;
