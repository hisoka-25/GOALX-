-- =========================================================
-- GOALX — FORFAIT À L'EXPIRATION DU DÉLAI DE CAPTURES
-- Script complet en UN SEUL COPIER-COLLER.
-- À exécuter dans : Supabase → SQL Editor → New query → Run
--
-- Ce que fait ce script :
--   1. Corrige expire_evidence_deadlines() :
--      - 1 capture reçue au terme des 5 min  → FORFAIT
--        (celui qui a envoyé sa preuve gagne le pot)
--      - 0 capture reçue                     → mises restituées
--      - 2 captures reçues                   → rien (l'IA/admin tranche)
--   2. Active pg_cron et planifie l'exécution
--      chaque minute, automatiquement.
--
-- Le script est ré-exécutable sans risque (idempotent).
-- =========================================================

-- 1) FONCTION CORRIGÉE ------------------------------------

create or replace function public.expire_evidence_deadlines()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_match record;
  evidence_count integer;
  submitted_user uuid;
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
    select count(*) into evidence_count
    from public.match_evidence
    where match_id = expired_match.id;

    if evidence_count = 1 then
      -- Le seul joueur qui a envoyé sa capture gagne par forfait.
      select user_id into submitted_user
      from public.match_evidence
      where match_id = expired_match.id
      limit 1;

      perform public.apply_match_verdict(
        expired_match.id,
        submitted_user,
        'Vainqueur par forfait : l''adversaire n''a pas envoyé sa capture dans les cinq minutes.'
      );
    elsif evidence_count = 0 then
      -- Personne n'a envoyé de preuve : mises restituées.
      perform public.finalize_match(
        expired_match.id,
        'UNFINISHED',
        1,
        '',
        'Le délai de cinq minutes est expiré sans aucune preuve envoyée.',
        jsonb_build_object(
          'reason',
          'EVIDENCE_DEADLINE_EXPIRED'
        ),
        'GOALX_TIMEOUT'
      );
    end if;

    -- evidence_count >= 2 : les deux preuves sont là, le verdict
    -- revient à l'IA (relance auto) ou à l'administrateur.

    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;

revoke all on function public.expire_evidence_deadlines() from public;
revoke all on function public.expire_evidence_deadlines() from authenticated;
grant execute on function public.expire_evidence_deadlines() to service_role;

-- 2) PLANIFICATION CHAQUE MINUTE (pg_cron) ----------------

create extension if not exists pg_cron with schema extensions;

-- Si une planification du même nom existait déjà, on la remplace.
select cron.unschedule('goalx-expire-evidence')
where exists (
  select 1 from cron.job where jobname = 'goalx-expire-evidence'
);

select cron.schedule(
  'goalx-expire-evidence',
  '* * * * *',
  $$select public.expire_evidence_deadlines();$$
);

-- 3) VÉRIFICATION -----------------------------------------
-- Exécutez ensuite cette requête pour confirmer :
--   select jobid, jobname, schedule, active from cron.job;
-- Vous devez voir : goalx-expire-evidence | * * * * * | t
