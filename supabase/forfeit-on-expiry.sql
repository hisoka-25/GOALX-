-- =========================================================
-- GOALX — FORFAIT À L'EXPIRATION DU DÉLAI DE CAPTURES
-- ⚠️ À EXÉCUTER UNE FOIS dans Supabase (SQL Editor).
--
-- Nouveau comportement (le chrono démarre à la 1ʳᵉ capture) :
--   délai expiré + 1 capture reçue
--     → FORFAIT en faveur du joueur qui a envoyé sa preuve
--       (il gagne le pot, commission 10 % incluse) ;
--   délai expiré + 0 capture reçue
--     → match INACHEVÉ, mises restituées aux deux joueurs ;
--   délai expiré + 2 captures reçues (analyse IA déjà en
--     échec quelque part)
--     → on ne touche à rien : l'IA relancera / l'admin tranche.
-- =========================================================

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
grant execute on function public.expire_evidence_deadlines() to service_role;

-- ---------------------------------------------------------
-- (RECOMMANDÉ) Planification chaque minute DANS PostgreSQL
-- via pg_cron — aucune dépendance à Vercel.
--
-- 1) Activer l'extension (Supabase → Database → Extensions →
--    pg_cron), puis exécuter :
--
-- select cron.schedule(
--   'goalx-expire-evidence',
--   '* * * * *',
--   $$select public.expire_evidence_deadlines()$$
-- );
--
-- Pour vérifier plus tard : select * from cron.job;
-- Pour arrêter : select cron.unschedule('goalx-expire-evidence');
-- ---------------------------------------------------------
