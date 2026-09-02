-- =========================================================
-- GOALX — AUTO-VERDICT DES MATCHS
-- Règles :
--  1. Les deux joueurs soumettent score + capture.
--  2. Même vainqueur déclaré -> verdict auto immédiat.
--  3. Contradiction -> statut DISPUTED (l'IA tranche côté serveur).
--  4. Un joueur ne soumet rien dans les 5 min -> forfait en
--     faveur de celui qui a soumis (appel auto côté serveur).
-- =========================================================

-- Suppression des anciennes versions (changement de signature)
drop function if exists public.report_match_score(uuid, integer, integer);
drop function if exists public.apply_match_verdict(uuid, uuid, text);

-- On (re)crée la table des déclarations proprement (structure à jour).
drop table if exists public.match_score_reports cascade;
create table public.match_score_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  winner_id uuid references public.profiles(id) on delete set null,
  my_goals integer,
  opponent_goals integer,
  has_evidence boolean default false,
  created_at timestamptz not null default now(),
  unique(match_id, reporter_id)
);

create index if not exists match_score_reports_match_index
  on public.match_score_reports(match_id);

alter table public.match_score_reports enable row level security;
drop policy if exists "Players can view reports for their matches" on public.match_score_reports;
create policy "Players can view reports for their matches"
on public.match_score_reports for select
using (
  exists (
    select 1 from public.matches m
    where m.id = match_id
      and (m.player_one_id = (select auth.uid())
        or m.player_two_id = (select auth.uid()))
  )
);

revoke all on public.match_score_reports from authenticated;
revoke all on public.match_score_reports from anon;

-- Déclaration d'un résultat par un joueur.
-- Appelé après upload de la capture (has_evidence = true).
create or replace function public.report_match_score(
  requested_match_id uuid,
  reported_my_goals integer,
  reported_opponent_goals integer
)
returns table (
  queue_id uuid,
  queue_status text,
  found_match_id uuid,
  winner text,
  match_status text,
  report_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_match public.matches%rowtype;
  my_winner_id uuid;
  my_report public.match_score_reports%rowtype;
  other_report public.match_score_reports%rowtype;
  has_ev boolean;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
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

  if current_match.status not in ('ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_EVIDENCE') then
    raise exception 'MATCH_NOT_READY';
  end if;

  if reported_my_goals = reported_opponent_goals then
    raise exception 'NO_DRAW_ALLOWED';
  end if;

  my_winner_id :=
    case when reported_my_goals > reported_opponent_goals
      then current_user_id
      else case current_user_id
             when current_match.player_one_id then current_match.player_two_id
             else current_match.player_one_id
           end
    end;

  -- La capture est-elle bien présente ?
  select exists(
    select 1 from public.match_evidence e
    where e.match_id = requested_match_id
      and e.user_id = current_user_id
  ) into has_ev;

  insert into public.match_score_reports
    (match_id, reporter_id, winner_id, my_goals, opponent_goals, has_evidence)
  values
    (requested_match_id, current_user_id, my_winner_id,
     reported_my_goals, reported_opponent_goals, has_ev)
  on conflict (match_id, reporter_id)
  do update set
    winner_id = excluded.winner_id,
    my_goals = excluded.my_goals,
    opponent_goals = excluded.opponent_goals,
    has_evidence = excluded.has_evidence,
    created_at = now();

  -- Place le match en phase de déclaration.
  if current_match.status = 'IN_PROGRESS' then
    update public.matches
    set status = 'WAITING_FOR_EVIDENCE',
        evidence_deadline = coalesce(evidence_deadline, now() + interval '5 minutes')
    where id = current_match.id;
  end if;

  -- Récupère la déclaration de l'adversaire.
  select * into other_report
  from public.match_score_reports
  where match_id = requested_match_id
    and reporter_id <> current_user_id;

  if not found then
    -- En attente de l'adversaire.
    return query
      select null::uuid, null::text, null::uuid,
             null::text, 'IN_PROGRESS'::text, 'WAITING_OPPONENT'::text;
    return;
  end if;

  -- Les deux ont déclaré.
  select * into my_report
  from public.match_score_reports
  where match_id = requested_match_id and reporter_id = current_user_id;

  if my_report.winner_id = other_report.winner_id then
    -- CONCORDANCE -> verdict auto. Si la finalisation directe echoue,
    -- on bascule en AI_REVIEW : l'auto-resolve (serveur) finalisera.
    declare
      v_verdict text;
    begin
      if my_report.winner_id = current_match.player_one_id then
        v_verdict := 'PLAYER_ONE_WON';
      else
        v_verdict := 'PLAYER_TWO_WON';
      end if;

      if current_match.status in ('IN_PROGRESS','MATCHED','ACCEPTED') then
        update public.matches set status = 'WAITING_FOR_EVIDENCE'
        where id = requested_match_id;
      end if;

      perform public.finalize_match(
        requested_match_id,
        v_verdict,
        1.0,
        null,
        'Concordance des deux joueurs',
        jsonb_build_object('method','AGREED_BOTH_PLAYERS'),
        'GOALX_AUTO'
      );
    exception when others then
      update public.matches set status = 'AI_REVIEW'
      where id = requested_match_id;
      return query
        select null::uuid, null::text, requested_match_id,
               null::text, 'AI_REVIEW'::text, 'CONFLICT'::text;
    end;

    return query
      select null::uuid, null::text,
             requested_match_id,
             'auto'::text, 'COMPLETED'::text, 'CONFIRMED'::text;
  else
    -- CONTRADICTION -> litige, l'IA tranche côté serveur.
    update public.matches
    set status = 'AI_REVIEW'
    where id = requested_match_id;

    return query
      select null::uuid, null::text,
             requested_match_id,
             null::text, 'AI_REVIEW'::text, 'CONFLICT'::text;
  end if;
end;
$$;

revoke all on function public.report_match_score(uuid, integer, integer) from public;
grant execute on function public.report_match_score(uuid, integer, integer) to authenticated;

-- Fonction appelée par le serveur pour appliquer le verdict
-- (concordance auto, forfait, ou décision IA). Réutilise finalize_match.
create or replace function public.apply_match_verdict(
  requested_match_id uuid,
  requested_winner_id uuid,
  requested_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_match public.matches%rowtype;
  winner_verdict text;
  winner_name text;
begin
  select * into current_match
  from public.matches where id = requested_match_id for update;

  if not found then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if current_match.status = 'COMPLETED' then
    return 'COMPLETED';
  end if;

  -- Détermine si player_one ou player_two gagne (verdict attendu par finalize_match).
  if requested_winner_id = current_match.player_one_id then
    winner_verdict := 'PLAYER_ONE_WON';
  elsif requested_winner_id = current_match.player_two_id then
    winner_verdict := 'PLAYER_TWO_WON';
  else
    raise exception 'INVALID_WINNER';
  end if;

  select coalesce(efootball_username, username) into winner_name
  from public.profiles where id = requested_winner_id;

  perform public.finalize_match(
    requested_match_id,
    winner_verdict,
    1.0,
    null,
    coalesce(requested_reason, 'Verdit automatique GOALX'),
    jsonb_build_object(
      'method', 'AUTO_VERDICT',
      'reason', coalesce(requested_reason, 'auto'),
      'winner', winner_name
    ),
    'GOALX_AUTO'
  );

  return 'COMPLETED';
end;
$$;

revoke all on function public.apply_match_verdict(uuid, uuid, text) from public;
grant execute on function public.apply_match_verdict(uuid, uuid, text) to service_role;
