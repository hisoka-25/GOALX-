-- =========================================================
-- GOALX — Suppression du bonus de bienvenue (10 000 crédits)
--
-- En passant à l'argent réel, les nouveaux joueurs doivent
-- commencer avec un solde à 0 et recharger pour jouer.
-- Cette migration :
--   1. recrée le déclencheur handle_new_user pour ouvrir un
--      portefeuille à 0 SANS crédit de bienvenue ;
--   2. met le défaut de la colonne wallets.available_balance
--      à 0 (cohérence).
--
-- Les comptes EXISTANTS ne sont pas modifiés (ils gardent
-- leur solde actuel). Migration idempotente.
-- =========================================================

-- 1. Le portefeuille nouvellement créé démarre à 0.
alter table public.wallets
  alter column available_balance set default 0;

-- 2. Recréation de la fonction de création de profil/portefeuille.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_division integer;
  requested_mode text;
  requested_username text;
begin
  requested_division :=
    greatest(
      1,
      least(
        10,
        coalesce(
          (new.raw_user_meta_data ->> 'division')::integer,
          10
        )
      )
    );

  requested_mode :=
    upper(
      coalesce(
        nullif(new.raw_user_meta_data ->> 'game_mode', ''),
        'MOBILE'
      )
    );

  if requested_mode not in (
    'MOBILE',
    'PLAYSTATION',
    'XBOX',
    'PC'
  ) then
    requested_mode := 'MOBILE';
  end if;

  requested_username :=
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      'player_' || substring(new.id::text from 1 for 8)
    );

  insert into public.profiles (
    id,
    username,
    efootball_username,
    team,
    division,
    game_mode
  )
  values (
    new.id,
    requested_username,
    coalesce(
      nullif(
        trim(new.raw_user_meta_data ->> 'efootball_username'),
        ''
      ),
      requested_username
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'team'), ''),
      'Équipe non définie'
    ),
    requested_division,
    requested_mode
  );

  -- Portefeuille ouvert à 0 : aucun crédit fictif offert.
  insert into public.wallets (
    user_id,
    available_balance,
    reserved_balance
  )
  values (
    new.id,
    0,
    0
  );

  return new;
end;
$$;
