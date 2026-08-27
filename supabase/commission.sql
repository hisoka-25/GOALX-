-- =========================================================
-- GOALX — Commission GOALX à 7 % + registre des commissions
-- Migration additive et idempotente.
--
-- 1. Taux de commission appliqué aux NOUVEAUX matchs : 7 %.
-- 2. Table match_commissions : enregistre la commission
--    encaissée sur chaque match terminé (pour le suivi admin).
-- 3. Fonction de synthèse pour le tableau de bord admin.
-- =========================================================

-- 1. Taux par défaut de la colonne (cohérence).
alter table public.matches
  alter column commission_rate set default 7;

-- Déclencheur BEFORE INSERT : force le taux à 7 % même si la
-- fonction de matchmaking transmet encore l'ancienne valeur.
create or replace function public.set_match_commission_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.commission_rate := 7;
  return new;
end;
$$;

drop trigger if exists matches_set_commission on public.matches;

create trigger matches_set_commission
before insert on public.matches
for each row
execute function public.set_match_commission_rate();

-- 2. Registre des commissions perçues.
create table if not exists public.match_commissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique
    references public.matches(id) on delete cascade,
  commission_rate integer not null,
  stake bigint not null,
  -- Commission GOALX = pot total (2 mises) × taux.
  commission_amount bigint not null,
  winner_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists match_commissions_date_index
  on public.match_commissions(created_at desc);

alter table public.match_commissions enable row level security;

-- Aucune lecture côté joueur : seules les fonctions serveur
-- (service_role, donc le tableau de bord admin) y accèdent.
revoke all on public.match_commissions from authenticated;
revoke all on public.match_commissions from anon;

-- Enregistrement automatique quand un match passe COMPLETED.
create or replace function public.record_match_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if
    new.status = 'COMPLETED'
    and new.winner_id is not null
    and old.status is distinct from 'COMPLETED'
  then
    insert into public.match_commissions (
      match_id,
      commission_rate,
      stake,
      commission_amount,
      winner_id
    )
    values (
      new.id,
      new.commission_rate,
      new.stake,
      (new.stake * 2 * new.commission_rate) / 100,
      new.winner_id
    )
    on conflict (match_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists matches_record_commission on public.matches;

create trigger matches_record_commission
after update on public.matches
for each row
execute function public.record_match_commission();

-- 3. Synthèse des commissions pour l'admin (service_role).
create or replace function public.get_commission_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_commission',
      coalesce((select sum(commission_amount) from public.match_commissions), 0),
    'matches_count',
      coalesce((select count(*) from public.match_commissions), 0),
    'today_commission',
      coalesce((
        select sum(commission_amount)
        from public.match_commissions
        where created_at >= date_trunc('day', now())
      ), 0),
    'average_commission',
      coalesce((
        select avg(commission_amount)::bigint
        from public.match_commissions
      ), 0)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_commission_summary() from public;
revoke all on function public.get_commission_summary() from authenticated;
grant execute on function public.get_commission_summary() to service_role;
