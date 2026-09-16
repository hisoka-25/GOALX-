-- =========================================================
-- GOALX — JOUEURS EN LIGNE + CONTACT WHATSAPP
-- À exécuter dans Supabase (SQL Editor). Ré-exécutable.
--
-- 1. profiles.last_seen_at : date de dernière activité
--    (mise à jour par la fonction touch_presence, appelée
--    par l'application toutes les 60 secondes).
--    « En ligne » = activité il y a moins de 5 minutes.
-- 2. profiles.whatsapp_number : numéro WhatsApp facultatif,
--    partagé volontairement par le joueur pour permettre
--    aux autres de lui proposer un match (bouton wa.me).
--    Format international, chiffres uniquement (ex : 22507...).
-- =========================================================

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

alter table public.profiles
  add column if not exists whatsapp_number text;

-- Contrôle simple du format si renseigné (8 à 15 chiffres).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_whatsapp_number_format'
  ) then
    alter table public.profiles
      add constraint profiles_whatsapp_number_format
      check (
        whatsapp_number is null
        or whatsapp_number ~ '^[0-9]{8,15}$'
      );
  end if;
end $$;

-- Battement de présence : le joueur connecté met à jour
-- sa propre date d'activité. Aucune autre écriture possible.
create or replace function public.touch_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  update public.profiles
  set last_seen_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;
