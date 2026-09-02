-- =========================================================
-- GOALX — BANC DE TEST DU RÈGLEMENT DES MATCHS
-- Vérifie : concordance, litige, forfait, remboursement,
-- anti-double-paiement, commissions plateforme.
-- =========================================================

-- Joueurs de test
insert into auth.users (id, email, raw_user_meta_data) values
-- (re-exécutable)
  ('aaaaaaaa-0000-0000-0000-000000000001', 'kader@test.ci',
   '{"username":"KADER_X","efootball_username":"kader_x","team":"ROYAUTE FC","division":4,"game_mode":"MOBILE"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'moussa@test.ci',
   '{"username":"MOUSSA10","efootball_username":"moussa10","team":"panama","division":4,"game_mode":"MOBILE"}')
on conflict (id) do nothing;

-- Aides de test
create or replace function test_assert(p_condition boolean, p_label text) returns void
language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'ÉCHEC — %', p_label;
  end if;
  raise notice 'OK — %', p_label;
end $$;

create or replace function test_create_match(p_status text, p_deadline timestamptz default null)
returns uuid language plpgsql as $$
declare m_id uuid;
begin
  insert into public.matches
    (player_one_id, player_two_id, game_mode, division, stake, status, evidence_deadline)
  values
    ('aaaaaaaa-0000-0000-0000-000000000001',
     'bbbbbbbb-0000-0000-0000-000000000002',
     'MOBILE', 4, 500, p_status, p_deadline)
  returning id into m_id;

  update public.wallets set reserved_balance = reserved_balance + 500
   where user_id in ('aaaaaaaa-0000-0000-0000-000000000001',
                     'bbbbbbbb-0000-0000-0000-000000000002');
  return m_id;
end $$;

create or replace function test_add_evidence(p_match uuid, p_user uuid) returns void
language plpgsql as $$
begin
  insert into public.match_evidence (match_id, user_id, storage_path, status)
  values (p_match, p_user, p_match::text || '/' || p_user::text || '.webp', 'PENDING');
end $$;

create or replace function test_available(p_user uuid) returns bigint
language sql as $$ select available_balance from public.wallets where user_id = p_user $$;

create or replace function test_reserved(p_user uuid) returns bigint
language sql as $$ select reserved_balance from public.wallets where user_id = p_user $$;

create or replace function test_platform_balance() returns bigint
language sql as $$ select balance from public.platform_wallets limit 1 $$;

-- =========================================================
\echo '========================================================='
\echo 'T1 — CONCORDANCE : A gagne, B perd → règlement instantané'
\echo '========================================================='
do $$
declare
  m uuid;
  res text;
  platform_before bigint;
begin
  platform_before := test_platform_balance();
  m := test_create_match('WAITING_FOR_EVIDENCE', now() + interval '5 minutes');
  perform test_add_evidence(m, 'aaaaaaaa-0000-0000-0000-000000000001');
  perform test_add_evidence(m, 'bbbbbbbb-0000-0000-0000-000000000002');

  perform set_config('goalx.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  res := public.report_match_outcome(m, 'WON');
  perform test_assert(res = 'WAITING_OPPONENT', 'T1.1 première déclaration → WAITING_OPPONENT');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = 0, 'T1.2 pas de crédit avant la 2e déclaration');

  perform set_config('goalx.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
  res := public.report_match_outcome(m, 'LOST');
  perform test_assert(res = 'CONFIRMED', 'T1.3 concordance → CONFIRMED');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = 900, 'T1.4 gagnant crédité 900 FCFA (2x500 - 10%)');
  perform test_assert(test_reserved('aaaaaaaa-0000-0000-0000-000000000001') = 0, 'T1.5 mise du gagnant libérée');
  perform test_assert(test_available('bbbbbbbb-0000-0000-0000-000000000002') = 0, 'T1.6 perdant non crédité');
  perform test_assert(test_reserved('bbbbbbbb-0000-0000-0000-000000000002') = 0, 'T1.7 mise du perdant libérée');
  perform test_assert(test_platform_balance() = platform_before + 100, 'T1.8 commission plateforme +100 FCFA');
  perform test_assert(exists(select 1 from public.matches where id = m
                             and status = 'COMPLETED'
                             and winner_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
                      'T1.9 match COMPLETED, vainqueur = A');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T2 — ANTI-REJEU : redéclarer après clôture refusé'
\echo '========================================================='
do $$
declare
  m uuid;
  platform_before bigint;
begin
  platform_before := test_platform_balance();
  select id into m from public.matches where status = 'COMPLETED' order by completed_at desc limit 1;

  perform set_config('goalx.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  begin
    perform public.report_match_outcome(m, 'WON');
    raise exception 'ÉCHEC T2 — déclaration acceptée sur un match terminé';
  exception when others then
    perform test_assert(sqlerrm like '%MATCH_NOT_REPORTABLE%', 'T2.1 re-déclaration refusée (' || sqlerrm || ')');
  end;

  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = 900, 'T2.2 solde du gagnant inchangé');
  perform test_assert(test_platform_balance() = platform_before, 'T2.3 commission non doublée');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T3 — LITIGE : les deux déclarent avoir gagné → arbitrage'
\echo '========================================================='
do $$
declare
  m uuid;
  res text;
  fin text;
  platform_before bigint;
begin
  platform_before := test_platform_balance();
  m := test_create_match('WAITING_FOR_EVIDENCE', now() + interval '5 minutes');
  perform test_add_evidence(m, 'aaaaaaaa-0000-0000-0000-000000000001');
  perform test_add_evidence(m, 'bbbbbbbb-0000-0000-0000-000000000002');

  perform set_config('goalx.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  res := public.report_match_outcome(m, 'WON');
  perform set_config('goalx.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
  res := public.report_match_outcome(m, 'WON');
  perform test_assert(res = 'CONFLICT', 'T3.1 double « j''ai gagné » → CONFLICT');
  perform test_assert(exists(select 1 from public.matches where id = m and status = 'AI_REVIEW'),
                      'T3.2 match basculé en AI_REVIEW (IA/admin)');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = 900, 'T3.3 aucun crédit pendant le litige (solde A inchangé)');

  -- L'IA (ou l'admin) tranche : B a gagné 2-1.
  fin := public.finalize_match(m, 'PLAYER_TWO_WON', 0.95, '1-2',
                               'L''équipe panama gagne 2-1',
                               '{"method":"TEST_IA"}'::jsonb, 'CLAUDE-TEST');
  perform test_assert(fin = 'COMPLETED', 'T3.4 verdict IA appliqué → COMPLETED');
  perform test_assert(test_available('bbbbbbbb-0000-0000-0000-000000000002') = 900, 'T3.5 vainqueur désigné crédité 900');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = 900, 'T3.6 l''autre joueur garde son solde (900 de T1)');
  perform test_assert(test_platform_balance() = platform_before + 100, 'T3.7 commission plateforme +100');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T4 — FORFAIT SIMPLE : 1 capture, adversaire absent'
\echo '========================================================='
do $$
declare
  m uuid;
  res text;
  platform_before bigint;
  avail_a_before bigint;
begin
  platform_before := test_platform_balance();
  avail_a_before := test_available('aaaaaaaa-0000-0000-0000-000000000001');
  m := test_create_match('WAITING_FOR_EVIDENCE', now() - interval '1 minute');
  perform test_add_evidence(m, 'aaaaaaaa-0000-0000-0000-000000000001');

  res := public.resolve_expired_match(m);
  perform test_assert(res = 'COMPLETED', 'T4.1 délai expiré → COMPLETED');
  perform test_assert(exists(select 1 from public.matches where id = m
                             and winner_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
                      'T4.2 vainqueur par forfait = celui qui a envoyé sa capture');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = avail_a_before + 900, 'T4.3 gagnant crédité +900');
  perform test_assert(test_platform_balance() = platform_before + 100, 'T4.4 commission +100');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T5 — FORFAIT + AVEU : le seul capturiste avoue sa défaite'
\echo '========================================================='
do $$
declare
  m uuid;
  res text;
  platform_before bigint;
  avail_b_before bigint;
begin
  platform_before := test_platform_balance();
  avail_b_before := test_available('bbbbbbbb-0000-0000-0000-000000000002');
  m := test_create_match('WAITING_FOR_EVIDENCE', now() - interval '1 minute');
  perform test_add_evidence(m, 'aaaaaaaa-0000-0000-0000-000000000001');

  perform set_config('goalx.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  res := public.report_match_outcome(m, 'LOST');
  perform test_assert(res = 'WAITING_OPPONENT', 'T5.1 aveu enregistré (WAITING_OPPONENT)');

  res := public.resolve_expired_match(m);
  perform test_assert(res = 'COMPLETED', 'T5.2 délai expiré → COMPLETED');
  perform test_assert(exists(select 1 from public.matches where id = m
                             and winner_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
                      'T5.3 vainqueur = l''adversaire désigné par l''aveu');
  perform test_assert(test_available('bbbbbbbb-0000-0000-0000-000000000002') = avail_b_before + 900, 'T5.4 adversaire crédité +900');
  perform test_assert(test_platform_balance() = platform_before + 100, 'T5.5 commission +100');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T6 — AUCUNE PREUVE : remboursement des deux joueurs'
\echo '========================================================='
do $$
declare
  m uuid;
  res text;
  platform_before bigint;
  avail_a_before bigint;
  avail_b_before bigint;
begin
  platform_before := test_platform_balance();
  avail_a_before := test_available('aaaaaaaa-0000-0000-0000-000000000001');
  avail_b_before := test_available('bbbbbbbb-0000-0000-0000-000000000002');
  m := test_create_match('WAITING_FOR_EVIDENCE', now() - interval '1 minute');

  res := public.resolve_expired_match(m);
  perform test_assert(res = 'UNFINISHED', 'T6.1 délai expiré sans preuve → UNFINISHED');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = avail_a_before + 500, 'T6.2 joueur A remboursé +500');
  perform test_assert(test_available('bbbbbbbb-0000-0000-0000-000000000002') = avail_b_before + 500, 'T6.3 joueur B remboursé +500');
  perform test_assert(test_reserved('aaaaaaaa-0000-0000-0000-000000000001') = 0, 'T6.4 mises libérées (A)');
  perform test_assert(test_platform_balance() = platform_before, 'T6.5 AUCUNE commission sur un remboursement');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T7 — 2 CAPTURES, AUCUNE DÉCLARATION → arbitrage'
\echo '========================================================='
do $$
declare
  m uuid;
  res text;
  platform_before bigint;
begin
  platform_before := test_platform_balance();
  m := test_create_match('WAITING_FOR_EVIDENCE', now() - interval '1 minute');
  perform test_add_evidence(m, 'aaaaaaaa-0000-0000-0000-000000000001');
  perform test_add_evidence(m, 'bbbbbbbb-0000-0000-0000-000000000002');

  res := public.resolve_expired_match(m);
  perform test_assert(res = 'AI_REVIEW', 'T7.1 délai expiré sans déclarations → AI_REVIEW');
  perform test_assert(test_platform_balance() = platform_before, 'T7.2 aucun mouvement d''argent');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T8 — CONCORDANCE TARDIVE (déclarations posées avant expiration)'
\echo '========================================================='
do $$
declare
  m uuid;
  res text;
  platform_before bigint;
  avail_a_before bigint;
begin
  platform_before := test_platform_balance();
  avail_a_before := test_available('aaaaaaaa-0000-0000-0000-000000000001');
  m := test_create_match('WAITING_FOR_EVIDENCE', now() - interval '1 minute');
  perform test_add_evidence(m, 'aaaaaaaa-0000-0000-0000-000000000001');
  perform test_add_evidence(m, 'bbbbbbbb-0000-0000-0000-000000000002');

  -- Déclarations complémentaires insérées (la RPC aurait déjà réglé :
  -- on simule l'état tel que resolve_expired_match peut le rencontrer).
  insert into public.match_outcome_reports (match_id, reporter_id, outcome) values
    (m, 'aaaaaaaa-0000-0000-0000-000000000001', 'WON'),
    (m, 'bbbbbbbb-0000-0000-0000-000000000002', 'LOST');

  res := public.resolve_expired_match(m);
  perform test_assert(res = 'COMPLETED', 'T8.1 concordance tardive → COMPLETED');
  perform test_assert(exists(select 1 from public.matches where id = m
                             and winner_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
                      'T8.2 vainqueur = A');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = avail_a_before + 900, 'T8.3 A crédité +900');
  perform test_assert(test_platform_balance() = platform_before + 100, 'T8.4 commission +100');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T9 — SÉCURITÉ : déclaration sans capture impossible'
\echo '========================================================='
do $$
declare
  m uuid;
begin
  m := test_create_match('WAITING_FOR_EVIDENCE', now() + interval '5 minutes');

  perform set_config('goalx.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  begin
    perform public.report_match_outcome(m, 'WON');
    raise exception 'ÉCHEC T9 — déclaration acceptée sans capture';
  exception when others then
    perform test_assert(sqlerrm like '%EVIDENCE_REQUIRED%', 'T9.1 refus sans capture (' || sqlerrm || ')');
  end;

  perform set_config('goalx.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
  begin
    perform public.report_match_outcome(m, 'PEUT-ETRE');
    raise exception 'ÉCHEC T9 — issue invalide acceptée';
  exception when others then
    perform test_assert(sqlerrm like '%INVALID_OUTCOME%', 'T9.2 issue invalide refusée (' || sqlerrm || ')');
  end;
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T10 — BALAYAGE GLOBAL : expire_evidence_deadlines()'
\echo '========================================================='
do $$
declare
  m9 uuid;
  m10 uuid;
  n integer;
  platform_before bigint;
begin
  platform_before := test_platform_balance();
  m9 := test_create_match('WAITING_FOR_EVIDENCE', now() - interval '2 minutes');
  perform test_add_evidence(m9, 'bbbbbbbb-0000-0000-0000-000000000002');
  m10 := test_create_match('WAITING_FOR_EVIDENCE', now() - interval '2 minutes');

  -- Un match NON expiré ne doit pas être touché.
  perform test_create_match('WAITING_FOR_EVIDENCE', now() + interval '5 minutes');

  select public.expire_evidence_deadlines() into n;
  perform test_assert(n = 2, 'T10.1 exactement 2 matchs expirés traités (pas les autres) — traités : ' || n);
  perform test_assert(exists(select 1 from public.matches where id = m9
                             and status = 'COMPLETED'
                             and winner_id = 'bbbbbbbb-0000-0000-0000-000000000002'),
                      'T10.2 forfait appliqué au bon vainqueur');
  perform test_assert(exists(select 1 from public.matches where id = m10 and status = 'UNFINISHED'),
                      'T10.3 match sans preuve → UNFINISHED');
  perform test_assert(test_platform_balance() = platform_before + 100, 'T10.4 une seule commission (forfait), pas sur le remboursement');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'T11 — PROTECTION DOUBLE PAIEMENT (règlements re-joués)'
\echo '========================================================='
do $$
declare
  m uuid;
  res text;
  avail_a bigint;
  avail_b bigint;
  platform_before bigint;
begin
  select id into m from public.matches where status = 'COMPLETED' order by completed_at desc limit 1;
  avail_a := test_available('aaaaaaaa-0000-0000-0000-000000000001');
  avail_b := test_available('bbbbbbbb-0000-0000-0000-000000000002');
  platform_before := test_platform_balance();

  -- Re-jeu du règlement concordant :
  res := public.apply_agreed_verdict(m, 'aaaaaaaa-0000-0000-0000-000000000001');
  perform test_assert(res = 'COMPLETED', 'T11.1 apply_agreed_verdict rejoué → idempotent');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = avail_a, 'T11.2 solde A inchangé');
  perform test_assert(test_available('bbbbbbbb-0000-0000-0000-000000000002') = avail_b, 'T11.3 solde B inchangé');
  perform test_assert(test_platform_balance() = platform_before, 'T11.4 commission non re-créditée');

  -- Re-jeu du verdict IA :
  res := public.finalize_match(m, 'UNFINISHED', 1, '', 'rejeu',
                               '{}'::jsonb, 'REJEU');
  perform test_assert(res = 'COMPLETED', 'T11.5 finalize_match rejoué → aucun effet');
  perform test_assert(test_available('aaaaaaaa-0000-0000-0000-000000000001') = avail_a, 'T11.6 solde A toujours inchangé');

  -- Re-jeu du forfait :
  res := public.apply_match_verdict(m, 'bbbbbbbb-0000-0000-0000-000000000002', 'rejeu');
  perform test_assert(res = 'COMPLETED', 'T11.7 apply_match_verdict rejoué → aucun effet');
  perform test_assert(test_platform_balance() = platform_before, 'T11.8 commission toujours identique');
end $$;

-- =========================================================
\echo '========================================================='
\echo 'BILAN FINAL DES PORTEFEUILLES'
\echo '========================================================='
select p.username,
       w.available_balance as disponible,
       w.reserved_balance as reserve
from public.wallets w
join public.profiles p on p.id = w.user_id
order by p.username;

select balance as solde_plateforme from public.platform_wallets limit 1;

select transaction_type, amount, description
from public.platform_transactions order by created_at;
