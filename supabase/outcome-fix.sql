-- =========================================================
-- GOALX — CORRECTIF DÉCLARATIONS (à exécuter dans Supabase)
--
-- Corrige 2 problèmes détectés en test réel :
--   1. Les joueurs ne voyaient PAS les déclarations (boutons qui
--      reviennent après actualisation, déclaration adverse
--      invisible) : la table était révoquée au rôle "authenticated"
--      sans le GRANT SELECT nécessaire. 
--   2. Une fois le match en arbitrage (AI_REVIEW), les joueurs
--      ne pouvaient plus se mettre d'accord : désormais une
--      concordance (même tardive) règle le match immédiatement,
--      sans attendre l'IA ni l'administrateur.
--
-- Ré-exécutable sans risque.
-- =========================================================

-- 1) LE BUG : rendre la table lisible par les joueurs connectés
--    (la politique RLS "Players can view outcome reports for
--    their matches" limite déjà les lignes à leurs matchs).
grant select on public.match_outcome_reports to authenticated;

-- 2) Réconciliation : déclaration possible même en AI_REVIEW.
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

  -- AI_REVIEW accepté : si les joueurs se mettent d'accord,
  -- la concordance règle le match sans arbitrage.
  if current_match.status not in
      ('IN_PROGRESS', 'WAITING_FOR_EVIDENCE', 'AI_REVIEW') then
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
    -- LITIGE : les déclarations se contredisent toujours.
    update public.matches
    set status = 'AI_REVIEW',
        updated_at = now()
    where id = requested_match_id;
    return 'CONFLICT';
  end if;

  -- CONCORDANCE (y compris tardive, après un premier litige) :
  -- règlement immédiat, sans IA.
  perform public.apply_agreed_verdict(
    requested_match_id,
    winner_id
  );

  return 'CONFIRMED';
end;
$$;

revoke all on function public.report_match_outcome(uuid, text) from public;
grant execute on function public.report_match_outcome(uuid, text) to authenticated;
