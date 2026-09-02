-- =========================================================
-- GOALX — CONCORDANCE PAR BOUTONS « J'AI GAGNÉ / J'AI PERDU »
-- ⚠️ À EXÉCUTER dans Supabase → SQL Editor (un seul copier-coller).
--
-- Nouveau déroulé :
--   1. Chaque joueur envoie sa capture (chrono 5 min à la 1ʳᵉ).
--   2. Chaque joueur déclare : « J'ai gagné » ou « J'ai perdu ».
--   3. CONCORDANCE (gagnant + perdant) → règlement INSTANT,
--      sans IA, sans commission d'arbitrage.
--   4. LITIGE (déclarations contradictoires ou absentes au
--      terme du délai) → l'IA tranche si ANTHROPIC_API_KEY
--      est configurée, SINON l'administrateur tranche (/admin).
--   5. 1 seule capture au terme du délai → FORFAIT.
--
-- Remplace l'ancien report_match_score (saisie de scores).
-- Ré-exécutable sans risque.
-- =========================================================

-- 0) NETTOYAGE DE L'ANCIEN SYSTÈME (saisie de scores) --------

drop function if exists public.report_match_score(uuid, integer, integer);

-- 1) TABLE DES DÉCLARATIONS ---------------------------------

create table if not exists public.match_outcome_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  outcome text not null check (outcome in ('WON', 'LOST')),
  created_at timestamptz not null default now(),
  unique (match_id, reporter_id)
);

create index if not exists match_outcome_reports_match_index
  on public.match_outcome_reports(match_id);

alter table public.match_outcome_reports enable row level security;

drop policy if exists "Players can view outcome reports for their matches"
  on public.match_outcome_reports;
create policy "Players can view outcome reports for their matches"
on public.match_outcome_reports for select
using (
  exists (
    select 1 from public.matches m
    where m.id = match_id
      and (m.player_one_id = (select auth.uid())
        or m.player_two_id = (select auth.uid()))
  )
);

revoke all on public.match_outcome_reports from authenticated;
revoke all on public.match_outcome_reports from anon;

-- 2) DÉCLARATION D'UN RÉSULTAT (bouton) ---------------------

create or replace function public.report_match_outcome(
  requested_match_id uuid,
  requested_outcome text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_match public.matches%rowtype;
  opponent_id uuid;
  has_ev boolean;
  other_outcome text;
  winner_id uuid;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if requested_outcome not in ('WON', 'LOST') then
    raise exception 'INVALID_OUTCOME';
  end if;

  select * into current_match
  from public.matches
  where id = requested_match_id
    and (player_one_id = current_user_id
      or player_two_id = current_user_id)
  for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if current_match.status not in ('IN_PROGRESS', 'WAITING_FOR_EVIDENCE') then
    raise exception 'MATCH_NOT_REPORTABLE';
  end if;

  -- La capture doit déjà être envoyée : pas de déclaration sans preuve.
  select exists(
    select 1 from public.match_evidence e
    where e.match_id = requested_match_id
      and e.user_id = current_user_id
  ) into has_ev;

  if not has_ev then
    raise exception 'EVIDENCE_REQUIRED';
  end if;

  opponent_id :=
    case when current_match.player_one_id = current_user_id
         then current_match.player_two_id
         else current_match.player_one_id
    end;

  insert into public.match_outcome_reports (match_id, reporter_id, outcome)
  values (requested_match_id, current_user_id, requested_outcome)
  on conflict (match_id, reporter_id)
  do update set
    outcome = excluded.outcome,
    created_at = now();

  select outcome into other_outcome
  from public.match_outcome_reports
  where match_id = requested_match_id
    and reporter_id = opponent_id;

  if other_outcome is null then
    return 'WAITING_OPPONENT';
  end if;

  if requested_outcome = 'WON' and other_outcome = 'LOST' then
    winner_id := current_user_id;
  elsif requested_outcome = 'LOST' and other_outcome = 'WON' then
    winner_id := opponent_id;
  else
    -- LITIGE : les déclarations se contredisent. L'IA (si sa clé
    -- est configurée) ou l'administrateur tranchera sur les captures.
    update public.matches
    set status = 'AI_REVIEW',
        updated_at = now()
    where id = requested_match_id;
    return 'CONFLICT';
  end if;

  -- CONCORDANCE : règlement immédiat, sans IA.
  perform public.apply_agreed_verdict(
    requested_match_id,
    winner_id
  );

  return 'CONFIRMED';
end;
$$;

revoke all on function public.report_match_outcome(uuid, text) from public;
grant execute on function public.report_match_outcome(uuid, text) to authenticated;

-- 3) VERDICT À L'EXPIRATION DU DÉLAI (logique centralisée) ---

create or replace function public.resolve_expired_match(
  requested_match_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_match public.matches%rowtype;
  evidence_count integer;
  submitted_user uuid;
  submitted_outcome text;
  opponent_id uuid;
  outcome_one text;
  outcome_two text;
begin
  select * into current_match
  from public.matches
  where id = requested_match_id
  for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if current_match.status <> 'WAITING_FOR_EVIDENCE' then
    return current_match.status;
  end if;

  if current_match.evidence_deadline is null
     or current_match.evidence_deadline > now() then
    return current_match.status;
  end if;

  select count(*) into evidence_count
  from public.match_evidence
  where match_id = requested_match_id;

  if evidence_count = 0 then
    -- Personne n'a envoyé de preuve : mises restituées.
    perform public.finalize_match(
      requested_match_id,
      'UNFINISHED',
      1,
      '',
      'Le délai de cinq minutes est expiré sans aucune preuve envoyée.',
      jsonb_build_object('reason', 'EVIDENCE_DEADLINE_EXPIRED'),
      'GOALX_TIMEOUT'
    );
    return 'UNFINISHED';
  end if;

  if evidence_count = 1 then
    -- FORFAIT : un seul joueur a envoyé sa capture.
    select user_id into submitted_user
    from public.match_evidence
    where match_id = requested_match_id
    limit 1;

    select outcome into submitted_outcome
    from public.match_outcome_reports
    where match_id = requested_match_id
      and reporter_id = submitted_user;

    opponent_id :=
      case when current_match.player_one_id = submitted_user
           then current_match.player_two_id
           else current_match.player_one_id
      end;

    if submitted_outcome = 'LOST' then
      -- Cas rare : le seul joueur qui a joué le jeu avoue sa
      -- défaite — son adversaire est déclaré vainqueur.
      perform public.apply_match_verdict(
        requested_match_id,
        opponent_id,
        'Vainqueur désigné par la déclaration de son adversaire, qui n''a pas envoyé sa capture dans le délai.'
      );
    else
      perform public.apply_match_verdict(
        requested_match_id,
        submitted_user,
        'Vainqueur par forfait : l''adversaire n''a pas envoyé sa capture dans les cinq minutes.'
      );
    end if;

    return 'COMPLETED';
  end if;

  -- DEUX captures reçues : concordance tardive possible ?
  select outcome into outcome_one
  from public.match_outcome_reports
  where match_id = requested_match_id
    and reporter_id = current_match.player_one_id;

  select outcome into outcome_two
  from public.match_outcome_reports
  where match_id = requested_match_id
    and reporter_id = current_match.player_two_id;

  if outcome_one = 'WON' and outcome_two = 'LOST' then
    perform public.apply_agreed_verdict(
      requested_match_id,
      current_match.player_one_id
    );
    return 'COMPLETED';
  end if;

  if outcome_one = 'LOST' and outcome_two = 'WON' then
    perform public.apply_agreed_verdict(
      requested_match_id,
      current_match.player_two_id
    );
    return 'COMPLETED';
  end if;

  -- Déclarations absentes ou contradictoires : la décision
  -- revient à l'IA (relance automatique) ou à l'administrateur.
  update public.matches
  set status = 'AI_REVIEW',
      updated_at = now()
  where id = requested_match_id
    and status = 'WAITING_FOR_EVIDENCE';

  return 'AI_REVIEW';
end;
$$;

revoke all on function public.resolve_expired_match(uuid) from public;
grant execute on function public.resolve_expired_match(uuid) to service_role;

-- 4) EXPIRATION AUTOMATIQUE (planifiée par pg_cron) ----------

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
    perform public.resolve_expired_match(expired_match.id);
    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;

revoke all on function public.expire_evidence_deadlines() from public;
revoke all on function public.expire_evidence_deadlines() from authenticated;
grant execute on function public.expire_evidence_deadlines() to service_role;
